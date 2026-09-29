import { EventEmitter } from 'events';
import { ELM327Commander } from './elm327Commander';
import { PID_MAP, POLLING_FAST, POLLING_NORMAL, POLLING_SLOW } from './pidCatalog';
import { DTC_CATALOG } from './dtcCatalog.generated';
import { parseDTCResponse, parsePIDData, parsePIDMessages } from './obdParsers';
import { PIDReading, DTCCode, DTCType, DTCStatus, LogLevel } from '../shared/types';

// ─── OBDProtocolManager ───────────────────────────────────────────────────────
//
// The ELM327 is a single-command-at-a-time device. This manager runs a sequential
// polling loop — one PID at a time — with priority-based scheduling.
// Fast PIDs get polled every cycle, normal every 3rd cycle, slow every 10th.

export class OBDProtocolManager extends EventEmitter {
  private elm: ELM327Commander;
  private pollingActive = false;
  private supportedPIDs = new Set<string>();
  // Support ranges (0x00, 0x20 … 0xE0) whose answer is known. A PID is only
  // skipped when its range was actually read, so one failed probe can't drop
  // RPM, coolant and speed for the whole session.
  private knownRanges = new Set<number>();
  private cycleCount = 0;
  private pollLoopRunning = false;
  // True between startPolling() and stopPolling(). A DTC scan / VIN read /
  // clear pauses the loop via pollingActive and only resumes it if polling is
  // still wanted — otherwise a stopPolling() (disconnect) made mid-operation
  // was undone and the loop ran forever on a dead session.
  private pollingWanted = false;

  constructor(elm: ELM327Commander) {
    super();
    this.elm = elm;
  }

  async refreshProtocol(): Promise<string> {
    const protocol = await this.elm.readProtocol();
    this.log(`Protocol refreshed: ${protocol}`);
    return protocol;
  }

  async readVIN(): Promise<string | null> {
    const wasPolling = this.pollingActive;
    this.pollingActive = false;
    await this.sleep(300);

    const vin = await this.elm.readVIN();
    this.log(vin ? `VIN read: ${vin}` : 'VIN not available from ECM');

    if (wasPolling && this.pollingWanted) {
      this.pollingActive = true;
      this.runPollLoop();
    }
    return vin;
  }

  // ── Discover which PIDs the vehicle supports ─────────────────────────────────
  // 0100 answers for PIDs 01–20, 0120 for 21–40, and so on up to 01E0. The last
  // bit of each mask says whether the next range exists. Masks from every ECU
  // that answers are merged, since the TCM supports PIDs the ECM doesn't.
  async discoverSupportedPIDs(): Promise<Set<string>> {
    for (let base = 0x00; base <= 0xE0; base += 0x20) {
      const rangePID = '01' + hex2(base);
      const resp = await this.elm.send(rangePID, 3000);
      const masks = resp.success ? parsePIDMessages(rangePID, resp.raw).filter(b => b.length >= 4) : [];
      if (masks.length === 0) {
        // Unknown, not unsupported: PIDs in this range are still polled
        this.log(`PID support ${rangePID} not answered — polling its PIDs anyway`, 'warn');
        continue;
      }

      const mask = masks.reduce((acc, b) => (acc | (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0, 0);
      this.knownRanges.add(base);
      for (let bit = 0; bit < 32; bit++) {
        if (mask & (1 << (31 - bit))) this.supportedPIDs.add('01' + hex2(base + bit + 1));
      }
      this.log(`PID support ${rangePID}: ${mask.toString(16).padStart(8, '0')} — found ${this.supportedPIDs.size} so far`);

      if (!(mask & 1)) {
        // No later ranges: everything above is known to be unsupported
        for (let b = base + 0x20; b <= 0xE0; b += 0x20) this.knownRanges.add(b);
        break;
      }
    }

    this.log(`Discovery complete — ${this.supportedPIDs.size} supported PIDs`);
    return this.supportedPIDs;
  }

  private isSkippable(pid: string): boolean {
    if (!pid.startsWith('01')) return false;
    const n = parseInt(pid.substring(2), 16);
    const range = ((n - 1) >> 5) << 5;
    return this.knownRanges.has(range) && !this.supportedPIDs.has(pid);
  }

  // ── Start the sequential polling loop ────────────────────────────────────────
  startPolling(): void {
    if (this.pollingActive) return;
    this.pollingWanted = true;
    this.pollingActive = true;
    this.cycleCount = 0;
    this.log('Sequential polling loop starting');
    this.runPollLoop();
  }

  stopPolling(): void {
    this.pollingWanted = false;
    this.pollingActive = false;
    this.log('Polling stopped');
  }

  // ── The main sequential poll loop ──────────────────────────────────────────
  //
  // Each cycle:
  //   1. Always: read battery voltage (ATRV) — the most critical signal
  //   2. Always: poll FAST PIDs (RPM, ECM voltage)
  //   3. Every 3rd cycle: poll NORMAL PIDs (temps, trims, throttle, etc.)
  //   4. Every 10th cycle: poll SLOW PIDs (fuel level, oil temp, etc.)
  //
  // This ensures commands never overlap on the serial line.

  private async runPollLoop(): Promise<void> {
    if (this.pollLoopRunning) return;
    this.pollLoopRunning = true;

    while (this.pollingActive) {
      try {
        // 1. Battery voltage — always, every cycle
        await this.pollBatteryVoltage();

        // 2. Fast PIDs — every cycle
        await this.pollPIDList(POLLING_FAST);

        // 3. Normal PIDs — every 3rd cycle
        if (this.cycleCount % 3 === 0) {
          await this.pollPIDList(POLLING_NORMAL);
        }

        // 4. Slow PIDs — every 10th cycle
        if (this.cycleCount % 10 === 0) {
          await this.pollPIDList(POLLING_SLOW);
        }

        this.cycleCount++;
      } catch (err) {
        // Log but don't crash the loop
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`Poll cycle error: ${msg}`);
      }

      // Minimal yield — serial roundtrip is the real bottleneck (~50-200ms/PID)
      await this.sleep(1);
    }

    this.pollLoopRunning = false;
  }

  // ── Poll battery voltage (ATRV — AT command, not an OBD PID) ─────────────────
  private async pollBatteryVoltage(): Promise<void> {
    if (!this.pollingActive) return;
    try {
      const voltage = await this.elm.readBatteryVoltage();
      if (voltage > 0) {
        const reading: PIDReading = {
          pid: 'ATRV',
          value: voltage,
          raw: [],
          timestamp: Date.now(),
          unit: 'V',
        };
        this.emit('pid-reading', reading);
      }
    } catch (err) {
      // Non-fatal — retry next cycle, but breadcrumb the failure (QLT-001).
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`Battery voltage read failed: ${msg}`);
    }
  }

  // ── Poll a list of PIDs sequentially ─────────────────────────────────────────
  // Skips PIDs the ECM reported as unsupported (when discovery succeeded) so
  // no bus time is wasted on guaranteed NO DATA responses.
  private async pollPIDList(pids: string[]): Promise<void> {
    for (const pid of pids) {
      if (!this.pollingActive) break;
      if (this.isSkippable(pid)) continue;
      await this.pollSinglePID(pid);
    }
  }

  private async pollSinglePID(pid: string): Promise<void> {
    const definition = PID_MAP.get(pid);
    if (!definition) return;

    try {
      const resp = await this.elm.send(pid, 800);

      if (!resp.success) return;
      if (resp.raw.includes('NO DATA') || resp.raw.includes('UNABLE TO CONNECT')) return;

      const bytes = parsePIDData(pid, resp.raw);
      if (!bytes) return;

      const value = definition.decode(bytes);

      const reading: PIDReading = {
        pid,
        value,
        raw: bytes,
        timestamp: Date.now(),
        unit: definition.unit,
      };

      this.emit('pid-reading', reading);
    } catch (err) {
      // Individual PID failure — non-fatal, but breadcrumb so a systemic
      // decode bug doesn't hide behind dozens of silent skips (QLT-001).
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`PID ${pid} poll failed: ${msg}`);
    }
  }

  // ── DTC Scanning — Mode 03 (stored), Mode 07 (pending), Mode 0A (permanent) ──
  // Returns null when any mode got no real answer (timeout, key off, bus
  // error). A failed scan must not be reported as "no codes": that would wipe
  // the list and show a car with a stored P0300 as clean.
  async scanDTCs(): Promise<DTCCode[] | null> {
    // Pause polling during DTC scan to avoid command collision
    const wasPolling = this.pollingActive;
    this.pollingActive = false;

    // Wait for current poll cycle to finish
    await this.sleep(300);

    const results: DTCCode[] = [];
    const failed: string[] = [];

    const modes: Array<{ mode: string; status: DTCStatus }> = [
      { mode: '03', status: 'active' },
      { mode: '07', status: 'pending' },
      { mode: '0A', status: 'permanent' },
    ];

    for (const { mode, status } of modes) {
      const resp = await this.elm.send(mode, 5000);
      const parsed = parseDTCResponse(mode, resp.success ? resp.raw : '');
      if (!parsed.ok) {
        failed.push(mode);
        this.log(`DTC scan mode ${mode} got no answer: ${resp.errorMessage ?? (resp.raw.trim() || 'timeout')}`, 'warn');
        continue;
      }
      results.push(...parsed.codes.map(code => this.toDTC(code, status)));
    }

    this.log(failed.length
      ? `DTC scan failed (no answer to mode ${failed.join(', ')}) — codes on screen left unchanged`
      : `DTC scan complete — ${results.length} codes found`, failed.length ? 'warn' : 'info');

    // Resume polling
    if (wasPolling && this.pollingWanted) {
      this.pollingActive = true;
      this.runPollLoop();
    }

    return failed.length ? null : results;
  }

  private toDTC(code: string, status: DTCStatus): DTCCode {
    return {
      code,
      type: code[0] as DTCType,
      status,
      description: this.getDTCDescription(code),
      likelyCauses: this.getDTCCauses(code),
      repairSummary: this.getDTCRepair(code),
      module: this.getDTCModule(code),
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };
  }

  // ── Utilities ──────────────────────────────────────────────────────────────────
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(msg: string, level: LogLevel = 'info'): void {
    this.emit('log', { timestamp: Date.now(), level, message: msg });
  }

  // ── Catalog lookups — backed by dtcCatalog.generated.ts ─────────────────────
  private getDTCDescription(code: string): string {
    return DTC_CATALOG[code]?.description ?? `${code} — refer to factory service manual`;
  }

  private getDTCCauses(code: string): string[] {
    return DTC_CATALOG[code]?.causes ?? ['Refer to factory service manual for this vehicle'];
  }

  private getDTCRepair(code: string): string {
    return DTC_CATALOG[code]?.repair ?? 'Refer to factory service manual and perform circuit testing per diagnostic chart.';
  }

  private getDTCModule(code: string): string {
    const explicit = DTC_CATALOG[code]?.module;
    if (explicit) return explicit;
    if (code.startsWith('B')) return 'BCM/IPC';
    if (code.startsWith('U')) return 'Network';
    if (code.startsWith('C')) return 'ABS/EBCM';
    return 'PCM';
  }
}

const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');
