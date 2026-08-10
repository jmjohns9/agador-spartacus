# Performance review — 2026-08-10

Scope: `files/src` (40 files scanned) @ `b47bcf1`

| Severity | Count |
| --- | --- |
| critical | 0 |
| high | 3 |
| medium | 6 |
| low | 3 |
| **total** | **12** |

## New since previous run (first run)

- **[high]** unbounded_buffer @ files/src/renderer/screens/DataLoggerScreen.tsx:65 — The in-progress recording sample buffer grows without any cap for as long as the user leaves the logger running.
- **[high]** large_synchronous_work @ files/src/renderer/screens/DataLoggerScreen.tsx:234 — Every saved recording is fully JSON-serialized during render solely to display its size, on a component that re-renders on every PID reading.
- **[high]** excessive_ipc_or_rerender @ files/src/renderer/App.tsx:144 — The App root subscribes to the entire store with no selector, so every PID reading re-renders the whole component tree including the active screen.
- **[medium]** missing_short_circuit @ files/src/renderer/store/appStore.ts:278 — The unchanged-value fast path in updatePIDReading still returns a partial object, so zustand replaces the state and notifies every subscriber anyway.
- **[medium]** hot_loop_allocation @ files/src/renderer/store/appStore.ts:283 — Each changed PID reading rebuilds the full 500-point history array twice and shallow-clones the entire history and liveData maps.
- **[medium]** large_synchronous_work @ files/src/main/main.ts:236 — RSSI polling spawns the system_profiler subprocess every 3 seconds and JSON-parses its entire Bluetooth dump on the Electron main thread.
- **[medium]** quadratic_algorithm @ files/src/core/elm327Commander.ts:79 — The serial RX handler re-scans the entire accumulated receive buffer for the prompt character on every incoming chunk.
- **[medium]** sequential_await_in_loop @ files/src/core/pcmDiagnostics.ts:187 — readIdentity awaits 27 PCM block reads in sequence with a 1200ms per-block timeout and no early exit, compounding to roughly half a minute with PID polling paused throughout.
- **[medium]** missing_short_circuit @ files/src/renderer/components/layout/UIComponents.tsx:166 — useStaleness re-renders its tile twice a second regardless of whether the staleness flag changed, and tears down and recreates its interval on every reading.
- **[low]** hot_loop_allocation @ files/src/renderer/components/layout/UIComponents.tsx:550 — Sparkline rebuilds a up-to-500-point polyline string on every reading for a 36px decorative graphic rendered at 0.3 opacity.
- **[low]** hot_loop_allocation @ files/src/renderer/App.tsx:239 — The status-bar telemetry selector allocates an array and runs two filter passes over the whole live map on every store notification.
- **[low]** redundant_recomputation @ files/src/renderer/components/layout/UIComponents.tsx:792 — StatusBar's rate-sampling interval is destroyed and recreated on every PID reading because the effect depends on the whole live map.

## All findings today

### high

- **PRF-001** `unbounded_buffer` — files/src/renderer/screens/DataLoggerScreen.tsx:65
  The in-progress recording sample buffer grows without any cap for as long as the user leaves the logger running.
  _Fix:_ Bound the buffer the way the rest of the app does — cap `samples` at an explicit MAX_SAMPLES and either stop recording with a visible notice or drop-oldest via a splice block.

- **PRF-002** `large_synchronous_work` — files/src/renderer/screens/DataLoggerScreen.tsx:234
  Every saved recording is fully JSON-serialized during render solely to display its size, on a component that re-renders on every PID reading.
  _Fix:_ Compute the size once when recordings are loaded, or persist `sizeBytes` on the DataRecording at save time.

- **PRF-003** `excessive_ipc_or_rerender` — files/src/renderer/App.tsx:144
  The App root subscribes to the entire store with no selector, so every PID reading re-renders the whole component tree including the active screen.
  _Fix:_ Split into per-field selectors as the screens already do, or select actions once via a stable equality-fn subscription.

### medium

- **PRF-004** `missing_short_circuit` — files/src/renderer/store/appStore.ts:278
  The unchanged-value fast path in updatePIDReading still returns a partial object, so zustand replaces the state and notifies every subscriber anyway.
  _Fix:_ Return the state object itself so `Object.is` matches and zustand skips the notification entirely.

- **PRF-005** `hot_loop_allocation` — files/src/renderer/store/appStore.ts:283
  Each changed PID reading rebuilds the full 500-point history array twice and shallow-clones the entire history and liveData maps.
  _Fix:_ Use a fixed-capacity ring buffer with a write index, or at minimum collapse the `slice` + spread into one allocation.

- **PRF-006** `large_synchronous_work` — files/src/main/main.ts:236
  RSSI polling spawns the system_profiler subprocess every 3 seconds and JSON-parses its entire Bluetooth dump on the Electron main thread.
  _Fix:_ Lengthen the interval, skip ticks while a previous execFile is outstanding, and pre-check with a substring before JSON.parse.

- **PRF-007** `quadratic_algorithm` — files/src/core/elm327Commander.ts:79
  The serial RX handler re-scans the entire accumulated receive buffer for the prompt character on every incoming chunk.
  _Fix:_ Scan only the newly arrived chunk — ELM_PROMPT is a single character, so there is no cross-chunk boundary case.

- **PRF-008** `sequential_await_in_loop` — files/src/core/pcmDiagnostics.ts:187
  readIdentity awaits 27 PCM block reads in sequence with a 1200ms per-block timeout and no early exit, compounding to roughly half a minute with PID polling paused throughout.
  _Fix:_ Bail out early when the first few blocks (e.g. the VIN composite) all return null, and report the module as unsupported.

- **PRF-009** `missing_short_circuit` — files/src/renderer/components/layout/UIComponents.tsx:166
  useStaleness re-renders its tile twice a second regardless of whether the staleness flag changed, and tears down and recreates its interval on every reading.
  _Fix:_ Commit state only when the derived flag flips, and key the effect on staleness-relevant inputs rather than the raw timestamp. A single shared ticker would remove the per-tile timers.

### low

- **PRF-010** `hot_loop_allocation` — files/src/renderer/components/layout/UIComponents.tsx:550
  Sparkline rebuilds a up-to-500-point polyline string on every reading for a 36px decorative graphic rendered at 0.3 opacity.
  _Fix:_ Downsample to ~200 points before building the string and compute min/max in one reduce pass.

- **PRF-011** `hot_loop_allocation` — files/src/renderer/App.tsx:239
  The status-bar telemetry selector allocates an array and runs two filter passes over the whole live map on every store notification.
  _Fix:_ Move the freshness tally to a 1s timer reading `useAppStore.getState().liveData`.

- **PRF-012** `redundant_recomputation` — files/src/renderer/components/layout/UIComponents.tsx:792
  StatusBar's rate-sampling interval is destroyed and recreated on every PID reading because the effect depends on the whole live map.
  _Fix:_ Install the interval once with an empty dependency array and read the map inside the tick via `getState()`.
