# Changelog

## Adapter link fixes (PR #12)

- **Dead links are noticed.** The app detects an adapter link that has gone quiet, resyncs after replies that arrive late, waits for a Bluetooth link to settle, and keeps TCP connections alive.
- **Clear reasons when setup fails.** If the port closes during setup, the app shows `Connection failed: <reason>` instead of false "No response to ATZ/ATI" lines and a silent "disconnected".
- **The UNO Q bridge says what went wrong.** It sends `BRIDGE ERROR: <reason>` before hanging up (for example when `/dev/rfcomm0` isn't bound), and the app shows that reason in its banner.
- **The bridge and emulator start on boot.** Both have systemd units, and the bridge has unit tests.
- Settings → About shows the git commit the app was built from.

## Network Mode and the Tattlestone brand

- **Network Mode.** Connect to an OBD adapter over TCP, for example through the Arduino UNO Q bridge or a Wi-Fi ELM327 dongle.
- **UNO Q emulator.** The board can stand in for the truck so the app runs end to end with no adapter.
- **The Tattlestone identity** (Basalt, Signal and Paper, the T-and-dot mark, the app icon) is applied across the app.

## Recalls, bulletins and a bigger code catalog

- **Recalls & bulletins screen (new).** Looks up the vehicle's safety recalls, manufacturer bulletins (TSBs, GM PIs, special coverage) and owner complaints from NHTSA. Bulletins and complaints that cite a code the vehicle reported are flagged, and each bulletin's PDF opens from NHTSA. Free public-domain data, no API key.
- **More live data and ECU identity.** 53 more standard PIDs, including distance, time and warm-ups since codes were cleared, which shows when codes were cleared before a sale. Mode 09 calibration IDs and CVNs on the PCM identity screen work on any vehicle, and ECU refusals are logged with their ISO 14229 reason.
- **Grounded assistant answers.** The Claude assistant answers code questions from Tattlestone's catalogs and NHTSA bulletins, not from memory, and shows which sources it used.
- **9,500+ generic fault codes.** Codes missing from the curated GMT800 catalog now fall back to [OBDex](https://github.com/foerbsnavi/OBDex) (CC0): description, likely causes ranked by likelihood, symptoms and repair effort.
- **Offline VIN decoding.** VINs decode against a bundled copy of NHTSA's vPIC database ([corgi](https://github.com/cardog-ai/corgi)), so it works with no network. When online, the vPIC API fills in trim and transmission.

## macOS-native redesign

The whole interface was redesigned to look and behave like a native macOS app, in the style of Xcode, Instruments and Activity Monitor. It replaces the earlier dark "McLaren" theme. The design is in [docs/superpowers/specs/2026-09-26-macos-redesign-design.md](docs/superpowers/specs/2026-09-26-macos-redesign-design.md).

- **Light appearance.** The app is always light, even when macOS is in dark mode.
- **New app shell.**
  - A 220px translucent sidebar groups the screens into Overview, Subsystems, Diagnostic, Advanced and Records, with Settings pinned at the bottom.
  - A toolbar shows the vehicle, adapter and protocol, battery voltage, the active fault-code count and the session timer.
  - Clicking the connection status opens a popover to connect, disconnect or cancel.
- **Keyboard shortcuts.** ⌃⌘S shows or hides the sidebar, and ⌘, opens Settings.
- **A shared component library** replaces the old tiles, gauges and bars: Card, Metric, Gauge, Sparkline, Button, SegmentedControl, Badge, AlertBanner, DataRow, EmptyState and Tooltip. They live in `components/ui/`.
- **All 19 screens were restyled.** Their controls and data are unchanged.
- **Accessible colour.** Status text uses dedicated colours that meet WCAG 4.5:1 contrast. Normal readings are shown in neutral colours. Orange and red are reserved for warnings and critical values, so problems stand out.
- **Native typography.** SF Pro for text; SF Mono with tabular figures only for numbers, VINs, hex and PIDs. Web fonts were removed, so the app works fully offline.
- **Consistent spacing.** A 4pt spacing grid and three corner radii (6/10/12px) are used across the app.

## Strictly read-only

The Clear DTCs button has been removed, and the command layer now refuses any request that would clear codes or change a control module. See [docs/SECURITY.md](docs/SECURITY.md).

## Bug fixes from the redesign

- **Crash on disconnect (fixed).** A simulator reply that arrived just after you disconnected hit a null reference in the main process. The app then showed an error dialog and had to be force-quit. Pending simulator replies are now cancelled on disconnect.
- **Connect/disconnect races (fixed).** Each connection attempt is now tied to its own session. Late replies, port events and Bluetooth signal readings from an earlier session are ignored instead of corrupting the new one. A newer connect or disconnect now wins over one that is still closing the port.
- **Cancel while connecting (new).** A connection attempt in progress can now be cancelled from the connection popover or the Connection screen.
- **"Connecting" state.** The app now reports "connecting" while the simulator is starting up, instead of jumping straight to connected.
- **Polling after disconnect (fixed).** Disconnecting during a scan no longer lets polling restart by itself.
- **Live telemetry crash (fixed).** A React hooks-order bug could crash the Live screen when a second reading appeared.
- **Card sizing (fixed).** Cards and metric tiles no longer shrink or overlap inside scrolling columns.
- **EcuBus CAN table (fixed).** Columns no longer overlap.

## Open

Open items from the code review are tracked in [docs/superpowers/code-review-report.md](docs/superpowers/code-review-report.md). The ones you can see in the app:

- **Module monitor** status never leaves "Unknown": the app has no module wake detection yet, so nothing reports module state back to the screen.
- **EcuBus-Pro** tabs are a demo. They show sample data, send nothing to the vehicle, and say so on screen.
- **PCM identity** checksum handling and adapter reset have not yet been checked against a real P01/P59 PCM.
