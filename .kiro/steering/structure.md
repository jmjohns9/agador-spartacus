# Project Structure

## Repository root

```
agador-spartacus/
├── files/                  # The application (all source lives in files/src/)
├── eval/                   # Automated code review harness
├── docs/                   # ui-styling.md, screenshots, specs, plans, code-review report
├── .kiro/steering/         # These steering files
├── docker-compose.yml      # Headless container, noVNC on 127.0.0.1:6080 (password-protected)
├── HARDWARE_SOFTWARE_COMPATIBILITY_REVIEW.md
└── README.md               # Authoritative project reference
```

---

## Application source — `files/src/`

Four layers. **`src/core/` has no Electron imports** — this is intentional and must be preserved. Tests sit next to the code they test (`*.test.ts`).

```
files/src/
├── shared/
│   └── types.ts                  # Types shared across the IPC boundary
│
├── core/                         # Protocol layer — pure TS, no Electron
│   ├── elm327Commander.ts        # AT command engine: serialized sends, timeouts,
│   │                             #   late-reply handling, read-only write-service guard
│   ├── obdParsers.ts             # All reply parsing: messages, ISO-TP, DTCs, VIN, PIDs
│   ├── obdProtocolManager.ts     # Poll loop, PID discovery, DTC scan, exclusive() bus lock
│   ├── pidCatalog.ts             # 34 PIDs with J1979 decode/format and warn/crit limits
│   ├── dtcCatalog.generated.ts   # 371 codes — hand-curated despite the name
│   ├── pcmDiagnostics.ts         # GM Mode 3C identity read (read-only)
│   ├── elm327Simulator.ts        # Offline 2004 Silverado J1850 VPW session
│   ├── readOnly.test.ts          # Enforces the read-only rule over a whole session
│   └── platforms/                # PlatformProfile: types, registry (index), gmt800, generic
│
├── main/                         # Electron main process
│   ├── main.ts                   # Window, IPC handlers (sender-checked), connection sessions
│   ├── preload.ts                # contextBridge API surface (window.electronAPI)
│   ├── storageService.ts         # JSON (atomic, cached) + SQLite backends, migration
│   ├── claudeAssistant.ts        # Anthropic SDK bridge, safeStorage key encryption
│   └── appearance.ts             # Saved System / Light / Dark override
│
└── renderer/                     # React UI
    ├── index.tsx                 # Entry: injects theme CSS, ErrorBoundary, App
    ├── App.tsx                   # Shell: Sidebar + Toolbar, SCREENS map, IPC wiring, shortcuts
    ├── store/appStore.ts         # Zustand store + selectors
    ├── logic/verdicts.ts         # Tested screen verdicts: drain rate, trends, SoC, readiness
    ├── theme/                    # theme.ts (tokens, buildThemeCSS) · globalStyles.ts
    ├── components/
    │   ├── ui/                   # Card, Metric, Gauge, Sparkline, VoltageTimeline,
    │   │                         #   Button, SegmentedControl, Badge, AlertBanner, DataRow, …
    │   ├── layout/UIComponents.tsx  # The component surface screens import (re-exports ui/)
    │   ├── shell/                # Sidebar, Toolbar, ConnectionPopover, navItems, shellLogic
    │   └── ErrorBoundary.tsx
    └── screens/                  # One file per screen (19)
```

---

## Supporting directories

```
files/
├── scripts/
│   ├── gen-dtc-catalog.ts   # Builds the catalog from data/dtc-catalog.xlsx; writes .new unless --force
│   ├── check-styles.mjs     # Screen style linter (npm run lint:styles)
│   ├── capture-screens.mjs  # Light + dark screenshots of every screen
│   └── make-icon.mjs        # Placeholder app icon → build/icon.icns
├── build/                   # App icons for electron-builder (tracked)
├── assets/report.html       # PDF report template
└── docker/                  # Dockerfile + entrypoint (Xvfb, password-protected noVNC)
```

`eval/` holds the scheduled review harness (security, deps, quality, performance, tests, architecture), each with a prompt, `expected.json`, history and `score.py`.

---

## Key architectural seams

**`obdParsers.ts`** — every reply is parsed here, one message per frame/ECU, with CAN ISO-TP multi-line replies reassembled first. Never parse a flattened reply string: that invented phantom DTCs and corrupted VINs.

**`OBDProtocolManager.exclusive()`** — any operation that sends more than one command or changes adapter settings (discovery, VIN read, DTC scan, PCM read) must run inside it. It pauses polling and serialises access to the adapter.

**`ELM327Commander.send`** — the only path to the adapter. It serialises commands, drops a timed-out command's late reply, and refuses write services.

**`PlatformProfile` registry (`core/platforms/index.ts`)** — `resolvePlatform()` never returns `undefined`. Add platforms before `GENERIC`.

**`contextBridge` (`main/preload.ts`)** — the only channel between renderer and main. Every `ipcMain` handler goes through `handle()` in `main.ts`, which refuses senders other than the app's own page. Keep `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.

**`appStore`** — select narrowly with `useAppStore(selector)`; never call `useAppStore()` without a selector. Use a shared constant, not `?? []`, as a fallback for missing arrays. Read data you only need at the moment of an action with `useAppStore.getState()`.

**`renderer/logic/verdicts.ts`** — status colours and verdict text belong here as pure, tested functions (`pidStatus`, `batterySoC`, `dropMvPerMin`, `readinessMonitors`, …), not inline in JSX.

---

## Adding a new screen

1. Create `src/renderer/screens/MyScreen.tsx`, built from `components/layout/UIComponents.tsx`.
2. Add the id to the `ScreenId` union in `store/appStore.ts`.
3. Add a nav entry to `NAV_GROUPS` in `components/shell/navItems.ts`.
4. Add it to the `SCREENS` map in `App.tsx`.
5. Run `npm run lint:styles src/renderer/screens/MyScreen.tsx`.

## Adding a new platform

1. Create `src/core/platforms/myplatform.ts` implementing `PlatformProfile`.
2. Import it and insert it before `GENERIC` in `src/core/platforms/index.ts`.
