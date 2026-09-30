# Product — Project Agador Spartacus

**Project Agador Spartacus** (package name: `silverado-dx`) is a macOS desktop OBD-II diagnostic suite built with Electron. It connects to any ELM327-class adapter over Bluetooth or USB serial and provides real-time vehicle telemetry, fault-code reading, and a parasitic-draw isolation workflow.

## Origin and scope

Started as a targeted tool for chasing a parasitic battery drain on a **2004 Chevrolet Silverado 1500 Z71 (GM GMT800, J1850 VPW)**. The protocol layer is now vehicle-agnostic; platform-specific reference data (module maps, fuse panel layouts, draw checklists) is resolved from a registry (`gmt800` → `generic` fallback). Silverado-specific text and data must be gated on `platform.id === 'gmt800'`.

## Core capabilities

- **Live telemetry** — sequential PID polling loop with three priority tiers (fast every cycle, normal every 3rd, slow every 10th). 34-PID catalog with SAE J1979 decode formulas.
- **Fault codes** — DTC scan of stored, pending and permanent codes (Mode 03/07/0A), a 371-entry curated code catalog, live-snapshot capture when a code is first read, optional CarsXE lookup. **No clearing** — see Safety.
- **Vehicle health** — battery state, check-engine lamp, and I/M readiness decoded from PID 0101.
- **Parasitic draw suite** — battery drain rate measured over time, voltage timeline, interactive fuse map, step-by-step isolation checklist. The Module monitor lists platform modules but has no wake detection yet.
- **GM-specific** — read-only PCM identity over J1850 VPW Mode 3C (VIN, HW/SW IDs, calibration blocks from P01/P59-family PCMs). Refused on non-VPW vehicles.
- **EcuBus-Pro** — a clearly labelled **demo** of CAN/UDS/LIN/DoIP tooling. It shows sample data, offers read-only UDS services only, and sends nothing.
- **Claude assistant** — in-app chat that receives a live session snapshot as context. Default model Claude Opus 5.5. API key encrypted via Electron `safeStorage`.
- **Records** — data logger (CSV/JSON), session snapshots, live-vs-snapshot compare, session log, PDF report.
- **Storage** — flat JSON (atomic writes) or SQLite (`better-sqlite3`), migratable in-app.
- **macOS-native UI** — System / Light / Dark appearance, sidebar and toolbar shell. See `tech.md` → UI / styling.

## Reference hardware

Primary adapter: **OBDLink MX+** (Bluetooth Classic, ELM327 v1.5 superset, GM-LAN + J1850 VPW, `STx` extended commands). Any ELM327-class serial adapter should work; `STx`-dependent features degrade gracefully (the adapter name falls back to its ATZ/ATI banner).

## Built-in simulator

The app ships an offline ELM327 simulator that emulates a 2004 Silverado J1850 VPW session — no vehicle or adapter required for development. Start it from the **Connection** screen → **Launch Emulator**. Set the vehicle to a 2004 Chevrolet Silverado 1500 to get the GMT800 module map and fuse data.

## Safety constraint

**The app is strictly read-only: nothing in it writes to a control module.** This constraint must not be broken.

- There is no Clear DTCs feature, and none should be added.
- `ELM327Commander.send` refuses services that clear codes, actuate, reset, write or reprogram (OBD 04/08; UDS/GM 11, 14, 28, 2E, 2F, 31, 34–37, 3B, 85).
- `files/src/core/readOnly.test.ts` fails if a session sends anything other than adapter (AT/ST) commands and reads (01, 03, 07, 09, 0A, 3C).
