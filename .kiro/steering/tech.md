# Tech Stack

## Runtime & framework

- **Electron 42** — desktop shell; main window has `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- **React 18** — renderer UI
- **TypeScript 5** (strict mode) — all layers
- **Zustand 4** — renderer state (`useAppStore`)
- **better-sqlite3 12** — SQLite storage backend (native module)
- **serialport 12** — serial/Bluetooth adapter communication (native module)
- **@anthropic-ai/sdk** — Claude API (streaming; server-side refusal fallback on Opus 5.5 / Fable 5.1 / Sonnet 5.5)

Only the Claude SDK, serialport and better-sqlite3 are runtime `dependencies`. React, react-dom, zustand and the Tabler icon font are bundled by webpack, so they are `devDependencies` and are not packaged.

## Build system

Two TypeScript compilations feed one Electron process:

| Layer | Config | Output |
|---|---|---|
| Main process + core + shared | `tsconfig.main.json` → `tsc` | `dist/main/` |
| Renderer (React) | `tsconfig.json` → Webpack 5 + ts-loader, target `web` | `dist/renderer/` |

- `npm run build` bundles the renderer in production mode with no source maps; `npm run watch:renderer` uses development mode.
- Packaging: `electron-builder` → macOS `.dmg` + `.zip` in `release/`. Minimum macOS 13.0.
- Native modules must match Electron's ABI. `npm install` runs `electron-builder install-app-deps` on `postinstall`, which rebuilds `better-sqlite3` and `serialport` only. Under plain Node, `better-sqlite3` then fails to load; the SQLite tests skip there and run with `npm run test:electron`.

## UI / styling

macOS-native design (reference: Xcode, Instruments, Activity Monitor). Full reference: `docs/ui-styling.md`; spec: `docs/superpowers/specs/2026-09-26-macos-redesign-design.md`.

- Inline React style objects + CSS custom properties. No CSS modules, Tailwind or styled-components.
- Tokens live in `renderer/theme/theme.ts`: `LIGHT`/`DARK` palettes, `TYPE`, `WEIGHT`, `NUMERIC`, `SPACE` (4pt grid), `RADIUS` (6 / 10 / 12), `MOTION`, `STATUS_TEXT`/`STATUS_FILL`. `buildThemeCSS()` turns them into CSS variables under `prefers-color-scheme`; `index.tsx` injects them (with `theme/globalStyles.ts`) above the ErrorBoundary.
- Appearance: the main process sets `nativeTheme.themeSource` from the saved override (`main/appearance.ts`); Settings → Theme (System / Light / Dark).
- Screens compose components from `components/layout/UIComponents.tsx` (implementations in `components/ui/`). Screens never set their own colours, font families, letter-spacing, text-transform or borders — enforced by `npm run lint:styles <files>`.
- Fonts: SF Pro via `-apple-system`; SF Mono (`NUMERIC`) only for numbers, VINs, hex and PIDs. No web fonts — the app works offline, and the CSP allows no remote origins.
- Status colour appears only for warn/crit; normal readings are neutral. Thresholds come from the PID catalog via `pidStatus()` so every screen agrees.
- Icons: Tabler Icons webfont, bundled locally, `<i className="ti ti-name" aria-hidden />`; 16px in chrome.
- Accessibility: label inputs with `<label htmlFor>`, expose toggle and expand state (`aria-pressed` / `aria-expanded`, e.g. `DataRow`'s `pressed` / `expanded`), and mark decorative icons `aria-hidden`.

## Common commands

All commands run from `files/`:

```bash
npm run dev            # tsc --watch + webpack --watch + electron
npm run typecheck      # renderer and main process configs
npm run build          # production build (no packaging)
npm run dist           # package into release/
npm test               # node:test suites (SQLite cases skip under plain Node)
npm run test:electron  # storage tests incl. SQLite, under Electron's runtime
npm run lint:styles src/renderer/screens/*.tsx
npm run gen:dtcs       # rebuild the DTC catalog from data/dtc-catalog.xlsx
node scripts/capture-screens.mjs .screens/current   # light + dark screenshots (after build)
```

## Testing

Framework: Node's built-in `node:test`, run through ts-node. Test files sit next to the code (`src/**/*.test.ts`, `scripts/*.test.mjs`). Protocol tests run against the in-repo simulator or a scripted fake adapter; no Electron or serial port needed.

Coverage includes:

- Reply parsing: DTCs, VIN, PIDs, ISO-TP.
- PID formulas against J1979 values, and simulator mask consistency.
- The commander: late replies, the write-service guard.
- The manager: discovery, the bus lock, failed scans.
- Mode 3C parsing and the adapter restore after a PCM read.
- The read-only session test.
- Storage (atomic writes, corrupt files, migration, freeze frames).
- The store.
- Screen verdicts, theme contrast, and the style linter.

When fixing a bug, add a failing test first.

## Docker

```bash
VNC_PASSWORD=choose-one docker compose up --build
# then open http://localhost:6080/vnc.html
```

- noVNC is bound to `127.0.0.1` and always password-protected: without `VNC_PASSWORD` a password is generated and printed to the logs.
- The app runs as the unprivileged `node` user; data persists at `/home/node/.config`.
- `/dev` is live-mounted for hot-plugged adapters; `device_cgroup_rules` limit access to USB-serial and CDC-ACM devices.

## Security constraints

- Keep `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. The window may not navigate away from the app's page or open windows.
- Register IPC handlers with `handle()` in `main.ts` (never bare `ipcMain.handle`) so the sender check applies.
- Claude API key stored via `safeStorage` (Linux `basic_text` does not count as encryption); never log it or return more than a `…last4` hint to the renderer.
- Adapter input on the ELM327 receive path must remain bounded.
- External fetches need a timeout (`AbortSignal.timeout`) and a `res.ok` check.
- No write primitives to any control module — ever (see `product.md` → Safety).
