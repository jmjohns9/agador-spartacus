import * as fs from 'fs';
import { parseTcpTarget } from './tcpPort';

// ─── Bridge pairing tokens ────────────────────────────────────────────────────
// One token per bridge address, kept in userData/bridge-tokens.json and
// encrypted with the OS keychain (Electron safeStorage) the same way as the
// Claude API key. The renderer can set or clear a token and ask whether one
// is saved; it never reads one back.

export interface SecretBox {
  /** Whether encrypt() gives real protection (not Linux's basic_text backend). */
  canEncrypt(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

interface Entry { enc?: string; plain?: string }

export const MIN_TOKEN_LENGTH = 16;

/** The bridge writes urlsafe tokens; accept any printable token without spaces. */
export function isValidToken(t: unknown): t is string {
  return typeof t === 'string' && t.length >= MIN_TOKEN_LENGTH && t.length <= 256 && /^[\x21-\x7E]+$/.test(t);
}

/** "host:port" for a tcp:// target, lower-cased, or null if it isn't one. */
export function tokenKey(target: string): string | null {
  const t = parseTcpTarget(target);
  return t ? `${t.host.toLowerCase()}:${t.port}` : null;
}

export class BridgeTokenStore {
  constructor(private readonly file: string, private readonly box: SecretBox) {}

  private read(): Record<string, Entry> {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown;
      return raw && typeof raw === 'object' ? raw as Record<string, Entry> : {};
    } catch {
      return {};
    }
  }

  get(target: string): string | null {
    const key = tokenKey(target);
    const entry = key ? this.read()[key] : undefined;
    if (!entry) return null;
    if (typeof entry.enc === 'string') {
      try {
        return this.box.decrypt(Buffer.from(entry.enc, 'base64'));
      } catch {
        return null;   // another machine's keychain, or access denied
      }
    }
    return typeof entry.plain === 'string' ? entry.plain : null;
  }

  has(target: string): boolean {
    const key = tokenKey(target);
    return !!key && key in this.read();
  }

  /** Saves `token` for `target`, or forgets it when token is null. */
  set(target: string, token: string | null): void {
    const key = tokenKey(target);
    if (!key) throw new Error(`Not a network adapter address: ${target}`);
    if (token !== null && !isValidToken(token)) throw new Error(`A pairing token is at least ${MIN_TOKEN_LENGTH} characters with no spaces`);
    const all = this.read();
    if (token === null) delete all[key];
    // No real keychain: plaintext under 0600 beats silently dropping the token
    else all[key] = this.box.canEncrypt() ? { enc: this.box.encrypt(token).toString('base64') } : { plain: token };
    fs.writeFileSync(this.file, JSON.stringify(all) + '\n', { mode: 0o600 });
    // writeFileSync's mode only applies when it creates the file
    fs.chmodSync(this.file, 0o600);
  }
}
