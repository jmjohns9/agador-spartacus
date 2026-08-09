import { EventEmitter } from 'events';

// ─── ELM327 Constants ─────────────────────────────────────────────────────────

const ELM_PROMPT   = '>';
const ELM_OK       = 'OK';
const ELM_ERROR    = 'ERROR';
const ELM_NO_DATA  = 'NO DATA';
const ELM_TIMEOUT  = 2500; // ms per command during init

// Ceiling on unterminated receive data. A legitimate multi-frame Mode 09 reply
// is a few hundred bytes, so 64 KB is far above anything real while still
// bounding a peripheral that streams without ever sending the '>' prompt.
const MAX_RECV_BUF = 64 * 1024;

// SAE J853 vehicle identification numbers are exactly 17 characters.
const VIN_LENGTH = 17;

export type ELM327Event =
  | 'ready'
  | 'protocol'
  | 'raw-response'
  | 'pid-response'
  | 'error'
  | 'disconnected';

export interface ELM327Response {
  command: string;
  raw: string;
  lines: string[];
  success: boolean;
  errorMessage?: string;
}

export interface AdapterInfo {
  firmwareVersion: string;   // e.g. 'ELM327 v1.5'
  deviceInfo: string;        // OBDLink STDI response
  voltage: string;           // ATRV reading
  protocol: string;          // ATDP response
}

// ─── ELM327Commander ──────────────────────────────────────────────────────────

export class ELM327Commander extends EventEmitter {
  private sendFn: (data: string) => void;
  private recvBuf = '';
  private pendingResolve: ((r: ELM327Response) => void) | null = null;
  private pendingCommand = '';
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private isReady = false;
  private adapterInfo: Partial<AdapterInfo> = {};

  constructor(sendFn: (data: string) => void) {
    super();
    this.sendFn = sendFn;
  }

  getAdapterInfo(): Partial<AdapterInfo> {
    return this.adapterInfo;
  }

  // ── Called by the transport layer with each chunk of incoming bytes ──────────
  onData(chunk: string): void {
    // Without this cap the buffer grows for as long as the peripheral keeps
    // talking: a hostile adapter, a wrong-baud link, or a device emitting
    // binary never produces the '>' below, and the per-command timeout only
    // clears recvBuf while a command is actually pending.
    if (this.recvBuf.length + chunk.length > MAX_RECV_BUF) {
      this.log(
        `Discarded ${this.recvBuf.length + chunk.length} bytes: no '>' prompt within ${MAX_RECV_BUF} bytes`,
        'warn',
      );
      this.recvBuf = '';
      return;
    }
    this.recvBuf += chunk;

    // ELM327 responses end with the '>' prompt
    if (this.recvBuf.includes(ELM_PROMPT)) {
      const raw = this.recvBuf.replace(/>/g, '').trim();
      this.recvBuf = '';
      this.resolveResponse(raw);
    }
  }

  // ── Connectivity probe — returns true only if the adapter sends bytes back ──
  // Tries ATZ then ATI, each with a short timeout. A non-empty, non-error reply
  // means the data path is live. Total worst case ~4.5s instead of ~30s.
  private async probeAdapter(): Promise<boolean> {
    for (const cmd of ['ATZ', 'ATI']) {
      const resp = await this.send(cmd, 2200);
      if (resp.raw && resp.raw.trim().length > 0 && !resp.errorMessage) {
        this.log(`Adapter responded to ${cmd}: ${resp.raw.trim()}`);
        return true;
      }
      this.log(`No response to ${cmd} — retrying probe`);
    }
    return false;
  }

  // ── Full ELM327 initialization sequence for 2004 Silverado J1850 VPW ───────
  async initialize(): Promise<AdapterInfo> {
    this.log('Starting ELM327 initialization sequence');

    // 0. Connectivity probe — confirm the adapter actually talks back before we
    //    waste 30s grinding through a full init against a silent link.
    //    A live ELM327 answers ATZ with its banner ("ELM327 v1.5"); a dead or
    //    non-transporting link returns nothing.
    const probe = await this.probeAdapter();
    if (!probe) {
      const msg = 'Adapter not responding — no reply to ATZ/ATI. The port opened but no data is coming back. Check the adapter connection (and, for Bluetooth on macOS, note that SPP serial may not be supported).';
      this.log(`ABORT: ${msg}`);
      throw new Error(msg);
    }

    // 1. Reset adapter — clears all previous state
    await this.send('ATZ', 3000);

    // 2. Echo off — suppress command echo in responses
    await this.sendExpect('ATE0', ELM_OK, 'Echo off failed');

    // 3. Linefeed off — cleaner parsing without \r\n
    await this.sendExpect('ATL0', ELM_OK, 'Linefeed off failed');

    // 4. Headers off — we parse raw data bytes only
    await this.sendExpect('ATH0', ELM_OK, 'Headers off failed');

    // 5. Spaces off — compact responses
    await this.sendExpect('ATS0', ELM_OK, 'Spaces off failed');

    // 6. Auto protocol detection — ELM will try all protocols
    await this.sendExpect('ATSP0', ELM_OK, 'Auto protocol failed');

    // 7. Adaptive timing level 1 — automatic response timing
    await this.sendExpect('ATAT1', ELM_OK, 'Adaptive timing failed');

    // 8. Confirm protocol by pinging a standard PID (RPM)
    //    This forces ELM327 to lock onto J1850 VPW for the Silverado
    const pingResp = await this.send('010C', 2000);
    this.log(`Protocol ping response: ${pingResp.raw}`);

    // 9. Read negotiated protocol
    const dpResp = await this.send('ATDP', 2000);
    this.adapterInfo.protocol = dpResp.lines[0] ?? 'Unknown';

    // 10. OBDLink-specific: read firmware version (STI command)
    const stiResp = await this.send('STI', 1000);
    this.adapterInfo.firmwareVersion = stiResp.lines[0] ?? 'Unknown';

    // 11. OBDLink-specific: device info (STDI)
    const stdiResp = await this.send('STDI', 1000);
    this.adapterInfo.deviceInfo = stdiResp.lines[0] ?? 'Unknown';

    // 12. Read live battery voltage
    const atrvResp = await this.send('ATRV', 1000);
    this.adapterInfo.voltage = atrvResp.lines[0] ?? '0.0V';

    this.isReady = true;
    this.log(`Initialization complete. Protocol: ${this.adapterInfo.protocol}`);
    this.emit('ready', this.adapterInfo);
    this.emit('protocol', this.adapterInfo.protocol);

    return this.adapterInfo as AdapterInfo;
  }

  async readProtocol(): Promise<string> {
    const resp = await this.send('ATDP', 2000);
    const protocol = resp.lines[0] ?? 'Unknown';
    this.adapterInfo.protocol = protocol;
    this.emit('protocol', protocol);
    return protocol;
  }

  async readVIN(): Promise<string | null> {
    const resp = await this.send('0902', 5000);
    if (!resp.success || resp.raw.includes('NO DATA') || resp.raw.includes('ERROR')) return null;
    const clean = resp.raw.replace(/[\s>]/g, '').toUpperCase();
    const header = '4902';
    const idx = clean.indexOf(header);
    if (idx === -1) return null;
    let hexPart = clean.substring(idx);
    // Mode 09 PID 02 returns multiple frames; extract ASCII bytes after each 4902XX header
    const vinBytes: number[] = [];
    const framePattern = /4902(\w{2})((?:\w{2})*)/g;
    let match: RegExpExecArray | null;
    while ((match = framePattern.exec(hexPart)) !== null) {
      const data = match[2];
      for (let i = 0; i < data.length; i += 2) {
        const byte = parseInt(data.substring(i, i + 2), 16);
        if (byte >= 0x20 && byte <= 0x7E) vinBytes.push(byte);
      }
    }
    if (vinBytes.length < 11) return null;
    // A VIN is 17 characters. Truncate before building the string: spreading an
    // adapter-sized array into String.fromCharCode overflows the argument limit.
    return vinBytes.slice(0, VIN_LENGTH).map(b => String.fromCharCode(b)).join('').trim();
  }

  // ── Send a raw AT or OBD command and wait for the prompt ─────────────────────
  // The ELM327 handles ONE command at a time. All sends are serialized through
  // a promise chain so concurrent callers (poll loop, DTC scan, UI actions)
  // can never overwrite each other's pending response.
  send(command: string, timeoutMs = ELM_TIMEOUT): Promise<ELM327Response> {
    const run = (): Promise<ELM327Response> => this.dispatch(command, timeoutMs);
    const p = this.sendChain.then(run, run);
    // Keep the chain alive regardless of individual outcomes
    this.sendChain = p.then(() => undefined, () => undefined);
    return p;
  }

  private sendChain: Promise<unknown> = Promise.resolve();

  private dispatch(command: string, timeoutMs: number): Promise<ELM327Response> {
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.pendingCommand = command;

      if (this.pendingTimer) clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        this.resolveResponse('', true);
      }, timeoutMs);

      this.sendFn(command + '\r');
    });
  }

  // ── Send and assert expected substring in response ────────────────────────────
  private async sendExpect(command: string, expected: string, errorMsg: string): Promise<ELM327Response> {
    const resp = await this.send(command);
    if (!resp.raw.includes(expected)) {
      this.log(`WARNING: ${errorMsg} — got: ${resp.raw}`);
    }
    return resp;
  }

  // ── Parse a PID response into raw data bytes ──────────────────────────────────
  parsePIDResponse(pid: string, raw: string): number[] | null {
    // Strip header bytes if present, split on whitespace
    const clean = raw.replace(/\s+/g, '').toUpperCase();

    // Discard non-hex characters
    if (!/^[0-9A-F]+$/.test(clean)) return null;

    // OBD-II response header: mode+40 followed by PID
    // e.g. '410C1AF8' for RPM where mode 01 → response 41
    const modeNibble = pid.substring(0, 2);
    const responseMode = (parseInt(modeNibble, 16) + 0x40).toString(16).toUpperCase().padStart(2, '0');
    const pidHex = pid.substring(2).toUpperCase();
    const expectedHeader = responseMode + pidHex;

    const idx = clean.indexOf(expectedHeader);
    if (idx === -1) return null;

    const dataStart = idx + expectedHeader.length;
    let dataHex = clean.substring(dataStart);

    // Multiple ECUs can answer the same request (e.g. engine + transmission on
    // J1850). Keep only the first ECU's data — truncate at a repeated header.
    const nextEcu = dataHex.indexOf(expectedHeader);
    if (nextEcu !== -1) dataHex = dataHex.substring(0, nextEcu);

    if (dataHex.length % 2 !== 0) return null;

    const bytes: number[] = [];
    for (let i = 0; i < dataHex.length; i += 2) {
      bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
    }

    return bytes;
  }

  // ── Request battery voltage directly (ATRV) ────────────────────────────────
  async readBatteryVoltage(): Promise<number> {
    const resp = await this.send('ATRV', 1000);
    const match = resp.raw.match(/(\d+\.\d+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  // ── OBDLink sleep timer control (STSLLT) ──────────────────────────────────
  async setSleepTimer(minutes: number): Promise<void> {
    await this.send(`STSLLT ${minutes}`, 1000);
  }

  // ── OBDLink power control (STPC) ─────────────────────────────────────────
  async setPowerControl(on: boolean): Promise<void> {
    await this.send(on ? 'STPC 1' : 'STPC 0', 1000);
  }

  get ready(): boolean { return this.isReady; }
  get info(): Partial<AdapterInfo> { return this.adapterInfo; }

  private resolveResponse(raw: string, timedOut = false): void {
    if (!this.pendingResolve) return;

    // On timeout, discard any partial bytes so a late-arriving response can't
    // corrupt the NEXT command's reply.
    if (timedOut) this.recvBuf = '';

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const success = !timedOut &&
      !raw.includes(ELM_ERROR) &&
      !raw.includes('?') &&
      raw.length > 0;

    const response: ELM327Response = {
      command: this.pendingCommand,
      raw,
      lines,
      success,
      errorMessage: timedOut ? 'Timeout' : raw.includes(ELM_ERROR) ? 'ELM327 ERROR' : undefined,
    };

    if (raw && !this.pendingCommand.startsWith('AT') && !this.pendingCommand.startsWith('ST')) {
      this.emit('raw-response', response);
    }

    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.pendingCommand = '';
    resolve(response);
  }

  private log(msg: string, level: 'info' | 'warn' = 'info'): void {
    const message = `[ELM327] ${msg}`;
    console.log(message);
    this.emit('log', { timestamp: Date.now(), level, message });
  }
}
