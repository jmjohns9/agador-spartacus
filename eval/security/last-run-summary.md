# Security review — 2026-08-07

2 high · 6 medium · 3 low

## New since previous run (first run)

- **[high]** secrets_storage @ files/src/main/claudeAssistant.ts:45 — The Claude API key is persisted as plaintext JSON in userData, and the 0o600 mode is not enforced when the file already exists.
- **[high]** injection_via_untrusted_peripheral @ files/src/main/main.ts:524 — Adapter-controlled strings reach innerHTML in the PDF report window with no escaping, giving a hostile OBD adapter script execution in that renderer.
- **[medium]** denial_of_service @ files/src/core/elm327Commander.ts:55 — ELM327Commander.onData appends every received chunk to an unbounded string buffer that is only cleared when a '>' prompt byte arrives.
- **[medium]** prompt_injection @ files/src/main/claudeAssistant.ts:81 — formatContext concatenates peripheral- and network-derived text into a <session-snapshot> fence without escaping the closing delimiter.
- **[medium]** dev_mode_attack_surface @ files/src/main/main.ts:40 — A runtime NODE_ENV env var makes any build load its UI from plain-HTTP localhost:3000 and open DevTools.
- **[medium]** input_validation @ files/src/main/main.ts:337 — The obd:connect IPC handler passes a renderer-supplied device path to SerialPort with no allowlist check.
- **[medium]** missing_csp @ files/src/main/main.ts:517 — The PDF report BrowserWindow has no Content-Security-Policy, so nothing blocks the inline script injected via SEC-002.
- **[medium]** electron_hardening @ files/src/main/main.ts:519 — webPreferences gaps: the report window disables contextIsolation, the main window disables sandbox, and neither installs navigation or window-open handlers.
- **[low]** rate_limiting @ files/src/main/main.ts:419 — The claude:ask IPC handler has no call throttle or cumulative token budget on a paid API.
- **[low]** secrets_exposure @ files/src/main/main.ts:541 — The CarsXE API key is interpolated unencoded into the request URL query string.
- **[low]** denial_of_service @ files/src/renderer/screens/DataLoggerScreen.tsx:65 — An active recording accumulates samples in an uncapped array that is later serialized whole through IPC into storage.

## All findings today

- **[high]** secrets_storage @ files/src/main/claudeAssistant.ts:45 — The Claude API key is persisted as plaintext JSON in userData, and the 0o600 mode is not enforced when the file already exists.
- **[high]** injection_via_untrusted_peripheral @ files/src/main/main.ts:524 — Adapter-controlled strings reach innerHTML in the PDF report window with no escaping, giving a hostile OBD adapter script execution in that renderer.
- **[medium]** denial_of_service @ files/src/core/elm327Commander.ts:55 — ELM327Commander.onData appends every received chunk to an unbounded string buffer that is only cleared when a '>' prompt byte arrives.
- **[medium]** prompt_injection @ files/src/main/claudeAssistant.ts:81 — formatContext concatenates peripheral- and network-derived text into a <session-snapshot> fence without escaping the closing delimiter.
- **[medium]** dev_mode_attack_surface @ files/src/main/main.ts:40 — A runtime NODE_ENV env var makes any build load its UI from plain-HTTP localhost:3000 and open DevTools.
- **[medium]** input_validation @ files/src/main/main.ts:337 — The obd:connect IPC handler passes a renderer-supplied device path to SerialPort with no allowlist check.
- **[medium]** missing_csp @ files/src/main/main.ts:517 — The PDF report BrowserWindow has no Content-Security-Policy, so nothing blocks the inline script injected via SEC-002.
- **[medium]** electron_hardening @ files/src/main/main.ts:519 — webPreferences gaps: the report window disables contextIsolation, the main window disables sandbox, and neither installs navigation or window-open handlers.
- **[low]** rate_limiting @ files/src/main/main.ts:419 — The claude:ask IPC handler has no call throttle or cumulative token budget on a paid API.
- **[low]** secrets_exposure @ files/src/main/main.ts:541 — The CarsXE API key is interpolated unencoded into the request URL query string.
- **[low]** denial_of_service @ files/src/renderer/screens/DataLoggerScreen.tsx:65 — An active recording accumulates samples in an uncapped array that is later serialized whole through IPC into storage.
