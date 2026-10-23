# Arduino App Lab Prompt: UNO Q Radio Review + Signal-Strength Light Board

Paste everything below the line into Claude in Arduino App Lab, with the Tattlestone UNO Q (`tattlestone.local`, last seen at `192.168.1.33`) connected.

---

## Role and context

You are working on an **Arduino UNO Q** that serves as the Wi-Fi bridge for **Tattlestone**, a macOS Electron OBD-II diagnostic app for a 2004 Chevrolet Silverado 1500. The board runs two halves:

- **Linux side (Qualcomm QRB2210, Debian):** owns the Wi-Fi / Bluetooth radio. It already runs `tattlestone-emulator.service` or `tattlestone-bridge.service` (one at a time) on **TCP port 35000**. That service forwards ELM327 traffic between the Mac and an OBDLink MX+ bound at `/dev/rfcomm0`.
- **MCU side (STM32U585, Zephyr/Arduino core):** drives the onboard **8 × 13 LED matrix** and the MCU's RGB user LEDs.

The two halves talk through the App Lab **Bridge** (RPC between `python/main.py` and `sketch/sketch.ino`).

**Hard rules**

1. Do not touch port 35000, the two existing `tattlestone-*.service` units, or `/dev/rfcomm0` ownership. The OBD path must keep working while this app runs.
2. Every review step is **read-only**. Do not change radio settings, regulatory domain, power-save mode, firmware or drivers. If a fix looks needed, report it and stop.
3. Do not rfcomm-bind, pair or scan in a way that knocks the OBDLink off `/dev/rfcomm0`. Use passive reads first. Run active scans only if nothing is connected, and say so in the report.
4. Report what you actually observed. If a command fails or a value is unavailable, say so, show the error, and leave the field empty. Never invent or estimate a reading.

---

## Part 1 — Review the network card, driver, and signal

Run these on the Linux side and build a report. Skip a tool if it isn't installed, and note which ones were missing.

### 1a. Hardware and driver identity
- `uname -a`, `cat /etc/os-release`
- Wi-Fi interface and driver: `ip -br link`, `iw dev`, `readlink -f /sys/class/net/wlan0/device/driver`, `ethtool -i wlan0`
- Kernel modules: `lsmod | grep -Ei 'ath|wcn|cnss|qca|bt|hci'`
- Firmware load messages: `dmesg | grep -Ei 'wlan|ath|wcn|firmware|bluetooth|hci' | tail -n 60` (use `sudo` only if `dmesg` is restricted)
- Bluetooth controller: `hciconfig -a` or `btmgmt info`, plus `bluetoothctl show`
- Regulatory domain: `iw reg get`

### 1b. Wi-Fi link health
- `iw dev wlan0 link`: SSID, BSSID, frequency/band, signal (dBm), tx/rx bitrate
- `iw dev wlan0 station dump`: signal, signal avg, tx retries, tx failed, beacon loss
- `cat /proc/net/wireless`: link quality, level, noise
- `nmcli -f IN-USE,SSID,CHAN,BAND,SIGNAL,SECURITY dev wifi` (passive list from the last scan, no rescan)
- Power save: `iw dev wlan0 get power_save`
- Take a **30-second RSSI sample at 1 Hz** and report min / mean / max / std-dev. Signal swings matter more than a single reading.
- Latency to the gateway: `ping -c 20 $(ip route | awk '/default/{print $3}')`. Report loss and jitter.

### 1c. Bluetooth link health
- Connected devices: `bluetoothctl devices Connected` and `bluetoothctl info <MAC>` for each
- RSSI of the OBDLink connection (classic): `hcitool rssi <MAC>` or `btmgmt conn-info <MAC>`. It only works while connected, so record "not connected" if that's the case.
- TX power / link quality if exposed: `hcitool tpl <MAC>`, `hcitool lq <MAC>`
- `rfcomm` state: `rfcomm -a`, `ls -l /dev/rfcomm*`

### 1d. Coexistence
The UNO Q shares one combo chip (and antenna) for 2.4 GHz Wi-Fi and Bluetooth. Note:
- Whether Wi-Fi is on 2.4 GHz or 5 GHz (2.4 GHz contends with BT)
- Whether Wi-Fi throughput or BT RSSI drops while the other is busy. Compare the 1b sample taken with the OBD bridge idle and with it streaming.

### 1e. Report format
Write `~/signal-review/review-<timestamp>.md` with:
1. A summary table: interface, chip, driver, firmware version, band, channel, RSSI (min/mean/max), BT device, BT RSSI, power-save, reg domain.
2. Findings, ranked by severity, each with the evidence (the command and the output line).
3. Recommendations, labeled **for the user to approve** (none applied).
4. A list of the commands that failed or weren't available.

---

## Part 2 — Signal-strength light board

Build an App Lab app named **`tattlestone-signal`** that shows live Bluetooth and Wi-Fi signal strength on the board.

### 2a. Verify the display hardware first
The request: **split the light board down the middle, blue for Bluetooth on one half and green for Wi-Fi on the other.**

Before writing code, check the UNO Q docs/pinout and tell the user what the onboard 8 × 13 matrix can do:
- If the matrix is **single-color**, it cannot show both blue and green. In that case, implement:
  - **Matrix**: left half = Bluetooth bars, right half = Wi-Fi bars, same LED color, with a center divider column.
  - **Color identity**: the MCU's RGB user LEDs. One LED lights **blue** with brightness scaled to BT strength, the other lights **green** scaled to Wi-Fi strength.
  - **Optional upgrade**: if the user wants true blue/green on the bar graph itself, propose an 8 × 13 (or 8 × 8 + 8 × 8) addressable RGB panel such as a Modulino Pixels or WS2812 matrix on the Qwiic/GPIO header, keeping the same layout. Don't buy or assume one; ask.
- If the matrix supports color, render the halves blue and green directly.

State which path you are taking and why before building.

### 2b. Layout (13 columns × 8 rows)
```
 col: 0 1 2 3 4 5 | 6 | 7 8 9 10 11 12
      ── BT (blue) ─  ┊  ── Wi-Fi (green) ──
```
- Columns 0–5: Bluetooth. Columns 7–12: Wi-Fi. Column 6: divider (dim on rows 0 and 7 only, or fully off; choose one and document it).
- Each half is a **bottom-up level meter**, 0–8 rows lit.
- The lit row count comes from RSSI using this default map (put it in one config table so it can be tuned):

| Rows lit | Wi-Fi RSSI (dBm) | BT RSSI (dBm, from `hcitool rssi` / conn-info) |
|---|---|---|
| 8 | ≥ −50 | ≥ 0 (golden range) |
| 6 | −51 … −60 | −1 … −5 |
| 4 | −61 … −67 | −6 … −10 |
| 2 | −68 … −75 | −11 … −20 |
| 1 | < −75 | < −20 |
| 0 + blink bottom row | no link / no reading | not connected |

Note: the classic BT RSSI from `hcitool rssi` is **relative to the controller's golden receive power range**, not absolute dBm. Confirm which value your source returns and adjust the map before shipping.

- Smooth with a moving average or EMA (~3–5 s) so the bars don't flicker. Update the display at 1 Hz.
- A stale reading (older than 5 s) shows as "no reading", never as the last value.

### 2c. App structure
```
tattlestone-signal/
  app.yaml
  python/main.py        # Linux: sample RSSI, serve control API, push levels over Bridge
  sketch/sketch.ino     # MCU: draw matrix + RGB LEDs from Bridge calls
  README.md
```
- **python/main.py**
  - Samples Wi-Fi RSSI (`iw dev wlan0 link` or `/proc/net/wireless`) and BT RSSI for the OBDLink MAC, if connected, once per second.
  - Calls the sketch over Bridge with `set_levels(bt_rows, wifi_rows, bt_ok, wifi_ok)` and `set_enabled(bool)`.
  - Holds the **display state** (`enabled: true|false`) and persists it to `~/.config/tattlestone-signal/state.json` so it survives reboots.
- **sketch/sketch.ino**
  - Provides `set_levels` and `set_enabled` via `Bridge.provide(...)`.
  - When disabled, clears the matrix and turns the RGB LEDs off. Sampling continues on the Linux side so the next "on" is instant.
  - Draws nothing until the first `set_levels` arrives. Shows a single dim center dot if Bridge hasn't been heard from in 10 s.

---

## Part 3 — Tattlestone on/off button (plan only, don't edit the Mac app)

Write `~/signal-review/tattlestone-button-plan.md` describing how the Tattlestone desktop app will toggle the light board. Build only the **board side** of the contract now.

### 3a. Board-side control API (build this)
In `python/main.py`, serve a small HTTP/JSON API on **port 35001** (not 35000; that port is a raw ELM327 byte stream and must stay that way):

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/signal` | — | `{"enabled":true,"wifi":{"rssi":-58,"rows":6,"ok":true},"bt":{"rssi":-3,"rows":6,"ok":true},"ts":1729...}` |
| POST | `/signal/display` | `{"enabled":false}` | same as GET, after applying |

- Bind to the LAN interface. Accept only a JSON body under 1 KB. Reject anything except `enabled: boolean` with 400.
- Optional shared token: if `~/.config/tattlestone-signal/token` exists, require `Authorization: Bearer <token>`.
- Ship it as `tattlestone-signal.service` (or the App Lab auto-start equivalent) so it starts on boot.
- Test from the Mac:
  ```
  curl -s http://tattlestone.local:35001/signal
  curl -s -X POST -H 'Content-Type: application/json' -d '{"enabled":false}' http://tattlestone.local:35001/signal/display
  ```

### 3b. Tattlestone app changes (describe; the user will implement in Claude Code)
The Mac app is Electron + React + TypeScript in `agador-spartacus/files/`. Describe the plan in these terms:

1. **Main process** (`src/main/`): add a `signalBoard.ts` module that calls the board API with Node `http`, a 2 s timeout, and the same host the user typed for Network Mode (strip `tcp://` and the port, use 35001). Map `ECONNREFUSED` / `EHOSTUNREACH` / `ENOTFOUND` / timeout to plain-English messages the way `tcpPort.ts` already does.
2. **IPC**: register `signal:get` and `signal:set-display` through the existing `handle()` wrapper in `main.ts`, so the app-window sender check applies.
3. **Preload** (`src/main/preload.ts`): expose `signalGet()` and `signalSetDisplay(enabled: boolean)` on `electronAPI`, with types added to `src/shared/types.ts`.
4. **Renderer**: put a **"Signal lights"** toggle on `ConnectionScreen.tsx` next to the Network Mode controls, showing live Wi-Fi/BT rows as two small bar meters (blue / green to match the board). Poll `signalGet` every 2 s only while that screen is visible and Network Mode is selected. Disable the toggle with a reason when the board is unreachable.
5. **State**: keep the toggle's truth on the board, not in `appStore`. The UI shows what `GET /signal` returns, so a reboot or a second client can't desync it.
6. **Tests**: unit-test the host parsing and error mapping the way `tcpPort.test.ts` does; no network in tests.
7. **Read-only promise**: this button only touches the light board, never the vehicle. Note that in the plan.

---

## Deliverables checklist
- [ ] `~/signal-review/review-<timestamp>.md` (Part 1)
- [ ] Statement of which display path was chosen (single-color matrix + RGB LEDs, or full color) and why
- [ ] `tattlestone-signal` App Lab app, running, with bars that respond (walk the board away from the router to show the Wi-Fi bars drop)
- [ ] Port 35001 API answering the two `curl` commands above
- [ ] `~/signal-review/tattlestone-button-plan.md` (Part 3)
- [ ] Confirmation that `printf 'ATI\r010C\r' | nc -w 2 tattlestone.local 35000` still returns `ELM327 v1.5` and a `410C` line after everything is installed
