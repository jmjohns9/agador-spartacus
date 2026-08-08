# Security review — 2026-08-08

1 high · 9 medium · 2 low

Reviewed tree: `2eeea84` (files/src, 38 files).

## New since previous run (2026-08-07)

- **[medium]** injection_via_untrusted_peripheral @ files/src/renderer/screens/LogsScreen.tsx:95 — CSV export quotes log messages correctly but does not neutralize leading formula characters, so adapter-supplied text becomes a live formula when the file is opened in a spreadsheet.
- **[low]** electron_hardening @ files/src/main/main.ts:519 — The offscreen PDF-report window still runs with contextIsolation disabled and executes a script built by string-concatenating a renderer-supplied payload; the XSS path it used to enable is now escaped.
- **[low]** input_validation @ files/src/main/main.ts:379 — The obd:decode-vin handler forwards an unvalidated renderer string to a third-party API with no VIN shape or length check.

> The `report:generate` entry is a recategorization rather than a newly discovered defect: the 2026-08-07 run flagged the same site under `injection_via_untrusted_peripheral`. Commit `fd48f8a` escaped the report.html interpolation sites, closing that path, so what remains is the `contextIsolation: false` hardening gap on the window itself — hence the new category and the lower severity. Only the LogsScreen CSV export and the `obd:decode-vin` validation gap are genuinely new.

## Resolved since previous run

- **secrets_storage @ files/src/main/claudeAssistant.ts** — fixed by `08e5104`: the API key is now encrypted with Electron `safeStorage` (base64 ciphertext under `apiKeyEnc`) and the file is `chmod`ed to 0600 after every write, closing both the plaintext-at-rest and the mode-not-reapplied-on-overwrite gaps. Dropped from today's findings.

## All findings today

- **[high]** denial_of_service @ files/src/core/elm327Commander.ts:56 — ELM327Commander.onData appends every received chunk to recvBuf with no size cap, so a serial/Bluetooth adapter that never emits the '>' prompt grows the buffer without bound.
- **[medium]** prompt_injection @ files/src/main/claudeAssistant.ts:151 — formatContext() concatenates adapter-derived log lines, DTC descriptions, and free-text vehicle notes into a <session-snapshot> fence without escaping the closing delimiter.
- **[medium]** secrets_exposure @ files/src/main/main.ts:541 — The CarsXE API key is interpolated raw into the request URL query string, exposing it to proxy logs, server access logs, and Referer headers.
- **[medium]** missing_csp @ files/src/main/main.ts:23 — createWindow() installs no Content-Security-Policy response header, and the only CSP in the app is a meta tag that permits 'unsafe-eval' and 'unsafe-inline'.
- **[medium]** electron_hardening @ files/src/main/main.ts:34 — The main BrowserWindow disables the renderer sandbox and the app registers no will-navigate or window-open handlers.
- **[medium]** dev_mode_attack_surface @ files/src/main/main.ts:40 — A runtime NODE_ENV environment variable decides whether the packaged app loads its UI from a remote http://localhost:3000 origin and opens DevTools.
- **[medium]** input_validation @ files/src/main/main.ts:337 — The obd:connect IPC handler passes a renderer-supplied port path straight to SerialPort without checking it against the enumerated device list.
- **[medium]** rate_limiting @ files/src/main/main.ts:419 — The claude:ask IPC handler applies no throttle or spend cap to a paid API call that the renderer can invoke in a loop.
- **[medium]** denial_of_service @ files/src/renderer/screens/DataLoggerScreen.tsx:65 — startRecording pushes a sample into an in-memory array every sampleInterval with no cap on sample count or recording duration.
- **[medium]** injection_via_untrusted_peripheral @ files/src/renderer/screens/LogsScreen.tsx:95 — CSV export quotes log messages correctly but does not neutralize leading formula characters, so adapter-supplied text becomes a live formula when the file is opened in a spreadsheet.
- **[low]** electron_hardening @ files/src/main/main.ts:519 — The offscreen PDF-report window still runs with contextIsolation disabled and executes a script built by string-concatenating a renderer-supplied payload; the XSS path it used to enable is now escaped.
- **[low]** input_validation @ files/src/main/main.ts:379 — The obd:decode-vin handler forwards an unvalidated renderer string to a third-party API with no VIN shape or length check.
