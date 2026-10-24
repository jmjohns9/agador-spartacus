# Production readiness review — 2026-10-23

Scope: the whole app in `files/src` (main, core, renderer), the Arduino UNO Q bridge and emulator in `files/firmware/uno-q-bridge/`, and the systemd units. The connection path (Mac ↔ TCP ↔ UNO Q ↔ Bluetooth/USB ↔ OBDLink ↔ vehicle bus) was read line by line. Reviewed at `fb9767b` on `main`.

**Baseline:** `npm test` gives 217 tests, 214 pass, 3 skipped, 0 failing. `npm run typecheck` is clean. The bridge's `python3 -m unittest` runs 18 tests, all OK.

**Verdict:** the protocol and session code is careful and well tested: session generations, the serialized send chain, stale-reply resync, exclusive bus ownership, and the read-only design. It is **not production-ready** yet, for four reasons:

1. The bridge is an unauthenticated open port on the LAN that any client can take over (S1).
2. Both read-only guards can be bypassed (S2, S3, S4).
3. Settings that a real install needs to change are hardcoded (see [`docs/prompts/remove-hardcoded-values.md`](../prompts/remove-hardcoded-values.md)).
4. A demo-only screen ships in the main navigation, and there is no release signing or notarization.

Severity: **High** means fix before shipping. **Medium** means fix before broad use. **Low** means cleanup.

---

## 1. Security and safety findings

### S1 — High: the bridge accepts anyone on the network, and the newest client wins
`firmware/uno-q-bridge/obd_tcp_bridge.py:291`, `:298-310`

`serve()` binds `0.0.0.0:35000` with no authentication. On every `accept()` it hangs up the current client and gives the adapter to the new one. Port 35000 is the standard Wi-Fi ELM327 port, so phone OBD apps (Car Scanner, Torque, OBD Fusion) probe it automatically on any Wi-Fi network they join. One phone on the home Wi-Fi can:
- drop the Mac's live session in the middle of a DTC scan or PCM read, and
- get raw access to the vehicle bus, with only an exact `04` blocked (see S2).

There is also no `--host` flag, so the bridge can't be limited to one interface.

**Fix:**
- Add `--host` and default it to the Wi-Fi interface address.
- Add a pre-shared token handshake: the app sends `TATTLE AUTH <token>` before `BRIDGE READY`. The token is created on the board at install time and pasted into the app once.
- Change the takeover policy to "an authenticated client may replace another authenticated client". Unauthenticated clients are refused.
- Longer term: TLS (stdlib `ssl`) with a pinned self-signed certificate.

### S2 — High: the bridge's write guard blocks only the literal `04`
`obd_tcp_bridge.py:202-203`. Verified by running `is_blocked` directly:

| Line sent | Result |
|---|---|
| `04`, `0 4` | blocked |
| `04\t`, `0400` | **forwarded** (Mode 04 with a trailing byte; some ECUs accept it) |
| `14FF00`, `14FFFFFF` | **forwarded** (UDS / GMLAN ClearDiagnosticInformation) |
| `3B…`, `2E…`, `27…`, `34…`, `36…`, `10 02` | **forwarded** (write, security access, download, programming session) |
| `STPX H:7E0,D:04` | **forwarded** (OBDLink passthrough sends an arbitrary frame) |

The module docstring says the guard keeps "the app's read-only promise … for any client". It doesn't. **Fix:** use an allowlist, not a blocklist:
- Forward `AT*` commands, plus `ST*` commands minus the transmit family (`STPX`, `STPTX`, `STPTRQ`, and the `STP` protocol-send commands).
- Forward OBD/UDS requests whose first byte is a read service: `01 02 03 05 06 07 09 0A 19 1A 21 22 23 3C 3E` (GM `AA` only after review).
- Refuse `ATCAF0`, because with CAN auto-formatting off the first byte is the PCI length, not the service, and the service check stops working.
- Share one allowlist file between the app and the bridge, and add a test that keeps the two in step.

### S3 — Medium-High: the bridge truncates long lines and forwards what's left
`obd_tcp_bridge.py:348`: `elif ch != b"\n" and len(line) < 64: line += ch`

Bytes past 64 are silently dropped, and the shortened prefix is sent to the adapter on `\r`. A cut-off command can be a *different, valid* command. Verified: a 77-character line goes out as 64 bytes. **Fix:** once the line passes 64 bytes, mark it overflowed, then answer `?\r\r>` and discard the line at `\r`.

### S4 — Medium: the app's `isVehicleWrite` guard can be bypassed
`files/src/core/elm327Commander.ts:40-48`. Verified with `node`:
- **Embedded CR.** `"010C\r04"` is *allowed*: `\s+` strips the CR before the check, but `dispatch()` sends the original string, so the adapter runs `010C` and then `04`. **Fix:** refuse any command containing `\r` or `\n`.
- **ST passthrough.** `STPX H:7E0,D:14FFFFFF` is allowed, because only all-hex strings are checked.
- **Missing services:** `10` (session control, including programming session `10 02`), `27` (security access), `3D` (write memory), `A5`/`AE`/`A2` (GM programming and device control), `30`/`3A` (KWP I/O control).
- **Raw CAN framing.** `ATCAF0` + `021101` passes the check, because the service byte is no longer first.

Today no renderer path can send a free-form command (every `send()` call site passes a literal), so this is defense in depth. It becomes exploitable the day the EcuBus UDS client or a raw terminal is wired to the adapter. **Fix:** the same shared allowlist as S2. Clearing codes, if it is ever added, goes through one dedicated method (section 4), never through `send()`.

### S5 — Medium: no hardening in the systemd units
`tattlestone-bridge.service`, `tattlestone-emulator.service`. **Fix:** add `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=read-only`, `PrivateTmp=yes`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_BLUETOOTH AF_UNIX`, and `CapabilityBoundingSet=`. The emulator unit binds `0.0.0.0`, although the emulator's own docstring defaults to `127.0.0.1` for safety. Make them agree.

### S6 — Low: IPC handlers trust the payload shape
`main.ts:856-866`: `filename.toLowerCase()` throws when `filename` isn't a string. `storage:save-*` store whatever object arrives. `report:generate` injects an unvalidated payload. `report.html` escapes its HTML, which mitigates that, and the sender check (`isAppSender`) is solid, so the risk is low. Still, add a small runtime validator per channel, because a compromised renderer is the threat model this check exists for.

### S7 — Low: release integrity
`package.json` `install:app` signs ad hoc (`codesign --sign -`). There is no Developer ID signing, no notarization and no update channel, so Gatekeeper will block downloaded builds. The CarsXE key travels in a URL query string (the vendor requires it). Keep it out of the logs; it is today.

---

## 2. Arduino ↔ Tattlestone ↔ OBD connection: deep review

### What is solid (keep it)
- **Session generations** (`main.ts:116-122`, `endSession`). Every async chain checks `gen === sessionGen`. Rapid connect, disconnect and cancel can't cross-wire sessions.
- **One command at a time** (`elm327Commander.ts:258-266`). The send chain plus `exclusive()` (`obdProtocolManager.ts:49-67`) guarantee no two commands overlap on the wire, including DTC scans and the PCM read during polling.
- **Late-reply resync** (`awaitStaleReply`). A timed-out reply is waited for and dropped. If it never comes, a bare CR interrupts the adapter. This is the most common source of ELM327 reply misattribution, and it is handled correctly.
- **Bridge handshake** (`tcpPort.ts:119-217`). `BRIDGE STATUS / READY / ERROR` lines, a greeting timeout that falls back to "plain Wi-Fi ELM327", and error text that names the failed hop (refused, unreachable, DNS). Good UX.
- **Dead-link detection.** 4 consecutive timeouts end the session. TCP keepalive runs on both sides, and the bridge closes RFCOMM when the app leaves.
- **Failed DTC scan ≠ "no codes"** (`obdProtocolManager.ts:313-349`). The UI keeps the last good list. This avoids a dangerous false "all clear".
- **Parsers work per message** and reassemble ISO-TP. NRCs are decoded and logged once per PID.

### Connection findings

| # | Sev | Where | Problem | Fix |
|---|---|---|---|---|
| C1 | Med | `main.ts:323` | `baudRate: 115200` is fixed. USB ELM327 clones (CH340/PL2303) usually run at **38400**, and they fail with a misleading "Adapter not responding — … Bluetooth SPP" message. | Auto-baud: probe `ATI` at 115200, 38400 and 9600. Make the baud rate configurable. |
| C2 | Med | `main.ts:317` | `isBluetooth` treats any path not matching `usbserial\|usbmodem\|ttyUSB\|ttyACM` as Bluetooth. `cu.SLAB_USBtoUART` (CP210x) gets a 3 s delay and `system_profiler` polling every 5 s for no reason. | Decide by `SerialPort.list()` metadata (`vendorId` present means USB), and keep the regex as a fallback. |
| C3 | Med | `main.ts:347-357`, `autoConnect.ts` | When the TCP link drops mid-session (Wi-Fi blip, the truck cranking and browning out the board), the session ends with "error". Auto-reconnect runs only when the app opens. | After `link-lost` or `close` on a `tcp://` session the user didn't end, retry with backoff through `connectWithRetry`, and say "Reconnecting…" in the toolbar. |
| C4 | Med | `main.ts:374-378` | A SerialPort `error` after open sets the status to `error` but leaves the poll loop running on the broken port until 4 timeouts pile up. | End the session on a post-open `error`, as `close` already does. |
| C5 | Med | `obdParsers.ts:17-47`, init `ATH0` | With headers off on CAN, two ECUs answering with multi-frame replies (`0902`, `03` with 3+ codes, `0904`) interleave their `0:`/`1:` segments, and `responseMessages` merges them into one corrupt message. This doesn't affect the J1850 Silverado; it does affect 2008+ CAN vehicles with an ECM and a TCM. | For multi-frame requests on CAN, turn on `ATH1` and group frames by CAN ID, or address each ECU with `ATCRA 7E8` / `7E9` in turn. |
| C6 | Low | `elm327Commander.ts:188-203` | `sendExpect` only warns when `ATE0`/`ATH0`/`ATS0` don't answer OK. If echo stays on, every reply carries the command line. Today the parsers happen to filter it out (the SID doesn't match), but `ATDP`/`STI`/`ATRV` read `lines[0]`, which would then be the echo. | Retry `ATE0` once. If it still fails, read the *last* line for AT replies, or abort init with a clear message. |
| C7 | Low | `elm327Commander.ts:200-207` | `ATSP0` is the only option, so every connect pays the protocol search (up to 10 s). | Remember `ATDPN` per vehicle and use `ATSP A<n>` (try n, fall back to auto) next time. |
| C8 | Low | `tcpPort.ts:130` | `setKeepAlive(true, 5000)` only sets the idle time. macOS defaults to 8 probes 75 s apart, so an idle half-open socket is noticed after about 10 minutes. | Poll `ATRV` while idle (it already happens while polling), or detect the drop at app level with a heartbeat. |
| C9 | Low | `obd_tcp_bridge.py:120-131` | `bt_connect` blocks the single select loop for up to 6 s per attempt, so a second client's connect waits. | Acceptable for one user. If multi-client support is ever added, move adapter bring-up to a thread. |
| C10 | Low | `obd_tcp_bridge.py:37` | `OBD_NAME` includes the bare word `obd`, and `auto` picks the *first* paired match. A paired "OBD-something" headset or a second dongle can be chosen. | Prefer `OBDLink` matches, then the others. Log which MAC was picked, and persist it after the first successful link. |
| C11 | Low | `SerialLink.sendall` | No write timeout on the USB fd, so a wedged USB adapter blocks the loop. | Use `select` for writability with a 5 s timeout, as the socket path does. |
| C12 | Low | `ARDUINO_SIGNAL_LAB_PROMPT.md` | Still describes the bridge using `/dev/rfcomm0`. The bridge now opens RFCOMM itself (`77bb124`). | Update the prompt. |
| C13 | Info | UNO Q MCU | The STM32U585 half is unused by the OBD path. It is the natural home for the ignition-sense / battery ADC and the signal-strength LEDs (see section 5). | — |

---

## 3. Application bug list

| # | Sev | Where | Problem | Fix |
|---|---|---|---|---|
| B1 | Med | `renderer/store/appStore.ts:297-301` | `updatePIDReading` changes `prev.timestamp` **in place** and returns `{}`. Zustand subscribers aren't notified, so no screen can show "stale" data. A sensor that freezes at its last value looks live forever. It also breaks the store's immutability assumptions. | Keep a separate `lastSeen: Record<pid, number>` updated immutably (or throttled), and show a stale badge after N× the PID's tier interval. |
| B2 | Med | `screens/EcuBusScreen.tsx:106-160` | The whole screen (CAN monitor, signals, LIN, DoIP, scripts) is **generated demo data** (`Math.random()` frames, `192.168.1.x` entities, a sample VIN) in the production navigation, under "Advanced". Some tabs say "Demo", but the CAN monitor shows random frames as if they were live. | Hide it behind a feature flag in packaged builds, or put a full-width "Demo — not connected to the vehicle" banner on every tab. |
| B3 | Med | `screens/EcuBusScreen.tsx:27-35` | The "read-only" UDS list includes `0x10 03` (extended session) and `0x23` (ReadMemoryByAddress). Session control changes ECU state (it can disable normal messaging on some modules), and neither is blocked by the commander. | Leave `0x10` out until a real UDS backend exists with its own review. |
| B4 | Med | `main.ts:928-930` | The CarsXE key comes only from `process.env.CARSXE_API_KEY`. A packaged app launched from Finder or the Dock doesn't inherit shell variables, so the feature never works for end users. | Store the key with `safeStorage` and enter it in Settings (as the Claude key is). |
| B5 | Low-Med | `appStore.ts:447-455` | The parasite risk score adds 1 point when long-term fuel trim exceeds ±7 %. Fuel trim says nothing about key-off current draw, so this inflates the score on a lean engine. | Drop the term, or show it as a separate engine finding. |
| B6 | Low | `main.ts:723-728` | `obd:check-modules` returns `[]` for real vehicles, so the Module monitor always says "Unknown". This is documented, but the screen should say "Wake detection not available yet" instead of an empty list that looks like a result. | — |
| B7 | Low | `main.ts:709` | `pcm:read-ids` runs without the bus lock when `obd` is null (between init and `startOBDManager`). The window is narrow, but the PCM read turns headers on. | Refuse with "Still starting up" until `obd` exists. |
| B8 | Low | `main.ts:918` | The report waits a fixed 300 ms after `render()` before `printToPDF`, so a long log page can print half-laid-out. | Have `render()` return a promise, or post a `done` flag, and wait for it. |
| B9 | Low | `appStore.ts:408-426` | The CSV export holds only *changed* values per PID (history drops repeats), so a constant reading shows as one row and the export isn't a regular time series. Values aren't CSV-escaped either. | Export from the Data Logger's recording, or fill forward at a fixed step. Quote the fields. |
| B10 | Low | `claudeAssistant.ts:15-35` | The model IDs, the default, the fallback model and the beta flag string are hardcoded. A retired model ID breaks the assistant until a new build ships. | Load the list from the Models API at startup, with a built-in fallback. |
| B11 | Low | `obdProtocolManager.ts:387-394` | When the catalog has no module, `B → "BCM/IPC"` and `C → "ABS/EBCM"` apply GM names to every make. | Take the fallback from the platform profile. |
| B12 | Low | `ConnectionScreen.tsx:216` | The default bridge address `192.168.1.33:35000` is one home network's DHCP lease. | Prefill from `connection.json` or mDNS (`tattlestone.local`). |

Nothing in the review points to data-loss or crash bugs in the storage layer. The SQLite migration runs inside a transaction and writes a `.bak` first, and unreadable JSON files are moved aside.

---

## 4. Clearing codes and reprogramming: how they could work

The app is read-only by design today, and is enforced twice: `ELM327Commander` refuses write services, and the bridge drops `04`. Both features below are possible with the current hardware. Each changes the app's safety model, so each needs an explicit design decision before any code.

### 4a. Clearing codes

| Target | Service | Works on the 2004 Silverado? | Notes |
|---|---|---|---|
| Emissions ECUs (ECM/PCM, TCM) | OBD-II **Mode 04** | Yes | Clears stored and pending DTCs, freeze frames, O2 test results and **all readiness monitors**. The truck then fails an emissions inspection until the drive cycles complete. Does **not** clear permanent DTCs (Mode 0A, 2010+), by design. |
| Body/chassis modules (BCM, IPC, EBCM, SDM…) | GM Class 2 **$14** ClearDiagnosticInformation, physically addressed (`ATSH 6C <module> F0`, then `14`) | Yes, module by module | Needs the module address map, which already exists in `gmt800.ts`. SDM (airbag) codes for crash data can't be cleared, and you shouldn't try. |
| CAN vehicles (2008+) | UDS **$14 FF FF FF** per module; GMLAN `$04`/`$14` | Not this truck | Some modules require an extended session first (`10 03`). |

**How it should be designed if you want it:**
1. **Off by default.** A setting reads "Allow clearing trouble codes (changes the vehicle)" and needs a second confirmation to switch on.
2. **One audited code path.** Add `ELM327Commander.clearDTCs(target)`, with a private, unexported way past the guard. The generic `send()` stays read-only, and the allowlist from S2/S4 stays in place.
3. **Preconditions, checked by reading first:** key on, engine off (`010C` = 0 rpm), vehicle speed 0 (`010D`), battery above 12.0 V (`ATRV`), and a successful DTC scan within the last 60 s.
4. **Capture before clearing:** save the full DTC list, every freeze frame and the readiness status (`0101`) as a snapshot, so the evidence survives.
5. **Confirm with consequences.** "This also resets readiness monitors; the vehicle will fail an emissions test until it has been driven through its drive cycles. Permanent codes cannot be cleared." The user types or holds to confirm.
6. **Verify:** re-scan after 2 s and report which codes are gone and which came straight back (an active fault re-sets immediately). Write the result to the session log.
7. **Bridge:** unblock Mode 04 only for an authenticated client (S1) that sends a `TATTLE CLEAR` intent line first. That way a random LAN client still can't clear codes.
8. **Tests:** simulator support for `04`/`44`, a precondition-failure path for each check, and a test that `send('04')` is still refused.

### 4b. Reprogramming (flashing)

**What the 2004 Silverado's PCM needs.** It is a GM P01/P59 (`pcmDiagnostics.ts` already reads its identity). Reflashing it over J1850 VPW is what **PcmHammer** does:
- security access (`$27`) with the seed/key algorithm,
- a kernel uploaded to PCM RAM (`$34`/`$36`),
- 4× VPW high-speed mode (`$A1`),
- reading or writing the 512 KB / 1 MB flash in blocks, then a checksum and a reset.

A full *read* (a calibration backup) also requires uploading the kernel, so even "read the bin" changes the PCM's runtime state.

**Why it should not be built into Tattlestone as it stands:**
- **Brick risk over this link.** The Network Mode path has two radio hops (Mac→Wi-Fi→UNO Q→Bluetooth→OBDLink). A drop during `$36` leaves the PCM unbootable, so recovery needs a bench harness. Flashing must only ever run over a **wired USB** adapter, with a battery maintainer holding about 13.5 V.
- **Adapter support.** The OBDLink MX+ supports VPW, but PcmHammer's 4× mode and large-block support vary by adapter and firmware. Validate this before relying on it.
- **Licensing.** PcmHammer is GPL-3.0. `pcmDiagnostics.ts` already *derives block IDs* from it (a factual table, which is fine). Copying its kernel or flashing code would make Tattlestone a GPL derivative.
- **Law.** In the US, changing emissions-related calibration on a road vehicle can violate the Clean Air Act's tampering provisions (and CARB rules in California). Speedometer and tyre-size correction, TPMS, or a stock reflash to a newer GM calibration are generally fine. Removing emissions functions is not.
- **OEM path.** Dealer-equivalent reprogramming of GM modules uses an SAE J2534 pass-through device and GM's own software subscription. The OBDLink MX+ is not a J2534 device.

**Recommended path, in order of risk:**
1. **Done:** CVN and calibration-ID reads (Mode 09, Mode 3C), which already show whether the PCM was reflashed.
2. **Next, safe:** add a "Calibration check". Compare the OSID and calibration IDs against GM's published latest calibration for the VIN, and link to the matching TSB in the existing NHTSA data.
3. **Hand-off, not built in:** export the PCM identity (OSID, segment IDs, VIN, BCC) in a format PcmHammer and other tuning tools can take, and launch the external tool. Tattlestone stays read-only, and the GPL boundary stays clean.
4. **Only with a separate design review:** an in-app flash module. It would be wired-only, refuse Network Mode, need a voltage gate and a full backup first, verify block by block, have a recovery mode, and ship as a separate opt-in build.

---

## 5. Enhancements and future features

### Connection and hardware
- Auto-reconnect after mid-session drops for Network Mode (C3), with a toolbar "Reconnecting…" state.
- Auto-baud and USB-adapter detection by vendor ID (C1, C2).
- mDNS discovery of the bridge (`_tattlestone._tcp`); there's no typing an IP.
- Bridge auth token and TLS (S1). A "Pair this Mac" flow shows a 6-digit code on the UNO Q LED matrix.
- **UNO Q MCU features:**
  - Read battery voltage straight from the 12 V rail through a divider into the STM32 ADC. This works with the ignition off, when the ELM327 sleeps, so it suits overnight parasitic-draw logging.
  - An ignition-sense input that auto-starts and stops the bridge.
  - A current-clamp / shunt input for a true milliamp draw reading (see `docs/hardware/fuse-sensor-parts-list.md`).
  - LED-matrix status: link state, RSSI, active DTC count.
- The bridge stores a ring buffer of readings while the Mac is away (an overnight draw test without the laptop), and the app downloads it on reconnect.
- An OTA update for the bridge script from the app (signed tarball with version check).

### Diagnostics
- Real module wake detection (B6). Passive J1850 monitoring (`ATMA` with filters) to see which Class 2 nodes still talk after key-off. This is the Parasitic Draw suite's missing core.
- Mode 06 on-board monitor test results (misfire counts per cylinder, catalyst efficiency) with limits.
- Readiness / I/M "will it pass inspection" screen built from `0101` and `0141`.
- Per-ECU views for CAN vehicles (ATH1, grouped by responder) (C5).
- Enhanced GM PIDs over Mode 22 / Class 2 `$AA` (trans temp, TCC slip, misfire history), read-only.
- Fuel economy and trip computer from MAF and speed.
- Stale-data badges on every live value (B1).

### Records, AI, and reporting
- Session timeline that lines up DTC appearances, voltage, markers and freeze frames.
- Assistant tools: let Claude ask the app for specific PIDs or a fresh scan through a tool-use loop (read-only tools), instead of only a static snapshot.
- Repair-history notebook per VIN; the assistant can cite it.
- Shareable report bundle (PDF + raw JSON + log) for a mechanic.

### Production and platform
- Developer ID signing, notarization, an auto-update channel and a release checklist (S7).
- A typed config system and Settings groups (the hardcoded-values prompt).
- Crash and error reporting (opt-in, no VIN or location).
- More `PlatformProfile`s: GMT900 (CAN, 2007-2014), Ford, Toyota. The registry is ready for them.
- Accessibility pass (VoiceOver labels on gauges, keyboard navigation of the sidebar).
- Optional clear-codes capability built to section 4a's design.

---

## 6. Order of work

1. S1–S4: bridge auth and host binding, a shared allowlist for app and bridge, a fix for the truncation, a fix for the CR injection. Small, testable, high value.
2. B2/B3: put the EcuBus demo behind a flag; drop `0x10`.
3. The hardcoded-values prompt (config system, profile facts, bridge env file).
4. C1–C4 and B1: auto-baud, USB detection, auto-reconnect, the post-open error, stale data.
5. B4, S5, S7: CarsXE key in Settings, systemd hardening, signing and notarization.
6. Then features from section 5; clearing codes only after its design is signed off.
