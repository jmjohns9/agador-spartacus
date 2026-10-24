import * as net from 'net';
import { createHmac } from 'crypto';
import { EventEmitter } from 'events';

// ─── Network Mode: ELM327 over TCP ────────────────────────────────────────────
// A network bridge (the Arduino UNO Q forwarding bytes to an OBD adapter, or
// a Wi-Fi ELM327 dongle) speaks the same AT/OBD text protocol as the Bluetooth
// adapter, just over a TCP socket. TcpPort gives that socket the slice of the
// SerialPort interface connectToPort uses (open, write, close, isOpen and the
// data/error/close events), so the ELM327Commander session code is unchanged.
//
// A network target is passed through the existing obd:connect channel as a
// "tcp://host:port" string, the same way the simulator travels as "SIMULATOR".

export const TCP_PREFIX = 'tcp://';
export const DEFAULT_TCP_PORT = 35000;   // de-facto port for Wi-Fi ELM327 bridges
const CONNECT_TIMEOUT_MS = 5000;

export interface TcpTarget { host: string; port: number }

export function isTcpTarget(path: string): boolean {
  return path.startsWith(TCP_PREFIX);
}

// Parse "tcp://host[:port]" into a host and port, or null when it isn't a
// usable target. Called with untrusted text typed into the Connection screen.
export function parseTcpTarget(path: string): TcpTarget | null {
  if (!isTcpTarget(path)) return null;
  const rest = path.slice(TCP_PREFIX.length).trim();
  // A bare host name or IPv4 address, optionally ":port" — no user@, path or spaces
  const m = rest.match(/^([^\s:/@]+)(?::(\d+))?$/);
  if (!m) return null;
  const port = m[2] === undefined ? DEFAULT_TCP_PORT : Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: m[1], port };
}

// A failed connect is shown verbatim in the Connection screen's banner, so say
// which hop failed (bridge not running, board not on the network, name not
// found) instead of a bare errno. The code stays on the returned error.
export function describeConnectError(err: NodeJS.ErrnoException, target: TcpTarget): string {
  const where = `${target.host}:${target.port}`;
  switch (err.code) {
    case 'ECONNREFUSED':
      return `Nothing is listening on ${where}: the bridge isn't running on the board (systemctl status tattlestone-bridge) [ECONNREFUSED]`;
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Can't reach ${where}: the board is off, still booting, on another network, or macOS Local Network access is off for Tattlestone [${err.code}]`;
    case 'ENOTFOUND':
      return `Can't find ${target.host}: try the board's IP address instead of its name [ENOTFOUND]`;
    case 'ECONNRESET':
      return `${where} accepted the connection, then dropped it: check the bridge log on the board [ECONNRESET]`;
    default:
      return `${err.message} (${where})`;
  }
}

// The UNO Q bridge reports on the adapter link in-band, one line each, before
// any ELM327 traffic (none carry the '>' prompt):
//   BRIDGE AUTH <nonce>            it has a pairing token: answer AUTH <hmac>
//   BRIDGE STATUS: <progress>      while it brings up Bluetooth, retrying as needed
//   BRIDGE READY                   link up; adapter traffic follows
//   BRIDGE ERROR: <what to do>     then it hangs up (also on a mid-session drop)
// Returns the error's reason, or null when the text holds no such line.
export function parseBridgeError(text: string): string | null {
  const m = text.match(/BRIDGE ERROR: ([^\r\n]+)/);
  return m ? m[1].trim() : null;
}

// Proof of the pairing token without sending it: HMAC-SHA256 over the
// bridge's one-time nonce (auth_response() in obd_tcp_bridge.py).
export function bridgeAuthResponse(token: string, nonce: string): string {
  return createHmac('sha256', token).update(nonce).digest('hex');
}

// Failures that mean the bridge itself isn't up yet (board booting, service
// restarting), so trying again shortly can work. A BRIDGE ERROR is not one:
// the bridge already retried the adapter before giving up.
export function isRetryableOpenError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET', 'CONNECT_TIMEOUT'].includes(code ?? '');
}

// The bridge greets the moment it accepts; a plain Wi-Fi ELM327 says nothing
// until it gets a command, so silence this long means "not a bridge".
const BRIDGE_GREETING_MS = 1500;
// The bridge retries the adapter for up to 20 s before answering READY or ERROR
const BRIDGE_LINK_TIMEOUT_MS = 30_000;
// The bridge's lines sit at the start of a session, or at the end when the
// adapter drops mid-session; keep both ends whole across split reads.
const CAPTURE_BYTES = 256;

export class TcpPort extends EventEmitter {
  readonly path: string;
  private readonly target: TcpTarget;
  private socket: net.Socket | null = null;
  private opened = false;
  private head = '';
  private tail = '';
  private readonly greetingMs: number;
  private readonly linkTimeoutMs: number;
  private readonly token: string | undefined;

  // `token` is the bridge's pairing token, when one is saved for this address.
  // The wait overrides exist for tests; the app uses the defaults.
  constructor(path: string, opts: { greetingMs?: number; linkTimeoutMs?: number; token?: string } = {}) {
    super();
    const target = parseTcpTarget(path);
    if (!target) throw new Error(`Not a network adapter address: ${path} (expected tcp://host:port)`);
    this.path = path;
    this.target = target;
    this.token = opts.token || undefined;
    this.linkTimeoutMs = opts.linkTimeoutMs ?? BRIDGE_LINK_TIMEOUT_MS;
    // With a token this is known to be a bridge, and a token bridge busy
    // bringing up the adapter for someone else greets only when it is done:
    // silence then isn't "a plain Wi-Fi ELM327".
    this.greetingMs = opts.greetingMs ?? (this.token ? this.linkTimeoutMs : BRIDGE_GREETING_MS);
  }

  get isOpen(): boolean {
    return this.opened && !!this.socket && !this.socket.destroyed && this.socket.readyState === 'open';
  }

  // Why the bridge hung up, when it said so before closing
  get closeReason(): string | null {
    return parseBridgeError(this.tail) ?? parseBridgeError(this.head);
  }

  // Opens the TCP connection, then waits for the bridge to bring up the
  // adapter link ('status' events carry its progress text). The callback gets
  // null once adapter traffic can flow, or an error whose message says what to
  // do. Only an open that succeeded later emits 'data', 'error' or 'close'.
  open(cb: (err: Error | null) => void): void {
    const socket = net.createConnection({ host: this.target.host, port: this.target.port });
    this.socket = socket;
    this.opened = false;
    this.head = this.tail = '';
    // ELM327 traffic is tiny request/response lines; Nagle would hold each
    // command back waiting for more bytes.
    socket.setNoDelay(true);
    // Let the OS probe an idle link so a bridge that lost power (no FIN) is
    // eventually reported as 'close'. The commander's timeout count catches it
    // sooner while polling; this covers a session sitting idle.
    socket.setKeepAlive(true, 5000);

    let settled = false;
    let handshaking = false;
    let lineBuf = '';
    let greetTimer: ReturnType<typeof setTimeout> | undefined;
    let linkTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (err: Error | null): void => {
      if (settled) return;
      settled = true;
      handshaking = false;
      socket.setTimeout(0);
      clearTimeout(greetTimer);
      clearTimeout(linkTimer);
      if (!err) this.opened = true;
      cb(err);
    };
    const fail = (message: string, code: string): void => {
      settle(Object.assign(new Error(message), { code }));
      socket.destroy();
    };
    // Adapter bytes that arrived with the bridge's last line go to the session
    const pass = (text: string): void => { if (text) this.emit('data', Buffer.from(text, 'ascii')); };

    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      fail(`No answer from ${this.target.host}:${this.target.port} within ${CONNECT_TIMEOUT_MS / 1000} s — is the bridge powered and on this network?`, 'CONNECT_TIMEOUT');
    });
    socket.once('connect', () => {
      socket.setTimeout(0);
      handshaking = true;
      // Silence: a plain Wi-Fi ELM327, ready for commands as it is
      greetTimer = setTimeout(() => { settle(null); pass(lineBuf); }, this.greetingMs);
    });
    socket.on('data', (chunk: Buffer) => {
      const text = chunk.toString('ascii');
      if (this.head.length < CAPTURE_BYTES) this.head += text.slice(0, CAPTURE_BYTES - this.head.length);
      this.tail = (this.tail + text).slice(-CAPTURE_BYTES);
      if (!handshaking) {
        if (this.opened) this.emit('data', chunk);
        return;
      }
      lineBuf += text;
      let i: number;
      while (handshaking && (i = lineBuf.search(/[\r\n]/)) !== -1) {
        const line = lineBuf.slice(0, i).trim();
        lineBuf = lineBuf.slice(i + 1);
        if (!line) continue;
        const armLinkTimer = (): void => {
          clearTimeout(greetTimer);
          linkTimer ??= setTimeout(() => fail(
            `The bridge didn't bring up the OBD adapter within ${this.linkTimeoutMs / 1000} s: check journalctl -u tattlestone-bridge on the board`,
            'BRIDGE_TIMEOUT'), this.linkTimeoutMs);
        };
        if (line.startsWith('BRIDGE AUTH ')) {
          if (!this.token) {
            fail(`${this.target.host}:${this.target.port} is a Tattlestone bridge that requires its pairing token: enter the token from /etc/tattlestone/bridge-token on the board`,
              'BRIDGE_AUTH_REQUIRED');
            return;
          }
          armLinkTimer();
          socket.write(`AUTH ${bridgeAuthResponse(this.token, line.slice('BRIDGE AUTH '.length).trim())}\r`, 'ascii');
          this.emit('status', 'checking the pairing token');
        } else if (line.startsWith('BRIDGE STATUS:')) {
          armLinkTimer();
          this.emit('status', line.slice('BRIDGE STATUS:'.length).trim());
        } else if (line === 'BRIDGE READY') {
          settle(null);
          pass(lineBuf);
        } else if (parseBridgeError(line)) {
          fail(`The bridge can't reach the OBD adapter: ${parseBridgeError(line)}`, 'BRIDGE_ERROR');
        } else {
          // Not a bridge line: a plain ELM327 talking unprompted
          settle(null);
          pass(`${line}\r${lineBuf}`);
        }
      }
    });
    socket.on('error', (err: Error) => {
      // Before the session is up the error belongs to open()'s callback,
      // as with SerialPort; afterwards it is a session error.
      if (!settled) {
        const code = (err as NodeJS.ErrnoException).code;
        settle(Object.assign(new Error(describeConnectError(err, this.target)), { code }));
      } else if (this.opened) this.emit('error', err);
    });
    socket.on('close', () => {
      if (!settled) {
        const why = this.closeReason;
        settle(Object.assign(new Error(why
          ? `The bridge can't reach the OBD adapter: ${why}`
          : `${this.target.host}:${this.target.port} closed the connection before the adapter link was up: check the bridge log on the board`),
          { code: why ? 'BRIDGE_ERROR' : 'ECONNRESET' }));
        return;
      }
      // Only a session that actually opened can "close"; a failed open
      // reports through its callback alone.
      if (this.opened && this.socket === socket) this.emit('close');
    });
  }

  write(data: string, cb?: (err: Error | null | undefined) => void): void {
    if (!this.socket || this.socket.destroyed) {
      cb?.(new Error('Network adapter is not connected'));
      return;
    }
    this.socket.write(data, 'ascii', cb);
  }

  close(cb?: () => void): void {
    const socket = this.socket;
    if (!socket || socket.destroyed) { cb?.(); return; }
    socket.once('close', () => cb?.());
    socket.destroy();
  }
}
