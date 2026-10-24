# Security and safety

## Read-only by design

The app is strictly read-only: nothing in it writes to a control module, and it should stay that way. There is no Clear DTCs button. Every command goes through an **allowlist** ([`files/src/shared/command-policy.json`](../files/src/shared/command-policy.json)) before it's written:

- OBD/UDS requests pass only when their first byte is a read service: 01, 02, 03, 05, 06, 07, 09, 0A, 19, 1A, 21, 22, 3C, 3E. Clearing, resets, session changes, security access, writes, actuation, routines and programming are all refused because they aren't on the list.
- AT commands pass, except the ones that would defeat the check or put arbitrary bytes on the bus: `ATCAF0`, `ATPP`, `ATWM`, `ATFC SD`.
- ST commands pass only when they identify the adapter (`STI`, `STDI`, …); `STPX` passthrough is refused.
- A line holding a CR or LF, a line over 64 characters, and anything non-printable are refused.

The UNO Q bridge applies the same rules from an identical copy (`firmware/uno-q-bridge/command_policy.json`; tests in both languages fail if the copies differ), so the promise holds for any client, not just the app. The bridge never truncates an over-long line: it refuses it whole. To clear codes, use a dedicated scan tool.

**The PCM surface is read-only too.** PcmHammer exists mainly for flashing: kernel upload, segment write and recovery. None of that is implemented here, because a diagnostics tab has no business holding a write primitive that can brick an ECU.

## Security notes

**The UNO Q bridge needs a pairing token.** Without one, anything on the Wi-Fi could connect to port 35000, which phone OBD apps probe automatically, and take the adapter away from the Mac. The bridge now challenges every client (HMAC-SHA256 over a fresh nonce), refuses those that fail, and lets only an authenticated client replace the current one. The systemd unit fails closed when the token file is missing. Traffic isn't encrypted; see [HARDWARE.md](HARDWARE.md#network-mode-with-the-arduino-uno-q).

This desktop app takes in data from an untrusted peripheral (the adapter) and from third-party APIs, so its threat model is reviewed daily.

Currently enforced:

- `contextIsolation: true` and `nodeIntegration: false` on the main window. All privileged operations go through explicit IPC handlers.
- The Claude API key is encrypted at rest via `safeStorage`, and rewrites enforce `0600` permissions. There is a documented migration path for configs written in plaintext before encryption existed.
- Input from the adapter is bounded on the ELM327 receive path.
- Report data is escaped before it reaches `innerHTML`.
- The session log is a ring buffer capped at 5000 entries, so long sessions don't grow without limit.
- The main window is sandboxed, can't navigate away from the app's page or open windows, and every IPC handler refuses requests that don't come from the app's own page.
- The Content Security Policy allows only the app's own scripts, styles, fonts and images (no `eval`, no remote origins). The UI loads nothing from the network.
- Network Mode targets typed into the Connection screen are parsed as untrusted text.

Known open findings are tracked in `eval/security/last-run-summary.md` rather than hidden. They cover DoS bounds on parsing that the adapter controls, prompt-injection fencing in the assistant context, Electron sandbox hardening, and rate limiting on metered third-party proxies.

## The automated review pipeline

`eval/` holds a scored, self-checking code review harness. Six review types run on a schedule against `files/src`:

| Type | Cadence |
|---|---|
| `security` | daily |
| `deps` | daily |
| `quality` | weekly |
| `performance` | weekly |
| `tests` | weekly |
| `architecture` | monthly |

Each `eval/<type>/` directory contains:

- **`review-<type>.md`**: the review prompt itself. It defines a closed set of finding categories, explicit non-findings, and the required JSON output shape.
- **`expected.json`**: the answer key, listing the findings a correct review should surface.
- **`history/<YYYY-MM-DD>.json`**: one file per run, committed.
- **`score.py`**: scores a run against the key, and prints recall by severity, severity-match rate and false-positive rate.
  - A finding first matches on its exact fingerprint. Failing that, it falls back to category, file and line proximity.
  - Alias sets cover categories that name the same defect from different angles (`prompt_injection` ≈ `injection_via_untrusted_peripheral`, `missing_csp` ≈ `electron_hardening`).
  - Line matching is tolerant for defects that span an IPC handler and the function it calls.
- **`last-run-summary.md`**: a readable digest, with new findings deduplicated against the previous run by fingerprint.

Each run is committed with only its own paths (`review: security 2026-08-10 (2 new)`), so unrelated working-tree changes can't be swept in. The review never reads `expected.json` or earlier history, because that would bias the result.
