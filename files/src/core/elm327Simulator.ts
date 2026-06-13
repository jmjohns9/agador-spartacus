import { EventEmitter } from 'events';

// ─── ELM327 Simulator ─────────────────────────────────────────────────────────
// Emulates a 2004 Silverado 1500 Z71 J1850 VPW session.
// Battery voltage steps from 12.6 V → 11.8 V over 4 hours.
// IPC stays awake after engine-off (reproducing the known GMT800 bug).
// Pre-loaded DTCs: B1982, P0300, U0100.

export class ELM327Simulator extends EventEmitter {
  private sessionStartMs = Date.now();
  private engineOff = false;
  private engineOffMs = 0;
  private dtcsCleared = false;   // Mode 04 wipes stored/pending codes

  // Simulated sensor state
  private state = {
    rpm: 820,
    speed: 0,
    coolantTempC: 92,   // 198 °F
    oilTempC: 90,       // 194 °F
    iatC: 27,           // 80 °F
    ambientC: 20,       // 68 °F
    throttle: 15,
    engineLoad: 18,
    stftB1: 4.7,
    ltftB1: 8.2,
    stftB2: 5.1,
    ltftB2: 7.9,
    maf: 4.8,
    map: 99,            // kPa
    fuelLevel: 62,
    o2B1S1: 0.72,
    o2B1S2: 0.68,
    o2B2S1: 0.70,
    o2B2S2: 0.65,
    voltage: 12.71,     // Drops over time with engine off
    fuelRailKpa: 386,   // 56 psi
    timingAdv: 8.0,
    egrCmd: 0,
    egrError: 12,
  };

  // ── Encode a PID response as ELM327 would return it ──────────────────────────
  respond(command: string): string {
    const cmd = command.trim().toUpperCase().replace(/\s+/g, '');

    // AT commands
    if (cmd === 'ATZ')    return 'ELM327 v1.5\r\r>';
    if (cmd === 'ATE0')   return 'OK\r\r>';
    if (cmd === 'ATL0')   return 'OK\r\r>';
    if (cmd === 'ATH0')   return 'OK\r\r>';
    if (cmd === 'ATS0')   return 'OK\r\r>';
    if (cmd === 'ATSP0')  return 'OK\r\r>';
    if (cmd === 'ATAT1')  return 'OK\r\r>';
    if (cmd === 'ATDP')   return 'SAE J1850 VPW\r\r>';
    if (cmd === 'STI')    return 'OBDLink MX+ v4.9.1\r\r>';
    if (cmd === 'STDI')   return 'OBDLink MX+ (c) 2023 ScanTool.net\r\r>';
    if (cmd === 'ATRV')   return `${this.getBatteryVoltage().toFixed(2)}V\r\r>`;
    if (cmd === '04')     { this.dtcsCleared = true; return 'OK\r\r>'; }

    // PID support bitmasks
    if (cmd === '0100') return '4100BE3EB811\r\r>';
    if (cmd === '0120') return '4120A005B011\r\r>';
    if (cmd === '0140') return '4140FED09081\r\r>';

    // DTC words encode type in the top 2 bits of the first nibble:
    // B1982 → 9982, P0300 → 0300, U0100 → C100
    // Mode 03 (stored): B1982 + P0300
    if (cmd === '03') return this.dtcsCleared ? '430000\r\r>' : '4399820300\r\r>';

    // Mode 07 (pending): U0100
    if (cmd === '07') return this.dtcsCleared ? '470000\r\r>' : '47C1000000\r\r>';

    // Mode 0A (permanent) — none
    if (cmd === '0A') return '4A0000\r\r>';

    // Keep-alive / tester present
    if (cmd === '013E') return '7E00\r\r>';

    // OBD PIDs
    const pidMap: { [cmd: string]: () => string } = {
      '010C': () => this.encodeRPM(),
      '010D': () => `410D${this.hex1(this.state.speed)}\r\r>`,
      '0105': () => `4105${this.hex1(this.state.coolantTempC + 40)}\r\r>`,
      '015C': () => `415C${this.hex1(this.state.oilTempC + 40)}\r\r>`,
      '010F': () => `410F${this.hex1(this.state.iatC + 40)}\r\r>`,
      '0146': () => `4146${this.hex1(this.state.ambientC + 40)}\r\r>`,
      '0111': () => `4111${this.hex1(Math.round((this.state.throttle / 100) * 255))}\r\r>`,
      '0104': () => `4104${this.hex1(Math.round((this.state.engineLoad / 100) * 255))}\r\r>`,
      '0106': () => `4106${this.encodeTrim(this.state.stftB1)}\r\r>`,
      '0107': () => `4107${this.encodeTrim(this.state.ltftB1)}\r\r>`,
      '0108': () => `4108${this.encodeTrim(this.state.stftB2)}\r\r>`,
      '0109': () => `4109${this.encodeTrim(this.state.ltftB2)}\r\r>`,
      '010B': () => `410B${this.hex1(this.state.map)}\r\r>`,
      '0110': () => `4110${this.encodeMAF()}\r\r>`,
      '012F': () => `412F${this.hex1(Math.round((this.state.fuelLevel / 100) * 255))}\r\r>`,
      '0114': () => `4114${this.hex1(Math.round(this.state.o2B1S1 * 200))}FF\r\r>`,
      '0115': () => `4115${this.hex1(Math.round(this.state.o2B1S2 * 200))}FF\r\r>`,
      '0118': () => `4118${this.hex1(Math.round(this.state.o2B2S1 * 200))}FF\r\r>`,
      '0119': () => `4119${this.hex1(Math.round(this.state.o2B2S2 * 200))}FF\r\r>`,
      '0142': () => `4142${this.encodeVolt(this.state.voltage)}\r\r>`,
      '0123': () => `4123${this.encode2(Math.round(this.state.fuelRailKpa / 10))}\r\r>`,
      '010E': () => `410E${this.hex1(Math.round((this.state.timingAdv + 64) * 2))}\r\r>`,
      '012C': () => `412C${this.hex1(Math.round((this.state.egrCmd / 100) * 255))}\r\r>`,
      '012D': () => `412D${this.encodeTrim(this.state.egrError)}\r\r>`,
      '0133': () => `4133${this.hex1(101)}\r\r>`,    // 101 kPa ≈ sea level
      '015E': () => `415E${this.encode2(Math.round(0.4 * 20))}\r\r>`,
      '01A4': () => `41A400\r\r>`,   // Park
    };

    const fn = pidMap[cmd];
    if (fn) {
      this.jitter();
      return fn();
    }

    return 'NO DATA\r\r>';
  }

  // ── Slowly drain the battery over time (simulates parasitic draw) ─────────────
  private getBatteryVoltage(): number {
    const elapsedMin = (Date.now() - this.sessionStartMs) / 60000;
    // Drop from 12.89 V at 4 mV/min, accelerating after 15 min (IPC rogue draw)
    const drift = elapsedMin * 0.004 + (elapsedMin > 15 ? (elapsedMin - 15) * 0.001 : 0);
    return Math.max(11.8, 12.89 - drift + this.noise(0.005));
  }

  setEngineOff(): void {
    this.engineOff = true;
    this.engineOffMs = Date.now();
    this.state.rpm = 0;
    this.state.speed = 0;
  }

  setEngineOn(): void {
    this.engineOff = false;
    this.state.rpm = 820;
  }

  // ── Encoding helpers ──────────────────────────────────────────────────────────
  private hex1(v: number): string { return Math.min(255, Math.max(0, Math.round(v))).toString(16).toUpperCase().padStart(2, '0'); }
  private encode2(v: number): string { const n = Math.min(65535, Math.max(0, Math.round(v))); return ((n >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0') + (n & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
  private encodeTrim(pct: number): string { return this.hex1(Math.round((pct / 100) * 128 + 128)); }
  private encodeMAF(): string { const raw = Math.round(this.state.maf * 100); return this.encode2(raw); }
  private encodeVolt(v: number): string { return this.encode2(Math.round(v * 1000)); }
  private encodeRPM(): string { const raw = Math.round(this.state.rpm * 4); return `410C${this.encode2(raw)}\r\r>`; }

  private jitter(): void {
    this.state.rpm = Math.max(0, this.state.rpm + this.noise(20));
    this.state.stftB1 += this.noise(0.2);
    this.state.ltftB1 = Math.min(25, this.state.ltftB1 + this.noise(0.05));
    this.state.o2B1S1 = Math.max(0.1, Math.min(0.9, this.state.o2B1S1 + this.noise(0.08)));
  }

  private noise(amplitude: number): number { return (Math.random() - 0.5) * 2 * amplitude; }
}
