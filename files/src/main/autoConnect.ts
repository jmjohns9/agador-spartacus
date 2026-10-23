import * as fs from 'fs';
import { isTcpTarget, parseTcpTarget } from './tcpPort';

// ─── Connect on open ──────────────────────────────────────────────────────────
// Opening the app reconnects to the last Network Mode bridge it connected to.
// The bridge retries the adapter itself (and says so in BRIDGE STATUS lines),
// so this only retries reaching the bridge — the board still booting when the
// truck and the Mac start together, or the service restarting — a bounded
// number of times. A manual Disconnect forgets the bridge.

export type AttemptResult = 'connected' | 'retryable' | 'failed';

// Waits before the 2nd and 3rd attempts
export const AUTO_CONNECT_DELAYS_MS = [3000, 10_000];

export async function connectWithRetry(
  attempt: () => Promise<AttemptResult>,
  opts: {
    cancelled: () => boolean;
    delaysMs?: number[];
    onRetry?: (delayMs: number, nextAttempt: number) => void;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<AttemptResult | 'cancelled'> {
  const delays = opts.delaysMs ?? AUTO_CONNECT_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let n = 0; ; n++) {
    if (opts.cancelled()) return 'cancelled';
    const result = await attempt();
    if (result !== 'retryable' || n >= delays.length) return result;
    if (opts.cancelled()) return 'cancelled';
    opts.onRetry?.(delays[n], n + 2);
    await sleep(delays[n]);
  }
}

// The remembered bridge lives in userData/connection.json. Anything unreadable
// or not a valid tcp:// target counts as nothing remembered.
export function readRememberedBridge(file: string): string | null {
  try {
    const target = (JSON.parse(fs.readFileSync(file, 'utf8')) as { lastBridge?: unknown }).lastBridge;
    return typeof target === 'string' && parseTcpTarget(target) ? target : null;
  } catch {
    return null;
  }
}

export function rememberBridge(file: string, target: string | null): void {
  try {
    if (target === null) fs.rmSync(file, { force: true });
    else if (isTcpTarget(target)) fs.writeFileSync(file, JSON.stringify({ lastBridge: target }) + '\n');
  } catch {
    // Not worth failing a connection over: the app just won't auto-connect
  }
}
