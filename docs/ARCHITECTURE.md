# How Tattlestone is built

The app is built with Electron, React and TypeScript, and talks to an ELM327-class adapter over Bluetooth, USB serial or TCP (Network Mode). The protocol layer works with any OBD-II vehicle. Platform-specific reference data (module maps, fuse panels, draw checklists) comes from a registry.

## Processes

```
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer (React 18 + Zustand)                                       │
│                                                                     │
│   App shell (Sidebar · Toolbar · ConnectionPopover)                 │
│   20 screens ── components/ui ── theme tokens (CSS variables)       │
│        │                                                            │
│        └── appStore (Zustand) ◄── IPC events                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │ contextBridge (contextIsolation: true)
┌────────────────────────────▼────────────────────────────────────────┐
│ Main process (Electron)                                             │
│                                                                     │
│   main.ts ── window, IPC handlers, connection sessions              │
│      │         (serialport, tcpPort for Network Mode, simulator)    │
│      │                                                              │
│   OBDProtocolManager ── poll loop, DTC scan, VIN read               │
│      │                                                              │
│   ELM327Commander ── AT command engine, timeouts, response framing  │
│                                                                     │
│   storageService · claudeAssistant · pcmDiagnostics                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Connection sessions.** Every connect starts a new session generation. Replies, port events, init chains and Bluetooth signal readings carry their session. Anything that arrives after its session has ended is dropped, and disconnecting cancels pending simulator replies. This is what makes rapid connect/disconnect cycles, cancelling a connect, and quitting mid-session safe.

**Network Mode.** `src/main/tcpPort.ts` gives a TCP socket the slice of the SerialPort interface the session code uses, so the ELM327 commander is unchanged. A target travels as a `tcp://host:port` string (default port 35000). The Arduino UNO Q bridge in `files/firmware/uno-q-bridge/` is one such target; see [HARDWARE.md](HARDWARE.md#network-mode-with-the-arduino-uno-q).

**`PlatformProfile`** (`src/core/platforms/`). The protocol layer doesn't depend on the vehicle, but module address maps, fuse layouts and draw checklists are platform-specific. A registry resolves the most specific profile for the vehicle (`gmt800`, then `generic`) and never returns undefined.

## ELM327 initialization sequence

```
ATZ      Reset adapter, clear all state
ATE0     Echo off
ATL0     Linefeed off
ATH0     Headers off
ATS0     Spaces off
ATSP0    Auto protocol detection
ATAT1    Adaptive timing level 1
010C     Protocol ping — forces protocol lock (J1850 VPW on GMT800)
ATDP     Read negotiated protocol
STI      OBDLink firmware version
STDI     OBDLink device info
ATRV     Live battery voltage
```

## Features in detail

**Live diagnostics**
- A sequential PID polling loop with three priority tiers:
  - Battery voltage and fast PIDs (RPM, ECM voltage) every cycle.
  - Normal PIDs every 3rd cycle.
  - Slow PIDs every 10th cycle.

  Commands never overlap on the serial line.
- An 87-PID catalog with SAE J1979 decode formulas, ranges, units and plain-English descriptions. The extended PIDs (wideband O2, catalyst temperatures, rail pressures, and distance, time and warm-ups since codes were cleared) are polled a few per slow cycle, and only when the ECU confirms it supports them.
- Refusals from the ECU are logged with their ISO 14229 reason (e.g. "Conditions not correct", NRC 0x22).
- Sparklines of recent history on the key metrics.
- VIN detection and decoding, offline first, which fills in the vehicle profile automatically.

**Fault codes**
- DTC scan across all supported modes (stored, pending, permanent). Codes are described from a curated catalog of 371 GMT800 codes, then from 9,533 generic SAE J2012 codes from OBDex. The app reads codes only; it cannot clear them.
- Freeze-frame capture and a viewer, saved per DTC.
- Optional CarsXE lookup for code descriptions, likely causes and repair guidance.

**Recalls and bulletins (NHTSA)**
- Safety recalls, manufacturer bulletins and owner complaints for the vehicle's year, make and model.
- Bulletins and complaints that cite a reported code are flagged; bulletin PDFs open from NHTSA.
- Cached for 30 minutes. NHTSA doesn't hold every service bulletin, and complaints are unverified owner reports.

**Parasitic draw suite**
- A module monitor that lists the platform's known modules by address with their draw risk. Wake detection isn't built yet, so module status stays "Unknown".
- A battery voltage timeline over long sessions.
- An interactive fuse map (interior panel and under-hood fuse/relay center), ordered by how likely each circuit is to cause a draw.
- A step-by-step draw isolation procedure, driven by the resolved platform profile.

**ECU information (any vehicle)**
- Mode 09 calibration IDs, calibration verification numbers (CVNs) and ECU names. A CVN that differs from stock for the same calibration ID means the ECU was reprogrammed.

**GM-specific**
- Read-only PCM identity over J1850 VPW Mode 3C: VIN, hardware and software IDs, and calibration and segment info from GM P01/P59-family PCMs.

**Records and reporting**
- A CSV/JSON data logger with recording playback.
- Session snapshots, and a live-versus-historic compare with overlay.
- HTML/PDF report generation.
- A choice of storage backend: a flat JSON file or SQLite (`better-sqlite3`), with migration between them in the app.

**Claude assistant**
- An in-app chat that receives a snapshot of the live session as context: current PIDs, active DTCs and the recent log.
- Answers about fault codes are grounded in Tattlestone's own data. For the vehicle's codes and any code typed in the question, it sends the catalog entry (GMT800 or OBDex) and the NHTSA bulletins and complaints that cite it. Claude names the source, says when a code isn't in the catalogs, and is warned when a GM meaning is applied to another make. Each answer shows a "Reference" line listing what it used.
- Selectable model, streaming responses, and chat export to Markdown.
- The API key is stored in the app's `userData` directory and encrypted at rest through the OS keychain (Electron `safeStorage`).

## Screens and navigation

There are 20 screens. The sidebar groups them like this:

| Group | Screens |
|---|---|
| (top) | **Connection** · **Claude assistant** |
| Overview | **Vehicle health** · **Live telemetry** · **All parameters** · **Data logger** |
| Subsystems | **Engine & fuel** · **Electrical** · **HVAC** · **Transmission** |
| Diagnostic | **Fault codes** (with active-code badge) · **Module monitor** · **Parasitic draw** · **Recalls & bulletins** |
| Advanced | **EcuBus-Pro** (CAN/UDS tooling) · **PCM identity** |
| Records | **Compare** · **Freeze frames** · **Session log** |
| (bottom) | **Settings** |

| Shortcut | Action |
|---|---|
| ⌃⌘S | Show or hide the sidebar |
| ⌘, | Open Settings |

## Design system

The full reference is [ui-styling.md](ui-styling.md). In short:

- **Brand.** Three colours: Basalt `#16171A`, Signal `#E8590C` and Paper `#F5F3EE`, set as `BRAND` in `renderer/theme/theme.ts`.
  - Signal orange appears only when the car is reporting something, such as a warning. Everything else is Basalt on Paper, and red is kept for critical states.
  - The mark is a Basalt stone with a T cut out of it and a Signal dot. The app icon puts it on a Limestone tile.
  - The wordmark and lockup SVGs live in `brand/`. `build_wordmark.py` regenerates them, `build_icon.py` regenerates `files/build/icon.icns`, and `build_social.py` regenerates the card at the top of the README, which is also the GitHub social preview. The wordmark is set in Helvetica Neue Bold as a stand-in for Neue Haas Grotesk.
- **Tokens.** Colours, type, spacing, radii and motion are defined in `renderer/theme/theme.ts`.
  - `buildThemeCSS()` turns them into CSS custom properties.
  - The app is light only: the main process pins `nativeTheme.themeSource` to `light`, so the window's vibrancy and native controls stay light in macOS dark mode.
- **Components.** Screens are built from `components/layout/UIComponents.tsx`, which re-exports `components/ui/*`.
- **Screen styling rules.** Screens never set their own colours, font families, letter-spacing, text-transform or borders. `npm run lint:styles <files>` enforces this.

## Repository layout

```
.
├── files/                             # The application
│   ├── src/
│   │   ├── main/                      # Electron main process
│   │   │   ├── main.ts                #   window, IPC handlers, connection sessions, simulator
│   │   │   ├── preload.ts             #   contextBridge API surface
│   │   │   ├── tcpPort.ts             #   Network Mode: ELM327 over a TCP socket
│   │   │   ├── storageService.ts      #   JSON + SQLite backends, migration
│   │   │   ├── claudeAssistant.ts     #   Claude API bridge, encrypted key store
│   │   │   ├── assistantGrounding.ts  #   reference data for the assistant's code answers
│   │   │   ├── nhtsa.ts               #   recalls, bulletins and complaints from NHTSA
│   │   │   └── vinDecoder.ts          #   offline (corgi) + online vPIC VIN decoding
│   │   ├── core/                      # Protocol layer (no Electron imports)
│   │   │   ├── elm327Commander.ts     #   AT engine, timeouts, retries, read-only guard
│   │   │   ├── elm327Simulator.ts     #   offline 2004 Silverado session
│   │   │   ├── obdParsers.ts          #   reply parsing: messages, ISO-TP, DTCs, VIN, PIDs
│   │   │   ├── obdProtocolManager.ts  #   poll loop, DTC scan, VIN read
│   │   │   ├── pidCatalog.ts          #   PID catalog, J1979 decode functions
│   │   │   ├── dtcCatalog.generated.ts #  371 curated codes (see scripts/gen-dtc-catalog.ts)
│   │   │   ├── dtcGeneric.generated.ts #  9,533 OBDex generic codes (npm run gen:obdex)
│   │   │   ├── dtcLookup.ts           #   curated catalog first, then OBDex
│   │   │   ├── pcmDiagnostics.ts      #   GM Mode 3C identity read (read-only)
│   │   │   └── platforms/             #   gmt800 · generic · registry
│   │   └── renderer/
│   │       ├── App.tsx                #   app shell, routing, IPC wiring, shortcuts
│   │       ├── screens/               #   20 screens
│   │       ├── store/appStore.ts      #   Zustand global state
│   │       ├── theme/                 #   theme.ts (tokens) · globalStyles.ts
│   │       └── components/            #   ui/ · shell/ · layout/ · ErrorBoundary.tsx
│   ├── firmware/uno-q-bridge/         # Arduino UNO Q: TCP bridge, ELM327 emulator, systemd units
│   ├── scripts/                       # DTC generators, icon, style linter, link checker, screenshots
│   ├── docker/                        # Dockerfile + Xvfb/noVNC entrypoint
│   └── assets/report.html             # PDF report template
├── brand/                             # Wordmark, lockup, icon and social-card sources
│   └── github/                        #   README banner, Arduino diagram, social preview
├── docs/
│   ├── DEVELOPING.md · ARCHITECTURE.md · HARDWARE.md · SECURITY.md
│   ├── ui-styling.md                  # Design system reference
│   ├── hardware/                      # Fuse-sensor parts list
│   ├── uno-q/                         # UNO Q Wi-Fi bridge and OBDLink bind guides
│   ├── screenshots/                   # README images
│   ├── history/                       # The original spec, hardware review and parts list
│   └── superpowers/                   # Design specs, plans, code-review notes
├── eval/                              # Automated review harness (see SECURITY.md)
├── docker-compose.yml                 # Headless container with noVNC on :6080
└── CHANGELOG.md
```

## Older documents

| Document | Contents |
|---|---|
| [superpowers/specs/2026-09-26-macos-redesign-design.md](superpowers/specs/2026-09-26-macos-redesign-design.md) | The macOS redesign spec |
| [superpowers/code-review-notes.md](superpowers/code-review-notes.md) | Bugs found during the redesign |
| [history/HARDWARE_SOFTWARE_COMPATIBILITY_REVIEW.md](history/HARDWARE_SOFTWARE_COMPATIBILITY_REVIEW.md) | Section-by-section protocol review, commander code validation, Bluetooth specifics |
| [history/README_SILVERADO_DX_PROJECT.md](history/README_SILVERADO_DX_PROJECT.md) | Original hardware/procurement doc index, decision matrices, troubleshooting |
| [history/OBD2_Mac_App_Prompt.md](history/OBD2_Mac_App_Prompt.md) | The original application specification |
| [history/DELIVERABLES_MANIFEST.txt](history/DELIVERABLES_MANIFEST.txt) | Deliverable inventory |
