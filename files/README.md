# files/ — the application

This folder is the Electron app. The project overview, screenshots, features and hardware notes are in the [root README](../README.md); this page is only what you need to work on the code.

## Setup

```bash
npm install      # postinstall rebuilds better-sqlite3 and serialport for Electron
npm run dev      # tsc --watch (main) + webpack --watch (renderer) + electron
```

Node 18+ (22 recommended) and a native build toolchain are required: Xcode Command Line Tools on macOS, `python3 make g++` on Linux.

To try it without an adapter, open **Connection** and click **Launch Emulator**. Set the vehicle to a 2004 Chevrolet Silverado 1500 to get the GMT800 module map and fuse data.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Watch mode: main process, renderer, and Electron |
| `npm run build` | Compile the main process and bundle the renderer in production mode |
| `npm run dist` | Build and package a macOS `.dmg` / `.zip` into `release/` |
| `npm test` | `node:test` suites (SQLite cases skip under plain Node) |
| `npm run test:electron` | Storage tests, including SQLite, under Electron's runtime |
| `npm run typecheck` | Type-check the renderer and the main process |
| `npm run lint:styles <files>` | Check screens against the design-system styling rules |
| `npm run gen:dtcs` | Regenerate the DTC catalog from `data/dtc-catalog.xlsx` |

## Layout

| Path | Contents |
|---|---|
| `src/main/` | Electron main process: window, IPC handlers, connection sessions, storage, Claude assistant |
| `src/core/` | Protocol layer with no Electron imports: ELM327 commander, reply parsers, poll loop, PID and DTC catalogs, PCM identity, simulator, platform profiles |
| `src/renderer/` | React UI: app shell, 19 screens, Zustand store, `logic/` (tested screen verdicts), `components/ui/` |
| `src/shared/types.ts` | Types shared across the IPC boundary |
| `scripts/` | DTC catalog generator, style linter, screenshot harness, icon generator |
| `docker/` | Headless image (Xvfb + password-protected noVNC) |
| `build/` | App icons used by electron-builder |

## Rules worth knowing

- **Read-only.** Nothing may change a control module. `ELM327Commander.send` refuses write, reset, clear and reprogramming services, and `src/core/readOnly.test.ts` fails if a session sends anything but adapter commands and reads.
- **One owner of the adapter.** Anything that sends more than a single command (scans, VIN, PCM read) goes through `OBDProtocolManager.exclusive()`, which pauses polling.
- **Parse per message.** Reply parsing lives in `src/core/obdParsers.ts`, which splits a reply into one message per frame or ECU and reassembles CAN multi-frame replies before decoding.
- **Screens don't style themselves.** See [`docs/ui-styling.md`](../docs/ui-styling.md).

## Environment variables

| Variable | Used for |
|---|---|
| `CARSXE_API_KEY` | Optional CarsXE lookups on the Fault codes screen. Only seen when the app is started from a terminal. |
| `VNC_PASSWORD` | Docker only: the noVNC password. |

The Claude API key is entered in the app (Claude assistant screen) and stored encrypted in the app's `userData` folder.
