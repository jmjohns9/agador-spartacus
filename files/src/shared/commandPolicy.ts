import policy from './command-policy.json';

// ─── Read-only command policy ─────────────────────────────────────────────────
// The app must never change a control module. Every line written to an adapter
// passes this check first (ELM327Commander.dispatch), and the UNO Q bridge
// applies the same rules from an identical copy of command-policy.json, so a
// client other than the app is held to them too.
//
// It is an allowlist: AT commands except the few that defeat the check or put
// arbitrary bytes on the bus, the OBDLink ST commands that only identify the
// adapter, and OBD/UDS requests whose first byte is a read service. Anything
// else, including ST passthrough (STPX) and any line holding a CR or LF (the
// adapter would run the text after it as a second command), is refused.

export const COMMAND_POLICY = policy;

const READ_SERVICES = new Set(Object.keys(policy.readServices));
const AT_DENY = Object.entries(policy.atDenyPrefixes);
const ST_ALLOW = new Set(policy.stAllow);

/** Why `command` must not be sent, or null when it may be. */
export function refusalReason(command: string): string | null {
  if (/[\r\n]/.test(command)) return 'line break inside a command';
  if (command.length > policy.maxLineLength) return `longer than ${policy.maxLineLength} characters`;
  if (/[^\x20-\x7E\t]/.test(command)) return 'non-printable character';
  const cmd = command.replace(/[ \t]+/g, '').toUpperCase();
  // A bare CR makes an ELM327 repeat its last command, which passed this check
  if (cmd === '') return null;
  if (cmd.startsWith('AT')) {
    const denied = AT_DENY.find(([prefix]) => cmd.startsWith(prefix));
    return denied ? `${denied[0]}: ${denied[1]}` : null;
  }
  if (cmd.startsWith('ST')) return ST_ALLOW.has(cmd) ? null : `${cmd.slice(0, 8)}: not an adapter identification command`;
  if (!/^([0-9A-F]{2})+$/.test(cmd)) return 'not an AT, ST or hex request';
  return READ_SERVICES.has(cmd.slice(0, 2)) ? null : `service ${cmd.slice(0, 2)} is not a read`;
}
