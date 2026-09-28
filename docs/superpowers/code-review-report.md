# Code review report: Project Agador Spartacus

- **Date:** 2026-09-28
- **Branch:** `review/code-review` (from `main` at 58b830b)
- **Scope:** every line of `files/src` (about 13,000 lines), plus the build config, Docker setup, and the stale files in `files/`.
- **Method:** four parallel area reviews. Every finding cites a file and line, a concrete failure scenario, and a suggested fix. A finding reported by more than one reviewer is merged into one entry, and its source IDs are listed.
- **Baseline:** `npm test` passes 33/33 and `npm run typecheck` is clean. Those checks miss almost everything below, because no tests cover parsing, decoding, storage or screen logic.

## Contents

- [Headline](#headline)
- [Decision needed](#decision-needed)
- [Critical](#critical)
- [Important](#important)
  - [Vehicle data correctness](#vehicle-data-correctness-protocol-layer)
  - [Adapter and connection behaviour](#adapter-and-connection-behaviour)
  - [Data storage](#data-storage)
  - [Screens showing wrong information](#screens-showing-wrong-information)
  - [Performance](#performance)
  - [Build and packaging](#build-and-packaging)
  - [Security hardening](#security-hardening)
- [Minor](#minor-refinements)
- [Test gaps](#test-gaps-highest-value-first)
- [Suggested fix waves](#suggested-fix-waves)

## Headline

| | Critical | Important | Minor |
|---|---|---|---|
| **Merged totals** | **3** | **36** | **about 40** |

- **Does every part work? No.** The largest problems are in *reading vehicle data correctly*:
  - The fault-code parser invents codes that were never set.
  - VIN reading corrupts every J1850 VIN.
  - Four PID formulas are wrong.
  - The simulator hides 11 PIDs, so those gauges never update in simulator mode.
  - The Data Logger saves the same values in every sample.
  - I/M readiness shows "Ready" whatever the vehicle reports.
- **What can be optimized?**
  - The whole UI re-renders on every PID reading.
  - The shipped app uses a development build of React.
  - Storage rewrites one large JSON file synchronously on the main thread.
  - A 120 MB icon package is bundled into the app.
- **What can be refined?**
  - Remove 25 dead prototype files, the stale `files/README.md`, and the three disagreeing IPC type definitions.
  - Unify the thresholds that differ from screen to screen.
  - Add tests for everything that decodes bytes.

**Vehicle safety check:** the only command anywhere in the code that changes the vehicle is Mode 04 (Clear DTCs). The EcuBus "ECU reset" button and the UDS/Transmit tabs send nothing; they only change local state. However, the UDS tab lists reset, write and flash services and shows fake "OK" replies (I-30).

## Decision needed

**D-1: Clear DTCs sends OBD Mode 04.** This conflicts with the project rule "nothing writes to a control module". Choose one:

- **(a) Keep it, behind a confirmation dialog.**
  - The dialog says Mode 04 also erases freeze frames and readiness monitors.
  - A successful clear triggers a rescan.
  - Recommended. Mode 04 is the standard, safe OBD clear, and every scan tool offers it.
- **(b) Remove Clear entirely** and make the app strictly read-only.

Whichever you choose, fix I-12: today a clear is reported as successful on "NO DATA" too, and the list never refreshes.

---

## Critical

### C-1: The Data Logger saves the same values in every sample
- **Source:** C-01.
- **Where:** `screens/DataLoggerScreen.tsx:33,57-72`.
- **Problem:** the sampling interval reads the `liveData` captured when Record was clicked. It is a stale closure, so every sample is a copy of the first one, and the CSV and JSON exports look valid.
- **Fix:** read `useAppStore.getState().liveData` inside each tick.

### C-2: A corrupt `storage.json` resets to empty, and the next save wipes all saved data
- **Source:** A-01.
- **Where:** `main/storageService.ts:20-35`.
- **Problem:** the file is written with a non-atomic `writeFileSync`, and every parse error returns an empty store. A torn write (sleep, power loss, crash), followed by the next auto freeze-frame save, permanently erases all recordings, snapshots and freeze frames.
- **Fix:**
  - Write atomically: write a temp file, `fsync` it, then rename it over the original.
  - If a file can't be parsed, quarantine it and never write over it.

### C-3: Docker exposes the app over VNC with no password, on every network interface, with host `/dev` mounted
- **Source:** A-02.
- **Where:** `docker/entrypoint.sh:13,15`, `docker-compose.yml`.
- **Problem:** anyone on the network gets full control of the app. They can use the stored Claude API key, read saved sessions, and press Clear DTCs on a connected vehicle.
- **Fix:**
  - Bind to `127.0.0.1` and set a VNC password.
  - Pass only the adapter device, and run as a non-root user.

---

## Important

### Vehicle data correctness (protocol layer)

| ID | Problem | Where | Source |
|---|---|---|---|
| I-1 | **The DTC parser invents codes.** It reads the reply as one flat stream across frames and ECUs. For example, P0300 plus a second ECU with no codes parses as `P0300` + a phantom `C0300`, and 4 codes across 2 frames lose P0446 and add two phantoms. It was reproduced with ts-node. | `core/obdProtocolManager.ts:255-290` | B-01, D-01 |
| I-2 | **Every CAN DTC decodes wrongly.** The count byte is read as a code (`43 01 01 33` gives P0101 instead of P0133), and the ISO-TP `n:` line prefixes are mixed into the data. | same | B-02 |
| I-3 | **`readVIN` corrupts every J1850 VIN** (`1GCEK19T54E123456` comes back as `1IGCEKI19T5I4E12I`) and returns null on CAN. The corrupt VIN is saved to the profile and sent to NHTSA, so make/model auto-fill silently fails. | `core/elm327Commander.ts:197-216` | B-03 |
| I-4 | **A failed DTC scan shows as "no codes."** A timeout or key-off returns `[]`, which wipes the list on screen. A car with a stored P0300, scanned with the key off, shows as clean. | `obdProtocolManager.ts:230-241` | B-04 |
| I-5 | **PID 0143 absolute load is off by a factor of 257** (39.2% shows as 0.2%), and it is defined twice. | `core/pidCatalog.ts:6,146,385` | B-05 |
| I-6 | **Wrong PIDs and bytes:** 01A4 decodes the support byte instead of the gear (the root cause of the Transmission gear bug), 0121 is really "distance with MIL on", and 012A is an O2 sensor. Fuel system status therefore always shows "Closed loop". | `pidCatalog.ts:93,339,454` | B-06 |
| I-7 | **The simulator advertises only part of what it supports.** Its supported-PID mask hides 11 PIDs it answers (MAF, fuel level, oil temp, bank-2 trims, O2, gear), so those tiles stay at "—" in simulator mode forever. | `core/elm327Simulator.ts:62-64` | B-07 |
| I-8 | **PID discovery stops at 0x60,** so 01A4 is never polled on a real vehicle, and one failed range silently drops RPM, coolant and speed for the whole session. | `obdProtocolManager.ts:53-84,176` | B-08 |
| I-9 | **Mode 3C PCM values include the J1850 checksum byte,** which corrupts the numeric and text IDs. This is not yet confirmed on hardware. | `core/pcmDiagnostics.ts:80-96` | B-10 |
| I-10 | **Bank 1 and Bank 2 sides are backwards for the GM V8:** Bank 1 is the driver side. This sends the user to the wrong side of the engine. | `pidCatalog.ts:221-269,435` | B-12 |

### Adapter and connection behaviour

| ID | Problem | Where | Source |
|---|---|---|---|
| I-11 | **The PCM read leaves the adapter aimed at the PCM.** `ATSH 6C 10 F0` is never reset, so every later poll, scan and Clear goes physically addressed to the PCM. On CAN this breaks polling until reconnect. The read is also offered on non-J1850 vehicles. | `pcmDiagnostics.ts:128-141`, `PcmScreen.tsx:92-97` | B-09, D-08, B-18 |
| I-12 | **Nothing prevents two operations from using the adapter at once.** A PCM read, discovery, VIN read, DTC scan or poll can interleave with headers on. For example, polling restarts in the middle of a PCM read, or Clear goes out with the PCM header. | `main/main.ts:372-393,467-513` | A-03, B-18 |
| I-13 | **A late adapter reply is credited to the next command** after a timeout, so every later reply is out of step with its command. Partly unverified. | `elm327Commander.ts:243-247,320-326` | B-11 |
| I-14 | **Clear DTCs problems:** it reports success on "NO DATA" (the positive reply is `44`), the list and MIL banner never refresh afterwards, and failures are silent. | `obdProtocolManager.ts:298`, `main.ts:476-479`, `DTCScreen.tsx:242-247` | A-14, B-14, D-02 |
| I-15 | **"Reload renderer" after a crash shows Disconnected** while main is still connected, because main never re-sends the status. | `ErrorBoundary.tsx`, `main.ts` | C-16 |

### Data storage

| ID | Problem | Where | Source |
|---|---|---|---|
| I-16 | **Freeze frames are overwritten on every app launch** with the current, possibly engine-off or empty, live data. They are upserted by code, and the "known codes" set is empty at each start. They are also live snapshots, not real Mode 02 freeze frames. | `App.tsx:157-176`, `storageService.ts:202-217` | A-06, C-11, D-05 |
| I-17 | **Migrating local → SQLite brings deleted items back** (old rows are never cleared), and migration errors are swallowed. | `storageService.ts:108-134`, `SettingsScreen.tsx:44-54` | A-05, D-10 |
| I-18 | **Every storage call parses and rewrites the whole JSON file synchronously on the main thread,** and `getInfo` parses it 3 times. Large recordings freeze the gauges and can trip adapter timeouts. | `storageService.ts` | A-04 |
| I-19 | **Leaving the Data Logger while recording leaks both timers,** and the samples grow without limit and are never saved. | `DataLoggerScreen.tsx:46-77` | C-03 |

### Screens showing wrong information

| ID | Problem | Where | Source |
|---|---|---|---|
| I-20 | **I/M readiness is fabricated:** all 10 monitors show "Ready" whenever connected, because PID 0101 is never read. | `HealthScreen.tsx:260-281` | C-10 |
| I-21 | **Every engine shutdown raises a "Rapid voltage drop — parasitic draw" alert.** The trend has no time base (it looks at the last 10 value changes). The "min window" labels are wrong too. The Electrical chart labels render at about 20px because the SVG `viewBox` scales by about 1.9×. | `appStore.ts:424-434`, `ElectricalScreen.tsx:72-93`, `ParasiteScreen.tsx:99` | C-05, C-12, D-11 |
| I-22 | **The discharge-rate thresholds are 1000× too high** (V/min versus mV/min), so the drain warning never fires. | `ElectricalScreen.tsx:115-221` | C-06 |
| I-23 | **Three conditional-hook ternaries are left** (Live:289, Engine:288, Electrical:322). This is the same bug class as the crash fixed earlier, and they will crash once 012A is polled. | as listed | C-07 |
| I-24 | **Live LTFT Bank 1 is always shown as a warning,** because it has no neutral case. | `LiveScreen.tsx:139` | C-08 |
| I-25 | **The Engine MAP verdict compares psi against a kPa threshold,** so it always says "good vacuum". | `EngineScreen.tsx:79,185` | C-09 |
| I-26 | **Transmission data is wrong:** the RPM-at-60 table is wrong, the TCC slip estimate assumes 4th gear, and 4L60-E content shows for every vehicle. | `TransmissionScreen.tsx:66-201` | C-14 |
| I-27 | **HVAC treats readings at or below 0 °F as "no reading".** Winter ambient temperatures disappear. | `HVACScreen.tsx:37-141` | C-15 |
| I-28 | **The Session log "Tail" button scrolls to the *oldest* entry,** and the session duration shows as negative. | `LogsScreen.tsx:59-63,189` | D-06 |
| I-29 | **The TXT log export leaves out the user's markers,** because it exports main's log rather than the renderer's. | `LogsScreen.tsx:73-79` | D-07 |
| I-30 | **The same code reported in two modes duplicates React keys,** so its rows expand together. The freeze-frame button never enables for codes found during the current visit. | `DTCScreen.tsx:212,218,372` | D-03, D-04 |
| I-31 | **The EcuBus UDS tab offers reset, write and flash services and fakes positive replies.** For example, `11 01 → 51 01 OK` tells the user the ECU was hard-reset. It sends nothing today. | `EcuBusScreen.tsx:23-48,331-352` | D-09 |

### Performance

| ID | Problem | Where | Source |
|---|---|---|---|
| I-32 | **`App` subscribes to the whole store,** so every PID reading, even an unchanged value, re-renders the shell and the active screen. `updatePIDReading` mutates state in place and still notifies, and that mutation also corrupts history timestamps. The Data Logger calls `JSON.stringify` on every recording on every render. | `App.tsx:109-117`, `appStore.ts:266-289`, `DataLoggerScreen.tsx:224` | C-02, C-04, C-13 |

### Build and packaging

| ID | Problem | Where | Source |
|---|---|---|---|
| I-33 | **`npm run build`, `npm run dist` and Docker ship a development-mode bundle:** 2.2 MB, the React dev build, and source maps. | `package.json:10-11`, `webpack.renderer.js:5`, `Dockerfile:26-30` | A-07 |
| I-34 | **Renderer-only packages are in `dependencies`,** including the 120 MB icon font that pulls in the native `ttf2woff2`. `npm run dist` likely fails or bloats as a result. There is also no Electron rebuild for `better-sqlite3` in development. | `package.json:53-63` | A-08, A-21, D-24 |
| I-35 | **electron-builder's output folder is the app's own `dist/`,** so it can pack its own previous output. Unverified. | `package.json` build config | A-09 |

### Security hardening

| ID | Problem | Where | Source |
|---|---|---|---|
| I-36 | **The main window is not sandboxed (`sandbox: false`, which it doesn't need).** It has no navigation or window-open guard, and IPC handlers don't check who sent a request. Dropping a file or URL onto the window would give a foreign page the full `electronAPI`. | `main.ts:40-45`, all `ipcMain.handle` | A-10 |

---

## Minor (refinements)

**Main, build and security**
- The CSP still allows `'unsafe-eval'`, and there is a dead `localhost:3000` dev branch (A-11).
- A decrypt failure silently erases the Claude API key on the next settings save. The Linux `basic_text` fallback is weak (A-12).
- CarsXE works only when the app is launched from a terminal. External fetches have no timeout or `res.ok` check. The VIN is not validated (A-13).
- RSSI polling spawns overlapping `system_profiler` runs every 3 s, including for USB adapters (A-15).
- `report:generate` leaks its hidden window on error and overwrites reports made on the same day (A-16).
- Export handlers throw on write errors, and the callers never catch them (A-17).
- The IPC contract is typed in three places that disagree. `removeAllListeners` can drop other subscribers' listeners (A-18, C-29).
- Dead handlers and code: `storage:set-config`, `debugSerial`, the DTCs sent twice, unused imports (A-19).
- Dev and packaged builds use different `userData` folders, so the API key and data don't carry over (A-20).
- The CommonJS renderer defeats tree-shaking. The webpack target is wrong. All three font formats are shipped (A-21).
- `build/icon.icns` is gitignored, so a clean clone has no app icon (A-22).

**Protocol**
- `parsePIDResponse` rejects `SEARCHING...` and matches headers at odd offsets (B-13).
- The poll comments disagree with the code, and the 300 ms sleeps do nothing (B-15).
- Dead events and helpers. `STPC`/`STSLLT` are probably wrong (B-16).
- Connect resets the adapter twice, and shows "?" as the adapter name on non-OBDLink adapters (B-17).
- The simulator's random walks are unbounded, so RPM and trims drift into warning over time (B-19).
- Wrong min/max values on 0133, 0123, 010B and 01A4 (B-20).
- The GMT800 module addresses look swapped against the published Class II list. Unverified (B-21).
- `gen-dtc-catalog.ts` would overwrite the hand-curated catalog (B-22).

**Renderer and screens**
- Assistant, Data Logger and AllPIDs subscribe to data they don't render (C-17).
- `useStaleness` runs a 500 ms interval per metric forever (C-18).
- Thresholds disagree across screens and with the catalog (coolant, oil, battery SoC, HVAC) (C-19).
- MAF shows "g/s g/s". Gauges show 0 for a missing reading (C-20).
- The Health report sends the 100 *oldest* warnings. The MIL logic is inconsistent (C-21).
- The session timer resets a few seconds after connecting, because main sends `connected` twice (C-22).
- Live data, history and DTCs survive a reconnect to another vehicle (C-23).
- Assistant Regenerate sends the question twice. Leaving the screen mid-reply loses its state (C-24).
- The Data Logger interval control stays live while recording. Errors are unhandled (C-25).
- ConnectionScreen: a dead `lastPort` write, a stale draft overwriting the detected VIN, an unhandled rejection (C-26).
- The HVAC "fault codes" filter pulls in every B-code and every O2-heater code (C-27).
- Hard-coded Silverado verdicts are shown as if measured (C-28).
- ErrorBoundary uses the retired styling and CSS variables that no longer exist (C-30).
- Accessibility gaps (C-31):
  - form labels;
  - `aria-pressed`, `aria-selected` and `aria-expanded`;
  - the menu and dialog focus;
  - the Gauge `role="meter"`;
  - `aria-hidden` on icons.
- EcuBus is a 1,078-line demo with 10+ buttons that do nothing and an "EcuBus-Pro" attribution it doesn't use (D-12).
- The UDS and Transmit builders drop sub-function `0x00` and accept non-hex input (D-13).
- Modules: the "Asleep" badge shows for unknown modules, and Scan resets statuses (D-14).
- Parasitic draw on generic vehicles shows empty GM fuse cards. The ECM is labelled sleeping while it answers (D-15).
- Whole-map selectors on Compare, FreezeFrame and Parasite. A new `[]` on every render (D-16).
- DTC screen (D-17):
  - the GM banner is hidden when only B/U codes exist;
  - CarsXE is re-fetched on each remount;
  - causes are split on commas;
  - Scan can be double-clicked;
  - "First seen" is reset on every scan.
- Compare: stale "Live" data after disconnect, no selection after a delete, a fabricated 12.6 V (D-18).
- Freeze frames: no selection after a delete, and values have no units (D-19).
- Session log (D-20):
  - index keys;
  - unescaped CSV fields and formula injection;
  - the warnings strip is hidden when there are no errors.
- Settings: the Electron and Node version rows never render, and the version is hard-coded (D-21).

**Repo hygiene**
- **25 dead prototype files** in the `files/` root. Nothing imports them, and they can't compile. No logic exists only there, because `vehicleProfile.ts` is identical to `platforms/gmt800.ts`. Delete them (D-22).
- **`files/README.md` is stale throughout.** It mentions Electron 31, the McLaren theme, auto-simulator, old paths and a roadmap. Replace it with a short developer README or delete it (D-23).

---

## Test gaps (highest value first)

1. **DTC parser:** table tests with real J1850 and CAN captures, covering multi-frame, multi-ECU, count byte, `n:` prefixes and de-duplication (I-1, I-2).
2. **Read-only safety test:** run connect, a poll, a scan, a VIN read and a PCM read against the simulator. Assert that every command sent is `AT`/`ST`/`01`/`02`/`03`/`07`/`09`/`0A`/`3C`, and that `04` comes only from Clear.
3. **PID decoders:** one test per formula against the SAE J1979 examples, plus `parsePIDResponse` edge cases.
4. **VIN parsing:** J1850 five-frame and CAN ISO-TP.
5. **PCM:** `parseBlockResponse` and `formatBlock` with headers and checksum, and a test that restore resets the header.
6. **StorageService:** round-trip, corrupt file, migration without resurrection, freeze-frame insert-if-absent.
7. **Store and verdict helpers:** move the screen thresholds into pure functions (`batterySoC`, `voltageTrend`, `dischargeStatus`, `trimStatus`, `mapVerdict`) and table-test them.
8. **Main session state machine:** extract it from `main.ts` and test the connect and disconnect races.

---

## Suggested fix waves

**Wave 1: correctness of vehicle data.** The app's core promise.
- I-1 to I-10.
- The protocol half of I-14.
- Test gaps 1 to 5.

**Wave 2: data safety and adapter integrity.**
- C-2, I-16, I-17, I-18 and I-19.
- I-11, I-12 and I-13.
- Test gap 6.

**Wave 3: screens telling the truth.**
- C-1.
- I-20 to I-31.
- The UI half of I-14, and I-15.
- Test gap 7.

**Wave 4: performance, build and security.**
- I-32 to I-36.
- C-3.

**Wave 5: refinements and cleanup.** All Minor items:
- delete the dead files;
- rewrite `files/README.md`;
- the accessibility pass.
