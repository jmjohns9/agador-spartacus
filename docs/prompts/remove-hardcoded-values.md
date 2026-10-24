# Prompt: remove hardcoded values from Tattlestone

Paste everything below the line into Claude Code, run from `agador-spartacus/`.

---

## Role and goal

You are hardening **Tattlestone** (Electron + React + TypeScript app in `files/`, plus the Arduino UNO Q bridge in `files/firmware/uno-q-bridge/`) for production. Your job: **move every hardcoded value that a user, installer, or vehicle could reasonably need to change into one typed, validated configuration system**, and move every vehicle-specific fact into the platform registry (`files/src/core/platforms/`). Behaviour with default config must be identical to today.

## Rules

1. **Not every literal is config.** Classify each value before you move it:
   - **User/installer setting:** timeouts, poll rates, ports, hosts, baud rates, paths, thresholds, UI defaults. Move it to config and expose it in Settings where it makes sense.
   - **Vehicle/platform fact:** tank size, axle ratio, tyre size, transmission ratios, engine idle airflow, fuel rail spec, expected protocol, module maps. Move it into `PlatformProfile` (`gmt800.ts` / `generic.ts`). Generic screens must render a neutral fallback when the profile has no value.
   - **Protocol/standard constant:** SAE J1979 decode formulas, NRC names, J1850 CRC polynomial, GM Mode 3C header bytes, ISO-TP framing. Keep these as **named constants in code**. Do not make them editable.
   - **Safety guard:** `WRITE_SERVICES` / `isVehicleWrite`, the bridge's `is_blocked`. Keep these in code, never in user config, and never weaken them. A config file must not be able to turn the read-only guard off.
2. One source of truth. Create `files/src/shared/config/`:
   - `schema.ts`: a typed `AppConfig` with defaults, min/max bounds and a one-line description per key.
   - `load.ts`: merge order is **defaults → `userData/settings.json` → `TATTLESTONE_*` environment variables**. Out-of-range or wrong-typed values fall back to the default and log a warning. Unknown keys are ignored. The loader never throws.
   - Main loads config once and sends the renderer a read-only copy over IPC (`config:get`). Changes go through `config:set`, which validates them. The renderer never writes the file directly.
3. Inject config, don't import it globally into `core/`. `ELM327Commander`, `OBDProtocolManager`, `TcpPort` and `PcmDiagnostics` already accept option objects for tests. Extend those option objects so `core/` stays free of Electron and file I/O.
4. Bridge and emulator (Python, stdlib only): every tunable becomes an argparse flag **and** an environment variable (`TATTLESTONE_BRIDGE_*`). The systemd units read `EnvironmentFile=-/etc/default/tattlestone-bridge` instead of hardcoding arguments, user and paths. Add a `--host` flag (today `serve()` always binds `0.0.0.0`).
5. Secrets never go in `settings.json`. The CarsXE key moves next to the Claude key: stored with `safeStorage`, entered in Settings, with `CARSXE_API_KEY` as an optional override. A packaged app launched from Finder does not inherit shell environment variables, so the env-only key does not work today.
6. Demo data must not ship as live data. The EcuBus-Pro screen's generated CAN/LIN/DoIP data (IPs `192.168.1.x`, MAC-style EIDs, a sample VIN) goes behind a `features.ecubusDemo` flag that defaults to **off** in packaged builds, and the screen says "Demo" in its header while the flag is on.
7. Keep the tests green: `npm test`, `npm run typecheck`, and `python3 -m unittest test_obd_tcp_bridge` in the firmware folder. Add tests for the config loader (defaults, env override, out-of-range fallback, unknown key, unreadable file) and for each platform-profile fallback.
8. Work in small commits on a branch, one area per commit. Update `docs/ARCHITECTURE.md`, `docs/HARDWARE.md` and `docs/DEVELOPING.md` to describe the config file and the bridge's environment file.

## Inventory to start from

Verify each item before you change it; line numbers drift. Search for anything this list missed with `rg -n "[0-9]{3,}|https?://|192\.168|Silverado|GMT800|5\.3|4L60|Vortec" files/src files/firmware`.

### Connection and transport (`files/src/main/`)
| Where | Value | Becomes |
|---|---|---|
| `main.ts` `connectToPort` | `baudRate: 115200` | `serial.baudRate`. Many USB ELM327 clones run at 38400. Add an "auto" option that tries 115200, then 38400, then 9600 with a short ATI probe |
| `main.ts` | `BT_LINK_SETTLE_MS = 3000` | `serial.bluetoothSettleMs` |
| `main.ts` `isBluetooth` | the regex `/usbserial\|usbmodem\|ttyUSB\|ttyACM/` | `serial.usbPathPattern`, with `SLAB_USBtoUART` and `wchusbserial` added to the default |
| `main.ts` `obd:list-ports` | the adapter-name and port-filter regexes | `serial.adapterNamePattern`, `serial.hiddenPortPattern` |
| `main.ts` RSSI | 1000 / 5000 ms intervals, a 5000 ms `system_profiler` timeout, the name regex | `bluetooth.rssiPollMs`, `bluetooth.rssiTimeoutMs`, `bluetooth.adapterNamePattern`, plus `bluetooth.rssiEnabled` |
| `main.ts` | `SESSION_LOG_MAX = 5000` | `logging.sessionLogMax` |
| `main.ts` | `NHTSA_WAIT_MS = 5000` | `nhtsa.assistantWaitMs` |
| `main.ts` `report:generate` | `~/Documents/Tattlestone`, 900×1200 window, a fixed 300 ms render wait, `Letter` | `reports.outputDir`, `reports.pageSize`. Replace the fixed wait with a `render-done` signal from `report.html` |
| `main.ts` `carsxe:decode` | API URL, 10 s timeout, env-only key | `carsxe.baseUrl`, `carsxe.timeoutMs`, key in safeStorage |
| `main.ts` `createWindow` | 1400×900, min 1100×700 | `window.*`; also remember the last size and position |
| `main.ts` | `userData` pinned to `silverado-dx` | keep the folder (existing installs use it) but name it once in `config/constants.ts` |
| `main.ts` simulator | `'SAE J1850 VPW (Simulator)'` label, `GMT800.modules` | derive both from the simulator's own platform profile |
| `tcpPort.ts` | `DEFAULT_TCP_PORT 35000`, `CONNECT_TIMEOUT_MS 5000`, `BRIDGE_GREETING_MS 1500`, `BRIDGE_LINK_TIMEOUT_MS 30000`, keepalive 5000, `CAPTURE_BYTES 256` | `network.defaultPort`, `network.connectTimeoutMs`, `network.bridgeGreetingMs`, `network.bridgeLinkTimeoutMs`, `network.keepAliveMs`. Keep `CAPTURE_BYTES` as a constant. The `tattlestone-bridge` service name in error text comes from `network.bridgeServiceName` |
| `autoConnect.ts` | `AUTO_CONNECT_DELAYS_MS [3000, 10000]` | `network.autoConnectDelaysMs`, plus `network.autoConnectEnabled` |
| `renderer/screens/ConnectionScreen.tsx` | default bridge `192.168.1.33:35000` | empty by default; prefill from the remembered bridge (`connection.json`) or `network.defaultBridge` |

### ELM327 and polling (`files/src/core/`)
| Where | Value | Becomes |
|---|---|---|
| `elm327Commander.ts` | `ELM_TIMEOUT 2500`, `STALE_REPLY_WAIT_MS 1500`, `RESYNC_WAIT_MS 500`, `LINK_LOST_TIMEOUTS 4`, `PROTOCOL_SEARCH_TIMEOUT 10000`, the per-command timeouts (2200, 3000, 2000, 1000, 5000) | `elm.*` options. Name each per-command timeout (`probeMs`, `resetMs`, `infoMs`, `vinMs`) |
| `elm327Commander.ts` `initialize` | `ATSP0` and `ATAT1` | `elm.protocol` (`auto` or 1–C) and `elm.adaptiveTiming` (0–2). Keep `ATE0 ATL0 ATH0 ATS0` fixed: the parsers depend on them |
| `elm327Commander.ts` | `MAX_RECV_BUF 64 KB` | keep as a constant (it is a safety bound) |
| `obdProtocolManager.ts` | `EXTENDED_BATCH 6`, tier ratios 3 and 10, PID timeout 800, DTC 5000, discovery 3000, Mode 09 3000/8000 | `polling.extendedBatch`, `polling.normalEvery`, `polling.slowEvery`, `polling.pidTimeoutMs`, `dtc.timeoutMs`, `discovery.timeoutMs`, `mode09.*` |
| `obdProtocolManager.ts` `getDTCModule` | `B → BCM/IPC`, `C → ABS/EBCM` | `PlatformProfile.dtcModuleFallback`; the generic profile says "Body", "Chassis", "Network", "Powertrain" |
| `pidCatalog.ts` | `POLLING_FAST/NORMAL/SLOW` lists | defaults for `polling.tiers`; let Settings move a PID between tiers or switch it off |
| `pidCatalog.ts` descriptions | "5.3 L Vortec redlines at 6,000 rpm", "Spec: 55–60 psi" | generic text in the catalog; the platform profile adds the GMT800 note |

### Analysis thresholds (`files/src/renderer/`)
| Where | Value | Becomes |
|---|---|---|
| `logic/verdicts.ts` | `CHARGING_V 13.2`, settle 10 min, window 30 min, min span 10 min, draw thresholds 1 and 5 mV/min, the SoC table, trim ±5/±10 %, MAP 10 psi | `analysis.*`. The SoC table belongs to the battery type (flooded, AGM), so add `vehicle.batteryType` |
| `store/appStore.ts` | `historyMaxPoints 500`, log cap 1000, BT `txPower -59` and `n 2.5`, UDS IDs `0x7E0/0x7E8` | `ui.historyMaxPoints`, `ui.logMax`, `bluetooth.txPowerDbm`, `bluetooth.pathLossExponent`, `ecubus.defaultTxId/RxId` |
| `store/appStore.ts` `selectParasiteRiskScore` | weights 3 / 4 / 1.5 / 1, 5 mV/min, LTFT > 7 % | `analysis.parasiteWeights`. Also flag for review: long-term fuel trim is not evidence of a parasitic draw |

### Vehicle facts that belong in `PlatformProfile`
| Where | Value |
|---|---|
| `LiveScreen.tsx` | 26 gal tank, "Idle 5.3 L: 4–6" g/s |
| `TransmissionScreen.tsx` | 4L60-E ratios, 3.73 axle, 31.6″ tyres, the TCC slip rule. The axle ratio and tyre size become per-vehicle fields in the vehicle profile, because they vary within one platform |
| `HealthScreen.tsx` | "Expected: SAE J1850 VPW" |
| `ConnectionScreen.tsx` | placeholders `2004` / `Chevrolet` / `Silverado 1500` / `1GCEK19T04E…`: use neutral placeholders |
| `ParasiteScreen.tsx`, `HVACScreen.tsx`, `ModulesScreen.tsx`, `DTCScreen.tsx` | inline GMT800 tables and text: move them into `gmt800.ts`, and render from the profile |
| `pcmDiagnostics.ts` | `6C 10 F0`, tool `F0`, block list: keep as constants, but key them by platform so a future P59/E38 profile can supply its own |

### Claude assistant (`files/src/main/claudeAssistant.ts`)
- `CLAUDE_MODELS`, `DEFAULT_MODEL`, `FALLBACK_MODEL`, the beta flag string, `max_tokens 16000`, `history.slice(-12)`. Fetch the model list from the Models API at startup, cache it, and fall back to the built-in list offline. `assistant.maxTokens` and `assistant.historyTurns` go in config. The beta flag and the fallback model live in one constant block, with a comment saying where they come from.

### External endpoints
- `nhtsa.ts` `https://api.nhtsa.gov`, `https://static.nhtsa.gov/` allowlist, 30-minute cache; `vinDecoder.ts` vPIC URL. Base URLs go in `config/constants.ts`, not user config (the allowlist is a security check). The cache TTL goes in config.

### Bridge and emulator (`files/firmware/uno-q-bridge/`)
| Where | Value | Becomes |
|---|---|---|
| `obd_tcp_bridge.py` | `LINK_DEADLINE_S 20`, `BT_CONNECT_TIMEOUT_S 6`, `BACKOFF_S (1,2,4)`, `OBD_NAME` regex, recv size 512, client timeout 5, keepalive 10/5/3, `0.0.0.0`, port 35000 | flags + `TATTLESTONE_BRIDGE_*` env vars: `--host`, `--port`, `--link-deadline`, `--bt-timeout`, `--backoff`, `--adapter-name`, `--keepalive` |
| `obd_tcp_bridge.py` | line cap `64` | keep it as a constant, but **fix the behaviour**: an over-long line must be rejected with `?\r\r>`, never truncated and forwarded |
| `obd_tcp_bridge.py` | `BAUDS` has only 9600/38400/115200 | add 57600, 230400 and 500000 (STN chips) |
| `obd_tcp_bridge.py` `PAIRING_HELP` | `PIN 1234` | "the adapter's PIN (often 1234 or 0000)" |
| `tattlestone-bridge.service` | `User=arduino`, `/home/arduino/uno-q-bridge/...`, inline arguments | `EnvironmentFile=-/etc/default/tattlestone-bridge`, install path `/opt/tattlestone/`, and an `ExecStart` that expands `$TATTLESTONE_BRIDGE_ARGS` |
| `tattlestone-emulator.service` | `--host 0.0.0.0` | default to `127.0.0.1`, as the emulator's own docstring says |
| `elm327_emulator.py` | `VIN`, `CALID`, `CVN`, idle values | `--profile` JSON file; the built-in default stays the Silverado |

### Build and packaging (`files/package.json`)
- `name: silverado-dx`, `appId: com.silveradodx.obd2`, `version 1.0.0`, ad-hoc `codesign --sign -` in `install:app`. Name the signing identity and team ID in environment variables for CI (`CSC_NAME`, `APPLE_TEAM_ID`). Do **not** change `appId` or the userData folder without a migration, because that orphans existing installs' keychain item and data.

## Definition of done

- `rg` finds no unexplained numeric literal ≥ 100, no hardcoded host/IP, and no vehicle name outside `platforms/`, the simulator/emulator, tests and docs.
- Every config key has a default, bounds, a description, and a test.
- The app, the simulator and the bridge behave exactly as before with no config file present.
- Settings shows the user-facing keys in groups (Connection, Polling, Analysis, Assistant, Reports), with "Reset to defaults".
- A short `docs/CONFIGURATION.md` lists every key, its default and its range.
- Tests and typecheck pass; report the counts.
