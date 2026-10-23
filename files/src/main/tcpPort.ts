import * as net from 'net';
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

export class TcpPort extends EventEmitter {
  readonly path: string;
  private readonly target: TcpTarget;
  private socket: net.Socket | null = null;

  constructor(path: string) {
    super();
    const target = parseTcpTarget(path);
    if (!target) throw new Error(`Not a network adapter address: ${path} (expected tcp://host:port)`);
    this.path = path;
    this.target = target;
  }

  get isOpen(): boolean {
    return !!this.socket && !this.socket.destroyed && this.socket.readyState === 'open';
  }

  open(cb: (err: Error | null) => void): void {
    const socket = net.createConnection({ host: this.target.host, port: this.target.port });
    this.socket = socket;
    // ELM327 traffic is tiny request/response lines; Nagle would hold each
    // command back waiting for more bytes.
    socket.setNoDelay(true);
    // Let the OS probe an idle link so a bridge that lost power (no FIN) is
    // eventually reported as 'close'. The commander's timeout count catches it
    // sooner while polling; this covers a session sitting idle.
    socket.setKeepAlive(true, 5000);

    let settled = false;
    const settle = (err: Error | null): void => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      cb(err);
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      const err = new Error(`No answer from ${this.target.host}:${this.target.port} within ${CONNECT_TIMEOUT_MS / 1000} s — is the bridge powered and on this network?`);
      settle(err);
      socket.destroy();
    });
    socket.once('connect', () => settle(null));
    socket.on('data', (chunk: Buffer) => this.emit('data', chunk));
    socket.on('error', (err: Error) => {
      // Before the connection is up the error belongs to open()'s callback,
      // as with SerialPort; afterwards it is a session error.
      if (!settled) {
        const code = (err as NodeJS.ErrnoException).code;
        settle(Object.assign(new Error(describeConnectError(err, this.target)), { code }));
      } else this.emit('error', err);
    });
    // Only a link that actually opened can "close" — a failed open reports
    // through its callback alone.
    socket.on('close', () => { if (settled && this.socket === socket) this.emit('close'); });
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
