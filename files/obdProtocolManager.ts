import { EventEmitter } from 'events';
import { ELM327Commander } from './elm327Commander';
import { PID_MAP, POLLING_FAST, POLLING_NORMAL, POLLING_SLOW } from './pidCatalog';
import { PIDReading, DTCCode, DTCType, DTCStatus } from '../shared/types';

// ─── OBDProtocolManager ───────────────────────────────────────────────────────

export class OBDProtocolManager extends EventEmitter {
  private elm: ELM327Commander;
  private pollingActive = false;
  private fastTimer: ReturnType<typeof setInterval> | null = null;
  private normalTimer: ReturnType<typeof setInterval> | null = null;
  private slowTimer: ReturnType<typeof setInterval> | null = null;
  private atrvTimer: ReturnType<typeof setInterval> | null = null;
  private supportedPIDs = new Set<string>();

  constructor(elm: ELM327Commander) {
    super();
    this.elm = elm;
  }

  // ── Discover which PIDs the ECM supports ─────────────────────────────────────
  async discoverSupportedPIDs(): Promise<Set<string>> {
    // OBD-II PID support is reported in four 32-bit bitmasks
    const supportRanges = ['0100', '0120', '0140', '0160'];

    for (const rangePID of supportRanges) {
      try {
        const resp = await this.elm.send(rangePID, 2000);
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
      } catch {
        // Some ranges may not be supported — continue
      }
    }

    this.emit('log', { level: 'info', message: `Discovered ${this.supportedPIDs.size} supported PIDs` });
    return this.supportedPIDs;
  }

  // ── Start polling all three priority tiers ────────────────────────────────────
  startPolling(fastMs = 100, normalMs = 500, slowMs = 2000): void {
    if (this.pollingActive) return;
    this.pollingActive = true;

    // Battery voltage — separate 500ms cycle (always polled, critical for parasitic draw)
    this.atrvTimer = setInterval(async () => {
      const voltage = await this.elm.readBatteryVoltage();
      const reading: PIDReading = {
        pid: 'ATRV',
        value: voltage,
        raw: [],
        timestamp: Date.now(),
        unit: 'V',
      };
      this.emit('pid-reading', reading);
    }, normalMs);

    // Fast tier — safety-critical PIDs (RPM, ECM voltage)
    this.fastTimer = setInterval(() => this.pollPIDList(POLLING_FAST), fastMs);

    // Normal tier — standard telemetry
    this.normalTimer = setInterval(() => this.pollPIDList(POLLING_NORMAL), normalMs);

    // Slow tier — background / supplemental
    this.slowTimer = setInterval(() => this.pollPIDList(POLLING_SLOW), slowMs);

    this.emit('log', { level: 'info', message: `PID polling started — fast:${fastMs}ms normal:${normalMs}ms slow:${slowMs}ms` });
  }

  stopPolling(): void {
    this.pollingActive = false;
    [this.fastTimer, this.normalTimer, this.slowTimer, this.atrvTimer].forEach(t => {
      if (t) clearInterval(t);
    });
    this.fastTimer = null;
    this.normalTimer = null;
    this.slowTimer = null;
    this.atrvTimer = null;
    this.emit('log', { level: 'info', message: 'PID polling stopped' });
  }

  // ── Poll a list of PIDs sequentially ─────────────────────────────────────────
  private async pollPIDList(pids: string[]): Promise<void> {
    if (!this.pollingActive) return;

    for (const pid of pids) {
      if (!this.pollingActive) break;
      try {
        await this.pollSinglePID(pid);
      } catch {
        // Individual PID failures are non-fatal
      }
    }
  }

  private async pollSinglePID(pid: string): Promise<void> {
    const definition = PID_MAP.get(pid);
    if (!definition) return;

    const resp = await this.elm.send(pid, 1000);
    if (!resp.success || resp.raw.includes('NO DATA')) return;

    const bytes = this.elm.parsePIDResponse(pid, resp.raw);
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
  }

  // ── DTC Scanning — Mode 03 (stored), Mode 07 (pending), Mode 0A (permanent) ──
  async scanDTCs(): Promise<DTCCode[]> {
    const results: DTCCode[] = [];

    const modes: Array<{ mode: string; status: DTCStatus }> = [
      { mode: '03', status: 'active' },
      { mode: '07', status: 'pending' },
      { mode: '0A', status: 'permanent' },
    ];

    for (const { mode, status } of modes) {
      try {
        const resp = await this.elm.send(mode, 3000);
        const dtcs = this.parseDTCResponse(resp.raw, status);
        results.push(...dtcs);
      } catch {
        // Mode may not be supported
      }
    }

    this.emit('log', {
      level: results.length > 0 ? 'warn' : 'ok',
      message: `DTC scan complete — ${results.length} codes found`,
    });

    return results;
  }

  // ── Parse DTC response bytes into DTCCode objects ─────────────────────────────
  private parseDTCResponse(raw: string, status: DTCStatus): DTCCode[] {
    const clean = raw.replace(/\s+/g, '').toUpperCase();
    const dtcs: DTCCode[] = [];

    // Mode 03 response header: 43 XX XX XX ...
    // Each DTC is 2 bytes: first nibble encodes type, remaining 4 nibbles are code number
    const idx = clean.indexOf('43');
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
    const resp = await this.elm.send('04', 3000);
    const success = resp.success && !resp.raw.includes('ERROR');
    this.emit('log', {
      level: success ? 'ok' : 'error',
      message: success ? 'DTC codes cleared successfully' : 'Failed to clear DTC codes',
    });
    return success;
  }

  // ── Module wake check — poll a module address on the Class II bus ─────────────
  async checkModuleAlive(addressHex: string): Promise<boolean> {
    // Send a keep-alive / tester-present to the module address
    const resp = await this.elm.send(`01 3E`, 500);
    return resp.success && !resp.raw.includes('NO DATA');
  }

  // ── Built-in DTC database (GMT800 / SAE J2012 common codes) ──────────────────
  private getDTCDescription(code: string): string {
    const db: { [code: string]: string } = {
      'B1982': 'Instrument Cluster — loss of Class II serial data from Body Control Module',
      'B0429': 'Heated seat module — driver seat temperature fault',
      'P0300': 'Random / multiple cylinder misfire detected',
      'P0301': 'Cylinder 1 misfire detected',
      'P0302': 'Cylinder 2 misfire detected',
      'P0171': 'Fuel system lean — Bank 1',
      'P0174': 'Fuel system lean — Bank 2',
      'P0446': 'Evaporative Emission Control vent control circuit fault',
      'P0442': 'Evaporative Emission Control system — small leak detected',
      'P0449': 'Evaporative Emission Control vent solenoid circuit fault',
      'P0128': 'Coolant temperature below thermostat regulating temperature',
      'P0420': 'Catalyst efficiency below threshold — Bank 1',
      'P0430': 'Catalyst efficiency below threshold — Bank 2',
      'U0100': 'Lost communication with Engine Control Module on Class II bus',
      'U1000': 'Class II communication fault — general bus error',
      'C0265': 'Anti-lock Brake Control Module relay circuit fault',
      'P0741': 'Torque converter clutch circuit — stuck off',
      'P0753': 'Shift solenoid A — electrical fault',
      'P0758': 'Shift solenoid B — electrical fault',
    };
    return db[code] ?? `${code} — refer to factory service manual`;
  }

  private getDTCCauses(code: string): string[] {
    const db: { [code: string]: string[] } = {
      'B1982': ['Class II bus disruption or high resistance', 'Ground integrity at Instrument Cluster connector C2', 'Battery circuit draw keeping bus awake', 'Faulty Body Control Module'],
      'P0300': ['Worn or fouled spark plugs', 'Failed ignition coils or wires', 'Lean fuel trim amplifying misfires (P0171/P0174)', 'Low fuel pressure'],
      'P0171': ['Vacuum leak at intake manifold gasket', 'Dirty or failed Mass Air Flow sensor', 'Evaporative Emission Control purge valve stuck open', 'Low fuel pressure'],
      'U0100': ['Body Control Module or Instrument Cluster preventing bus sleep', 'Faulty ground strap at firewall', 'Wiring fault on Class II bus line'],
    };
    return db[code] ?? ['Refer to factory service manual for this vehicle'];
  }

  private getDTCRepair(code: string): string {
    const db: { [code: string]: string } = {
      'B1982': 'Inspect Class II bus wiring. Check Instrument Cluster connector C2 ground. Test firewall-to-engine ground strap resistance — target below 0.1 Ω. Check TBC BATT fuse circuit for parasitic draw.',
      'P0300': 'Inspect and replace spark plugs (AC Delco 41-962). Inspect ignition wires and coil packs. Address fuel trim lean condition first.',
      'P0171': 'Check all intake manifold gaskets and vacuum lines for leaks. Clean or replace Mass Air Flow sensor. Test Evaporative Emission Control purge valve.',
      'U0100': 'Diagnose Class II bus parasitic draw first. Inspect Instrument Cluster and Body Control Module circuits.',
    };
    return db[code] ?? 'Refer to factory service manual and perform circuit testing per diagnostic chart.';
  }

  private getDTCModule(code: string): string {
    if (code.startsWith('B')) return 'BCM/IPC';
    if (code.startsWith('U')) return 'Network';
    if (code.startsWith('C')) return 'ABS/EBCM';
    return 'PCM';
  }
}
