import { EventEmitter } from 'events';
import { ELM327Commander } from './elm327Commander';
import { PID_MAP, POLLING_FAST, POLLING_NORMAL, POLLING_SLOW } from './pidCatalog';
import { PIDReading, DTCCode, DTCType, DTCStatus } from '../shared/types';

// ─── OBDProtocolManager ───────────────────────────────────────────────────────
//
// The ELM327 is a single-command-at-a-time device. This manager runs a sequential
// polling loop — one PID at a time — with priority-based scheduling.
// Fast PIDs get polled every cycle, normal every 5th cycle, slow every 20th.

export class OBDProtocolManager extends EventEmitter {
  private elm: ELM327Commander;
  private pollingActive = false;
  private supportedPIDs = new Set<string>();
  private cycleCount = 0;
  private pollLoopRunning = false;

  constructor(elm: ELM327Commander) {
    super();
    this.elm = elm;
  }

  // ── Discover which PIDs the ECM supports ─────────────────────────────────────
  async discoverSupportedPIDs(): Promise<Set<string>> {
    const supportRanges = ['0100', '0120', '0140', '0160'];

    for (const rangePID of supportRanges) {
      try {
        const resp = await this.elm.send(rangePID, 3000);
        if (!resp.success) continue;

        const bytes = this.elm.parsePIDResponse(rangePID, resp.raw);
        if (!bytes || bytes.length < 4) continue;

        const bitmask = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
        const baseHex = parseInt(rangePID.substring(2), 16);

        for (let bit = 0; bit < 32; bit++) {
          if (bitmask & (1 << (31 - bit))) {
            const pid = '01' + (baseHex + bit + 1).toString(16).toUpperCase().padStart(2, '0');
            this.supportedPIDs.add(pid);
          }
        }

        this.log(`PID support ${rangePID}: ${bytes.map(b => b.toString(16).padStart(2, '0')).join('')} — found ${this.supportedPIDs.size} so far`);
      } catch {
        // Some ranges may not be supported — continue
      }
    }

    this.log(`Discovery complete — ${this.supportedPIDs.size} supported PIDs`);
    return this.supportedPIDs;
  }

  // ── Start the sequential polling loop ────────────────────────────────────────
  startPolling(): void {
    if (this.pollingActive) return;
    this.pollingActive = true;
    this.cycleCount = 0;
    this.log('Sequential polling loop starting');
    this.runPollLoop();
  }

  stopPolling(): void {
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

      // Brief yield to prevent starving the event loop
      await this.sleep(20);
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
    } catch {
      // Non-fatal — retry next cycle
    }
  }

  // ── Poll a list of PIDs sequentially ─────────────────────────────────────────
  // Skips PIDs the ECM reported as unsupported (when discovery succeeded) so
  // no bus time is wasted on guaranteed NO DATA responses.
  private async pollPIDList(pids: string[]): Promise<void> {
    for (const pid of pids) {
      if (!this.pollingActive) break;
      if (this.supportedPIDs.size > 0 && !this.supportedPIDs.has(pid)) continue;
      await this.pollSinglePID(pid);
    }
  }

  private async pollSinglePID(pid: string): Promise<void> {
    const definition = PID_MAP.get(pid);
    if (!definition) return;

    try {
      const resp = await this.elm.send(pid, 1500);

      if (!resp.success) return;
      if (resp.raw.includes('NO DATA') || resp.raw.includes('UNABLE TO CONNECT')) return;

      const bytes = this.elm.parsePIDResponse(pid, resp.raw);
      if (!bytes || bytes.length === 0) return;

      const value = definition.decode(bytes);

      const reading: PIDReading = {
        pid,
        value,
        raw: bytes,
        timestamp: Date.now(),
        unit: definition.unit,
      };

      this.emit('pid-reading', reading);
    } catch {
      // Individual PID failure — non-fatal, continue with next PID
    }
  }

  // ── DTC Scanning — Mode 03 (stored), Mode 07 (pending), Mode 0A (permanent) ──
  async scanDTCs(): Promise<DTCCode[]> {
    // Pause polling during DTC scan to avoid command collision
    const wasPolling = this.pollingActive;
    this.pollingActive = false;

    // Wait for current poll cycle to finish
    await this.sleep(300);

    const results: DTCCode[] = [];

    const modes: Array<{ mode: string; status: DTCStatus }> = [
      { mode: '03', status: 'active' },
      { mode: '07', status: 'pending' },
      { mode: '0A', status: 'permanent' },
    ];

    for (const { mode, status } of modes) {
      try {
        const resp = await this.elm.send(mode, 5000);
        const dtcs = this.parseDTCResponse(mode, resp.raw, status);
        results.push(...dtcs);
      } catch {
        // Mode may not be supported on this vehicle
      }
    }

    this.log(`DTC scan complete — ${results.length} codes found`);

    // Resume polling
    if (wasPolling) {
      this.pollingActive = true;
      this.runPollLoop();
    }

    return results;
  }

  // ── Parse DTC response bytes into DTCCode objects ─────────────────────────────
  private parseDTCResponse(mode: string, raw: string, status: DTCStatus): DTCCode[] {
    const clean = raw.replace(/\s+/g, '').toUpperCase();
    const dtcs: DTCCode[] = [];

    // Response header is mode + 0x40: mode 03 → 43, mode 07 → 47, mode 0A → 4A
    const header = (parseInt(mode, 16) + 0x40).toString(16).toUpperCase();
    const idx = clean.indexOf(header);
    if (idx === -1) return dtcs;

    const data = clean.substring(idx + 2);

    for (let i = 0; i < data.length - 3; i += 4) {
      const word = data.substring(i, i + 4);
      if (word === '0000') continue;

      const firstNibble = parseInt(word[0], 16);
      const typeMap: { [k: number]: DTCType } = { 0: 'P', 1: 'C', 2: 'B', 3: 'U' };
      const type: DTCType = typeMap[firstNibble >> 2] ?? 'P';
      const remaining = ((firstNibble & 0x03).toString() + word.substring(1)).toUpperCase();
      const code = `${type}${remaining}`;

      dtcs.push({
        code,
        type,
        status,
        description: this.getDTCDescription(code),
        likelyCauses: this.getDTCCauses(code),
        repairSummary: this.getDTCRepair(code),
        module: this.getDTCModule(code),
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      });
    }

    return dtcs;
  }

  // ── Clear all stored DTCs — Mode 04 ──────────────────────────────────────────
  async clearDTCs(): Promise<boolean> {
    const wasPolling = this.pollingActive;
    this.pollingActive = false;
    await this.sleep(300);

    const resp = await this.elm.send('04', 5000);
    const success = resp.success && !resp.raw.includes('ERROR');
    this.log(success ? 'DTC codes cleared successfully' : 'Failed to clear DTC codes');

    if (wasPolling) {
      this.pollingActive = true;
      this.runPollLoop();
    }

    return success;
  }

  // ── Utilities ──────────────────────────────────────────────────────────────────
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(msg: string): void {
    this.emit('log', { timestamp: Date.now(), level: 'info', message: msg });
  }

  // ── Built-in DTC database (common SAE J2012 + GM codes) ──────────────────────
  private getDTCDescription(code: string): string {
    return DTC_DB[code]?.description ?? `${code} — refer to factory service manual`;
  }

  private getDTCCauses(code: string): string[] {
    return DTC_DB[code]?.causes ?? ['Refer to factory service manual for this vehicle'];
  }

  private getDTCRepair(code: string): string {
    return DTC_DB[code]?.repair ?? 'Refer to factory service manual and perform circuit testing per diagnostic chart.';
  }

  private getDTCModule(code: string): string {
    if (code.startsWith('B')) return 'BCM/IPC';
    if (code.startsWith('U')) return 'Network';
    if (code.startsWith('C')) return 'ABS/EBCM';
    return 'PCM';
  }
}

// ─── DTC knowledge base — one record per code ─────────────────────────────────
interface DTCInfo { description: string; causes?: string[]; repair?: string; }

const DTC_DB: { [code: string]: DTCInfo } = {
  'B1982': {
    description: 'Instrument Cluster — loss of Class II serial data from Body Control Module',
    causes: ['Class II bus disruption or high resistance', 'Ground integrity at Instrument Cluster connector C2', 'Battery circuit draw keeping bus awake', 'Faulty Body Control Module'],
    repair: 'Inspect Class II bus wiring. Check Instrument Cluster connector C2 ground. Test firewall-to-engine ground strap resistance — target below 0.1 Ω. Check TBC BATT fuse circuit for parasitic draw.',
  },
  'P0300': {
    description: 'Random / multiple cylinder misfire detected',
    causes: ['Worn or fouled spark plugs', 'Failed ignition coils or wires', 'Lean fuel trim amplifying misfires (P0171/P0174)', 'Low fuel pressure'],
    repair: 'Inspect and replace spark plugs. Inspect ignition wires and coil packs. Address fuel trim lean condition first.',
  },
  'P0171': {
    description: 'Fuel system lean — Bank 1',
    causes: ['Vacuum leak at intake manifold gasket', 'Dirty or failed Mass Air Flow sensor', 'Evaporative Emission Control purge valve stuck open', 'Low fuel pressure'],
    repair: 'Check all intake manifold gaskets and vacuum lines for leaks. Clean or replace Mass Air Flow sensor. Test Evaporative Emission Control purge valve.',
  },
  'U0100': {
    description: 'Lost communication with Engine Control Module on the data bus',
    causes: ['Body Control Module or Instrument Cluster preventing bus sleep', 'Faulty ground strap at firewall', 'Wiring fault on the data bus'],
    repair: 'Diagnose bus parasitic draw first. Inspect Instrument Cluster and Body Control Module circuits.',
  },
  'B0429': { description: 'Heated seat module — driver seat temperature fault' },
  'P0301': { description: 'Cylinder 1 misfire detected' },
  'P0302': { description: 'Cylinder 2 misfire detected' },
  'P0174': { description: 'Fuel system lean — Bank 2' },
  'P0446': { description: 'Evaporative Emission Control vent control circuit fault' },
  'P0442': { description: 'Evaporative Emission Control system — small leak detected' },
  'P0449': { description: 'Evaporative Emission Control vent solenoid circuit fault' },
  'P0128': { description: 'Coolant temperature below thermostat regulating temperature' },
  'P0420': { description: 'Catalyst efficiency below threshold — Bank 1' },
  'P0430': { description: 'Catalyst efficiency below threshold — Bank 2' },
  'U1000': { description: 'Class II communication fault — general bus error' },
  'C0265': { description: 'Anti-lock Brake Control Module relay circuit fault' },
  'P0741': { description: 'Torque converter clutch circuit — stuck off' },
  'P0753': { description: 'Shift solenoid A — electrical fault' },
  'P0758': { description: 'Shift solenoid B — electrical fault' },
};
