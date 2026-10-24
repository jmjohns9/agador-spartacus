# Hardware

What to buy, how to connect it, and how the Arduino UNO Q fits in.

## Running against a real vehicle

The reference adapter is the **OBDLink MX+**: Bluetooth Classic, an ELM327 v1.5 superset, GM-LAN and J1850 VPW, and the extended `STx` commands. Any ELM327-class adapter that shows up as a serial port should work. Features that depend on `STx` degrade gracefully.

**macOS (Bluetooth):**

1. Plug the adapter into the OBD-II port and turn the ignition ON. The engine can be off.
2. Pair it under **System Settings → Bluetooth**. HC-05-based builds use the PIN `1234`.
3. Find the port with `ls /dev/tty.* | grep -i obd`. It's usually `/dev/tty.OBDII` or `/dev/tty.OBDLink-MXPlus-Port`.
4. Open the **Connection** screen and pick the port from the list. Detected OBD adapters are flagged in the list.
5. To give up on a slow connection, click **Cancel**.

**Linux (USB serial):** the adapter appears as `/dev/ttyUSB0` or `/dev/ttyACM0`. Add your user to the `dialout` group.

## Network Mode with the Arduino UNO Q

![How the Arduino UNO Q sits between the truck and the Mac](../brand/github/arduino-flow-light.svg)

Network Mode lets the app talk to an adapter over Wi-Fi instead of Bluetooth. The UNO Q stays in the truck, holds the Bluetooth link to the OBDLink, and serves it to the Mac on TCP port 35000.

The board runs one of two programs from [`files/firmware/uno-q-bridge/`](../files/firmware/uno-q-bridge/), each with a systemd unit so it starts on boot. Only one runs at a time.

| Program | Unit | What it does |
|---|---|---|
| `obd_tcp_bridge.py` | `tattlestone-bridge.service` | Opens the Bluetooth link to the paired OBDLink itself and forwards bytes between it and the app. Only a client holding the bridge's pairing token gets a session. Every command is checked against `command_policy.json`, the same read-only allowlist the app uses; anything else gets `?` and never reaches the adapter. If it can't reach the adapter it sends `BRIDGE ERROR: <reason>` before hanging up, and the app shows that reason. |
| `elm327_emulator.py` | `tattlestone-emulator.service` | Answers like an ELM327 with no adapter attached, so you can test the Wi-Fi link on the bench. A few values are real board readings: SoC temperature as ambient air temperature, and uptime as engine run time. |

Setup guides, step by step:

- [Wi-Fi bridge setup](uno-q/wifi-bridge-setup.html): copy the files, install the units, test with `nc`, connect from the app.
- [OBDLink bind guide](uno-q/obdlink-bind-next-steps.html): pair the OBDLink with the board and bind `/dev/rfcomm0`.

In the app, open **Connection**, find **Network adapter**, enter the board's address with the port (for example `192.168.1.33:35000`), paste the bridge's pairing token and click **Save token**, then click **Connect over Wi-Fi**.

**Pairing token.** The bridge refuses any client that can't prove it holds the token. On connect it sends `BRIDGE AUTH <nonce>`; the app answers `AUTH <HMAC-SHA256(token, nonce)>`, so the token itself never crosses the network and an overheard answer can't be replayed. A stranger who connects (a phone OBD app probing port 35000, say) gets `BRIDGE ERROR` and can't take over or stall the session in progress. Create the token once on the board:

```bash
sudo python3 ~/uno-q-bridge/obd_tcp_bridge.py --new-token /etc/tattlestone/bridge-token
sudo chgrp arduino /etc/tattlestone/bridge-token
```

The app stores the token per bridge address, encrypted with the macOS keychain. To listen on one interface only, set `TATTLESTONE_BRIDGE_HOST` in `/etc/default/tattlestone-bridge` (see `tattlestone-bridge.env`). The token protects who can connect; the traffic itself is still plain TCP, so keep the bridge on a network you trust.

### Planned: measuring the drain directly

A fuse-slot current sensor (INA260) on the UNO Q's microcontroller side would replace the "pull a fuse and watch a meter" test with a measured reading. It isn't built yet. Parts, wiring and safety rules are in [hardware/fuse-sensor-parts-list.md](hardware/fuse-sensor-parts-list.md).

## Choosing an adapter

There are two validated ways to buy the hardware. The full analysis is in [history/HARDWARE_SOFTWARE_COMPATIBILITY_REVIEW.md](history/HARDWARE_SOFTWARE_COMPATIBILITY_REVIEW.md), and parts with retailer sourcing are in [history/shopping-list.html](history/shopping-list.html).

| | Path A — OBDLink MX+ | Path B — DIY STN1110 + HC-05 |
|---|---|---|
| Cost | $110–135 | $210–240 (breadboard) |
| Lead time | 2–3 days | 10–14 days + 2–3 hrs assembly |
| Setup | None, works out of the box | Mandatory HC-05 AT-mode config + LM2596 calibration |
| Protocols | J1850 VPW, GM-LAN, extended `STx` | J1850 VPW, standard OBD-II (no `STx`) |
| Best for | Immediate diagnostics | Learning electronics, redundant adapter |

**Do not use:**
- AliExpress/eBay STN1110 clones, which use counterfeit chips.
- HC-05 modules without an AT-mode button, because their baud rate can't be reconfigured.
- The Macchina A0, which is CAN-only and doesn't work with J1850 VPW.

Bench-calibrate any LM2596 to 5.0 V ±0.1 V **before** connecting it to anything.

Approved parts: SparkFun WIG-09555 (genuine STN1110), DSD TECH HC-05 model B076BS39YZ, and LYLANMO LM2596.

## Safety

- Don't read live data while driving.
- Check any voltage source with a multimeter before connecting it to the OBD-II port.
- The app never writes to a control module. See [SECURITY.md](SECURITY.md#read-only-by-design).
