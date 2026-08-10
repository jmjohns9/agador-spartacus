# Security review — 2026-08-10

7 medium · 7 low

## New since previous run (2026-08-09)

- **[medium]** denial_of_service @ files/src/core/obdProtocolManager.ts:259 — parseDTCResponse builds one DTCCode object per 4 hex chars of an adapter-controlled response with no cap on the resulting array length.
- **[low]** rate_limiting @ files/src/main/main.ts:570 — The carsxe:decode handler proxies a metered third-party API for the renderer with no throttle, cache, or per-session call cap.

## All findings today

- **[medium]** denial_of_service @ files/src/core/obdProtocolManager.ts:259 — parseDTCResponse builds one DTCCode object per 4 hex chars of an adapter-controlled response with no cap on the resulting array length.
- **[medium]** prompt_injection @ files/src/main/claudeAssistant.ts:184 — Adapter- and catalog-derived text is concatenated into a <session-snapshot> fence with no escaping of the closing delimiter.
- **[medium]** electron_hardening @ files/src/main/main.ts:31 — The main BrowserWindow runs with sandbox disabled and registers no navigation or window-open handlers.
- **[medium]** dev_mode_attack_surface @ files/src/main/main.ts:41 — A runtime NODE_ENV read decides whether the main window loads remote HTTP content and opens DevTools, with no packaged-build guard.
- **[medium]** input_validation @ files/src/main/main.ts:338 — The obd:connect IPC handler passes a renderer-supplied device path straight to SerialPort without checking it against the enumerated port list.
- **[medium]** secrets_exposure @ files/src/main/main.ts:574 — The CarsXE API key is placed unencoded in a URL query string, where it is exposed to proxy and server access logs.
- **[medium]** injection_via_untrusted_peripheral @ files/src/renderer/screens/LogsScreen.tsx:95 — Adapter-derived log messages are written into exported CSV fields with no neutralization of spreadsheet formula prefixes.
- **[low]** secrets_storage @ files/src/main/claudeAssistant.ts:70 — When the OS keychain is unavailable, saveConfig falls back to writing the Claude API key to disk in plaintext.
- **[low]** input_validation @ files/src/main/main.ts:410 — The obd:decode-vin handler applies no shape or length check to the renderer-supplied VIN before putting it in an outbound URL path.
- **[low]** rate_limiting @ files/src/main/main.ts:452 — The claude:ask handler bounds concurrency to one in-flight request but applies no rate limit or token budget.
- **[low]** missing_csp @ files/src/main/main.ts:550 — The hidden PDF-report BrowserWindow loads a template that carries no Content-Security-Policy and receives no CSP header from the main process.
- **[low]** electron_hardening @ files/src/main/main.ts:552 — The PDF-report BrowserWindow disables contextIsolation and then executes a script string built from a renderer-supplied payload.
- **[low]** rate_limiting @ files/src/main/main.ts:570 — The carsxe:decode handler proxies a metered third-party API for the renderer with no throttle, cache, or per-session call cap.
- **[low]** denial_of_service @ files/src/renderer/screens/DataLoggerScreen.tsx:65 — startRecording appends samples to an in-memory array on a timer with no cap on recording length or sample count.
