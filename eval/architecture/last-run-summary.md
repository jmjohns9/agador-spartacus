# Architecture review — 2026-08-09

Scope: `files/src` (38 `.ts`/`.tsx` files, excluding tests and build output) at `83283ee`.

| Severity | Count |
|----------|-------|
| critical | 0 |
| high     | 3 |
| medium   | 3 |
| low      | 0 |
| **total**| **6** |

## New since previous run (first run)

- **ARC-001** (high, `god_module`) — `files/src/main/main.ts`: one 583-line file owns window lifecycle, serial transport, simulator wiring, OBD session state, ~30 IPC handlers, two HTTP clients, Bluetooth RSSI scraping, and PDF rendering.
- **ARC-002** (high, `missing_abstraction`) — `files/src/main/storageService.ts`: local-JSON and SQLite backends branched inline in all ten data methods with no `StorageBackend` interface; the two arms have already drifted in `saveFreezeFrame`.
- **ARC-003** (high, `circular_responsibility`) — `files/src/core/elm327Commander.ts`: a class named for the generic ELM327 command set hard-codes OBDLink/STN `ST*` commands and one vehicle's J1850 assumptions, and emits end-user UI copy.
- **ARC-004** (medium, `leaky_boundary`) — `files/src/main/main.ts`: no validation on either side of the IPC boundary; NHTSA and CarsXE responses are consumed as `any` and reach persisted renderer state, and `report:generate` interpolates a renderer-supplied `unknown` payload into `executeJavaScript`.
- **ARC-005** (medium, `tangled_state_ownership`) — `files/src/renderer/screens/EcuBusScreen.tsx`: the store's `ecubus` slice and local component `useState` both model the same state, and the CAN read path picks between them at render time.
- **ARC-006** (medium, `wrong_layer_for_concern`) — `files/src/core/obdProtocolManager.ts`: GM-specific DTC-to-module names hard-coded in the protocol layer, duplicating the map `core/platforms` already owns.

## All findings this month

### High

**ARC-001 — `god_module` — `files/src/main/main.ts`**
Window lifecycle (`createWindow`, `app.whenReady`), serial transport and port lifecycle, simulator transport wiring, OBD session orchestration, ~30 `ipcMain.handle` registrations, direct `GMT800` platform lookup, NHTSA vPIC and CarsXE clients, `system_profiler` RSSI polling, and hidden-BrowserWindow PDF rendering all live in one file sharing only `sendToRenderer`/`addLog`.
→ Split into `windowManager`, a `Transport` interface with `SerialTransport`/`SimulatorTransport`, `obdSession`, `reportService`, `vinDecoder`/`carsxeClient`, `btRssi`, and an `ipc/register.ts`.

**ARC-002 — `missing_abstraction` — `files/src/main/storageService.ts:76`**
`if (this.backend === 'sqlite')` repeats across `saveSnapshot`, `getSnapshots`, `deleteSnapshot`, `saveRecording`, `getRecordings`, `deleteRecording`, `saveFreezeFrame`, `getFreezeFrames`, `deleteFreezeFrame`, and `migrate`. The SQLite arm of `saveFreezeFrame` reuses an existing row id while the local arm returns the incoming `ff.id`, so the same call already returns different ids per backend.
→ Extract a `StorageBackend` interface with `LocalJsonBackend` and `SqliteBackend`; inject it so tests can substitute an in-memory backend.

**ARC-003 — `circular_responsibility` — `files/src/core/elm327Commander.ts:82`**
`initialize()` issues `STI`/`STDI` (OBDLink/STN extensions) as fixed steps 10–11; a genuine ELM327 answers `?` and is then reported as firmware `Unknown` straight into the connection banner. `setSleepTimer` (`STSLLT`) and `setPowerControl` (`STPC`) sit unqualified on the generic class, the method is documented as a "2004 Silverado J1850 VPW" sequence, and the abort path carries a paragraph of macOS Bluetooth UI copy.
→ Reduce to the SAE/ELM327 baseline; move vendor commands behind an `AdapterCapabilities` implementation selected from the adapter banner; replace the prose throw with a typed error.

### Medium

**ARC-004 — `leaky_boundary` — `files/src/main/main.ts:377`**
NHTSA (`json: any`) and CarsXE (`d: any`) responses are copied out untyped and forwarded over IPC; the decoded VIN reaches `setVehicle` and localStorage unparsed. No `ipcMain.handle` validates its argument: `report:generate` takes `payload: unknown` and interpolates it into `executeJavaScript`, and `storage:set-config`/`storage:migrate` pass renderer values into `StorageService` unchecked. Inbound, `App.tsx` casts with `s.status as any`.
→ Add per-channel and per-response schemas in `shared/schemas.ts`, wrap handlers in a validating `handle(channel, schema, fn)`, and pass the report payload as structured data rather than source text.

**ARC-005 — `tangled_state_ownership` — `files/src/renderer/screens/EcuBusScreen.tsx:167`**
The store's `ecubus` slice declares `canFrames`/`canPaused`/`canFilter`/`udsRequests`/`udsResponses`/`udsTxId`/`udsRxId` with mutators that have no call sites outside the store, while the screen re-declares the same state locally. Line 176 resolves the ambiguity at render time with `ecubus.canFrames.length > 0 ? ecubus.canFrames : frames`.
→ Make the store authoritative, delete the duplicated `useState`, and route demo data in through a `seedEcuBusDemoData()` action.

**ARC-006 — `wrong_layer_for_concern` — `files/src/core/obdProtocolManager.ts:325`**
`getDTCModule` maps DTC prefixes to `'BCM/IPC'`, `'ABS/EBCM'`, `'PCM'` inside the J1979 protocol manager, while `PlatformProfile.modules` (populated by `gmt800.ts`, deliberately empty in `generic.ts`) already owns that knowledge. `main.ts` compounds it by importing `GMT800` directly for `obd:check-modules`.
→ Inject a `moduleResolver` derived from the resolved `PlatformProfile`, add `dtcPrefixToModule` to the profile, and route `obd:check-modules` through `resolvePlatform`.
