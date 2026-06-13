You are reviewing the source tree at SCOPE_ROOT for security defects.

## Scope

- Root: SCOPE_ROOT (resolve relative to repo root)
- Include: **/*.{ts,tsx,js,mjs} under SCOPE_ROOT
- Exclude: **/dist/**, **/build/**, **/node_modules/**, **/*.test.*, **/*.spec.*

If SCOPE_ROOT does not exist or contains zero in-scope files, emit `{"findings": [], "skipped": [{"path": "SCOPE_ROOT", "reason": "missing or empty"}], ...}` and stop.

## What counts as a finding

Report only defects you can justify from the source. A defect is:

- A secret, credential, or token stored, transmitted, or logged in a way that exposes it beyond the process boundary that needs it.
- An input from a less-trusted boundary (renderer IPC, network response, serial/Bluetooth peripheral, file system, env var read at runtime) that flows into a privileged sink (file write, child_process, shell, SQL, DOM innerHTML, eval, BrowserWindow.loadURL, fetch URL, prompt fence) without a validation or escaping step.
- An unbounded resource (array, map, log buffer, queue, recursion) on a code path an attacker or buggy client can drive.
- A platform hardening gap (missing CSP, contextIsolation off, nodeIntegration on, webSecurity off, missing sandbox, missing safeStorage for secrets, file permissions not enforced on overwrite).
- A dependency declaration that defeats reproducible-build / SCA workflows.

Do NOT report:

- "Could be cleaner" style observations, naming, code-smell.
- TODO comments unless they document an unfixed vulnerability.
- Generic best practices with no evidence in this code.
- Defects already mitigated by other code in this tree — verify before reporting.

## Category (closed set — pick exactly one per finding)

Use one of these snake_case values for the `category` field. Do NOT invent new ones; if nothing fits, use `other` and put a short descriptor in `category_detail`.

- `secrets_storage` — credentials/keys persisted to disk/memory in a recoverable form (plaintext file, weak permissions, no Keychain/safeStorage).
- `secrets_exposure` — credentials leaked through logs, error messages, IPC return values, screen, telemetry.
- `input_validation` — input from a less-trusted boundary reaches a sink with no shape/length/charset check.
- `prompt_injection` — user- or peripheral-controlled text concatenated into an LLM prompt with no escaping of fences/delimiters.
- `injection_via_untrusted_peripheral` — bytes from a serial/Bluetooth/USB device propagate into logs, prompts, or the DOM unsanitized.
- `denial_of_service` — unbounded buffer, queue, recursion, or allocation an attacker or buggy client can drive.
- `rate_limiting` — privileged or paid action has no throttle / budget cap.
- `missing_csp` — BrowserWindow / web page lacks a Content-Security-Policy header or meta tag.
- `electron_hardening` — webPreferences gaps OTHER than missing CSP (sandbox off, contextIsolation off, nodeIntegration on, webSecurity off, missing `will-navigate` / `new-window` handlers).
- `dev_mode_attack_surface` — runtime-trusted env vars / debug flags can change production behavior.
- `dependency_supply_chain` — version ranges, missing lockfile, no SCA in CI, unaudited transitive deps.
- `other` — nothing above fits; include `"category_detail": "<short descriptor>"`.

When the same code line legitimately matches two categories (e.g. an unbounded log AND a prompt injection sink), emit two findings only if the recommendations diverge; otherwise pick the higher-severity category and mention the other in `evidence`.

## Severity

- critical: privilege boundary crossed (RCE, auth bypass, secret read by an unauthorized actor on this host today).
- high: a secret or credential is exposed in a recoverable form, or an attacker-controlled unbounded resource crashes the app.
- medium: defense-in-depth gap; injection vector with limited blast radius; an untrusted input reaches a sink with no validation but the sink rejects most malicious payloads.
- low: best-practice deviation, hardening gap, or weak signal of risk worth tracking.

## Output

Emit ONE JSON object matching this schema, and nothing else (no prose, no markdown fence):

```
{
  "review_type": "security",
  "scope": {"root": "<SCOPE_ROOT>", "globs": [...], "git_sha": "<sha or 'unknown'>"},
  "findings": [
    {
      "id": "SEC-<3-digit>",
      "category": "<snake_case category>",
      "severity": "critical|high|medium|low",
      "file": "<repo-relative path>",
      "line": <int or null>,
      "summary": "<one sentence>",
      "evidence": "<quote or paraphrase the specific code, including symbol names>",
      "recommendation": "<concrete change, not 'consider X'>",
      "confidence": <0.0-1.0>,
      "fingerprint_inputs": ["<category>", "<file>", "<stable-identifier-of-this-issue>"]
    }
  ],
  "skipped": [{"path": "<path>", "reason": "<why>"}],
  "stats": {"files_scanned": <int>, "elapsed_ms": <int>}
}
```

Rules for the output:

- `fingerprint_inputs` is the dedup key; format as exactly `[category, file, stable_identifier]` where `stable_identifier` is the symbol, IPC channel, or config key the issue lives on (NOT a line number).
- Order findings by severity (critical → low), then by file path.
- If no findings, emit `"findings": []` — do not invent issues to fill space.
- `confidence` < 0.6 → demote the finding to "low" or drop it.
- Do not repeat the same root cause as multiple findings; pick the highest-severity site and reference others in `evidence`.
