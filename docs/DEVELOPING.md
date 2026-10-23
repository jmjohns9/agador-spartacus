# Developing Tattlestone

How to build, run and test the app. For how it fits together, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- **Node.js 22.12 or newer.** Electron 42 requires it; the container builds on `node:22-bookworm`.
- **macOS 13 Ventura or later** for the packaged app. Linux works for development and via Docker.
- **A build toolchain for the native modules** (`serialport`, `better-sqlite3`):
  - On macOS, Xcode Command Line Tools (`xcode-select --install`).
  - On Debian/Ubuntu, `python3 make g++`.

## Install and run

```bash
git clone git@github.com:jmjohns9/Tattlestone.git
cd Tattlestone/files
npm install      # postinstall rebuilds better-sqlite3 and serialport for Electron
npm run dev
```

`npm run dev` runs three processes at once:
- `tsc --watch` for the main process;
- `webpack --watch` for the renderer bundle;
- `electron .`, once `dist/main/main.js` exists.

To build the app and copy it into `/Applications`, run `npm run install:app`.

## Try it without an adapter

1. Open the **Connection** screen and click **Launch Emulator**.
2. To see the GMT800 module map and fuse data, click **Edit** on the vehicle card and set the vehicle to a 2004 Chevrolet Silverado 1500.

The simulator emulates a 2004 Silverado J1850 VPW session:

- Battery voltage steps from 12.89 V down to 11.8 V over four hours, reproducing a parasitic drain.
- The DTCs `B1982`, `P0300` and `U0100` are preloaded.
- Every sensor reading has realistic noise.

To run against a real adapter, see [HARDWARE.md](HARDWARE.md).

## Scripts

Run these from `files/`.

| Command | What it does |
|---|---|
| `npm run dev` | Watch-mode development with hot reload |
| `npm run build` | Compile the main process and bundle the renderer (production mode, no source maps) |
| `npm run dist` | Build and package a macOS `.dmg` / `.zip` into `release/` via electron-builder |
| `npm run install:app` | Build, ad-hoc sign and install `Tattlestone.app` into `/Applications` (Apple Silicon only: it copies from `release/mac-arm64`) |
| `npm run typecheck` | Type-check the renderer and the main process (against its own tsconfig) |
| `npm test` | Run the `node:test` suites |
| `npm run lint:styles <files>` | Check screens against the design-system styling rules |
| `npm run gen:dtcs` | Regenerate `dtcCatalog.generated.ts` |
| `npm run gen:obdex` | Regenerate `dtcGeneric.generated.ts` from OBDex |
| `node scripts/check-doc-links.mjs <files.md>` | Check that relative links and images in Markdown files exist |

## Testing

```bash
cd files && npm test && npm run typecheck
```

The suites sit next to the code they test:

| Suite | Covers |
|---|---|
| `src/core/elm327Commander.test.ts` | Closing the ELM327 commander mid-initialize or mid-command, and sending after close |
| `src/core/obdProtocolManager.test.ts` | Polling staying stopped when stopped during a DTC scan or VIN read |
| `src/core/readOnly.test.ts` | The command layer refusing services that clear, reset, actuate or write |
| `src/main/tcpPort.test.ts` | Network Mode: parsing `tcp://host:port` targets and the socket port |
| `src/renderer/theme/theme.test.ts` | Contrast of the status text colours, and the light-only generated CSS |
| `src/renderer/components/ui/*.test.ts` | Gauge geometry, status logic, component barrel exports |
| `src/renderer/components/shell/shellLogic.test.ts` | Toolbar battery status and connection tone |
| `scripts/check-styles.test.mjs` | The screen style linter |
| `scripts/check-doc-links.test.mjs` | The Markdown link checker |
| `src/core/dtcLookup.test.ts` | Curated codes winning over OBDex, and the OBDex mapping |
| `src/main/nhtsa.test.ts` | Parsing NHTSA recalls, bulletins and complaints, and the model-name fallback |
| `src/main/assistantGrounding.test.ts` | The assistant's reference block: sources, make cautions, bulletins, prompt fencing |
| `src/main/vinDecoder.test.ts` | Merging offline and online VIN results; offline decoding runs under `npm run test:electron` |
| `src/renderer/logic/safety.test.ts` | Bulletin search and the reported-code filter |
| `firmware/uno-q-bridge/test_obd_tcp_bridge.py` | The UNO Q bridge (run with `python3 -m unittest`) |

## Screenshots

```bash
npm run build && node scripts/capture-screens.mjs .screens/current
```

This writes a PNG of every screen, using a throwaway profile so your real app data is never touched. The README uses a subset of them from `docs/screenshots/`.

## Running in Docker (headless)

The container runs the full Electron GUI under Xvfb and exposes it over noVNC. This is useful for CI, for a headless shop machine, or for driving the app from a browser.

```bash
VNC_PASSWORD=choose-one docker compose up --build
# then open http://localhost:6080/vnc.html and enter that password
```

The noVNC session is full control of the app (the stored Claude API key, saved sessions, a connected vehicle), so:

- It is published on `127.0.0.1` only. To reach it from another machine, use an SSH tunnel (`ssh -L 6080:localhost:6080 host`) rather than opening the port.
- It always has a password. Without `VNC_PASSWORD`, one is generated and printed by `docker compose logs obd-review`.
- The app runs as the image's unprivileged `node` user.

Details worth knowing:

- `/dev` is live-mounted, so an adapter plugged in after startup is visible without a restart. `device_cgroup_rules` limit the container to USB-serial (`c 188:*`) and CDC-ACM (`c 166:*`) character devices, and the user is in `dialout`.
- App data (`storage.db`, `storage.json`) persists in the `obd-data` volume, mounted at `/home/node/.config`. A volume created by an earlier image (mounted at `/root/.config`) is not picked up automatically.
- `npm ci`'s postinstall rebuilds the runtime native modules, `better-sqlite3` and `serialport`, for Electron's ABI. Renderer-only packages are devDependencies, so the icon tooling's `ttf2woff2` addon, which doesn't compile against Electron 42, is not rebuilt.
