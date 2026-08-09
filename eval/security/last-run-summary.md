# Security review — 2026-08-09

1 high · 6 medium · 7 low

## New since previous run (2026-08-08)

- **[low]** denial_of_service @ files/src/core/elm327Commander.ts:174 — readVIN spreads an unbounded byte array into String.fromCharCode, which throws once the adapter returns enough frames.
- **[low]** secrets_storage @ files/src/main/claudeAssistant.ts:70 — The Claude API key falls back to plaintext on disk when the OS keychain is unavailable, and pre-existing plaintext keys persist until the next save.

## All findings today

- **[high]** denial_of_service @ files/src/core/elm327Commander.ts:56 — The ELM327 receive buffer grows without bound when the adapter never emits the '>' prompt terminator.
- **[medium]** prompt_injection @ files/src/main/claudeAssistant.ts:184 — Adapter- and ECU-derived text is concatenated into the <session-snapshot> prompt fence with no escaping of the closing delimiter.
- **[medium]** electron_hardening @ files/src/main/main.ts:30 — The main BrowserWindow runs with sandbox disabled and no navigation or window-open handlers.
- **[medium]** dev_mode_attack_surface @ files/src/main/main.ts:40 — NODE_ENV read at runtime decides whether the packaged app loads its renderer from a local HTTP server instead of the bundled files.
- **[medium]** input_validation @ files/src/main/main.ts:337 — The obd:connect IPC handler passes a renderer-supplied device path straight to SerialPort with no validation or allowlist.
- **[medium]** secrets_exposure @ files/src/main/main.ts:541 — The CarsXE API key is sent as a URL query parameter and is not URL-encoded.
- **[medium]** injection_via_untrusted_peripheral @ files/src/renderer/screens/LogsScreen.tsx:95 — Adapter-derived log text is written into exported CSV without neutralizing spreadsheet formula prefixes.
- **[low]** denial_of_service @ files/src/core/elm327Commander.ts:174 — readVIN spreads an unbounded byte array into String.fromCharCode, which throws once the adapter returns enough frames.
- **[low]** secrets_storage @ files/src/main/claudeAssistant.ts:70 — The Claude API key falls back to plaintext on disk when the OS keychain is unavailable, and pre-existing plaintext keys persist until the next save.
- **[low]** input_validation @ files/src/main/main.ts:379 — The VIN passed to obd:decode-vin reaches a third-party API request with no length or charset check.
- **[low]** rate_limiting @ files/src/main/main.ts:419 — The claude:ask IPC handler has no throttle or spend cap on a billed API call.
- **[low]** missing_csp @ files/src/main/main.ts:517 — The offscreen PDF report window renders session data with no Content-Security-Policy.
- **[low]** electron_hardening @ files/src/main/main.ts:519 — The offscreen PDF report window disables contextIsolation.
- **[low]** denial_of_service @ files/src/renderer/screens/DataLoggerScreen.tsx:58 — An in-progress recording accumulates samples in memory with no cap on count or duration.
