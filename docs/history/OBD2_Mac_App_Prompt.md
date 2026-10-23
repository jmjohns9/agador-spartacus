# OBD2 Mac App — Master Build Prompt
**Project:** Parasitic Draw Diagnostic Suite for 2004 Chevy Silverado 1500 Z71  
**Adapter:** OBDLink MX+ (Bluetooth, ELM327 v1.5, GM-LAN / SW-CAN support)  
**Platform:** macOS (native Swift/SwiftUI or Electron with Node.js serial bridge)  
**Theme:** F1 Pit-Wall Telemetry · McLaren Livery

---

## 1. MISSION BRIEF

Build a professional-grade, native macOS OBD-II diagnostic application to identify and isolate the parasitic battery drain on a **2004 Chevrolet Silverado 1500 Z71** (GMT800 platform, 5.3L Vortec V8, GMLAN/Class II serial bus). The app must connect to an **OBDLink MX+ Bluetooth adapter** (Bluetooth 4.0 + Classic, ELM327 protocol), stream real-time ECU data, surface DTC fault codes with definitions, and provide a specialized **Parasitic Draw Analysis** module not commonly found in consumer OBD apps.

The visual language must evoke a **McLaren F1 pit-wall telemetry station** — technical precision meets papaya orange fire.

---

## 2. HARDWARE CONTEXT

| Item | Detail |
|---|---|
| Adapter | OBDLink MX+ (ASIN B07JFRFJG6) |
| Protocols | OBD-II, GM-LAN (SW-CAN), ISO 15765-4 CAN, SAE J1850 VPW (used by 2004 GM trucks), ISO 9141-2 |
| Connectivity | Bluetooth Classic + BLE 4.0; macOS CoreBluetooth or RFCOMM serial |
| Vehicle Bus | GM Class II / GMLAN — critical for accessing BCM, IPC, HVAC, ABS modules beyond the powertrain ECM |
| VIN | 2004 Chevrolet Silverado 1500 Z71 (GMT800) |

**Connection implementation notes:**
- Use `IOBluetooth` framework (macOS) for RFCOMM serial channel to OBDLink MX+
- Fallback: expose a virtual serial port via `ORSSerialPort` or a Node.js `serialport` bridge
- OBDLink MX+ supports the `STX` (STDI, STPC) extended command set — implement sleep/wake monitoring
- Implement ELM327 initialization sequence: `ATZ` → `ATE0` → `ATL0` → `ATSP0` (auto protocol) → `ATAT1` (adaptive timing)
- For GM SW-CAN access: send `ATSWCAN` or use OBDLink-specific `STPX` pass-through commands

---

## 3. VISUAL DESIGN — McLAREN F1 TELEMETRY THEME

### Color Palette
```
--mclaren-papaya:     #FF8000   /* Primary accent, gauges, alerts */
--mclaren-gulf-blue:  #0090D0   /* Secondary accent, data streams */
--carbon-black:       #0A0A0B   /* App background */
--carbon-panel:       #111214   /* Card/panel backgrounds */
--carbon-border:      #1E2025   /* Panel borders, grid lines */
--carbon-subtle:      #2A2D33   /* Inactive elements */
--data-white:         #F0F2F5   /* Primary text */
--data-muted:         #6B7280   /* Labels, secondary text */
--status-green:       #00D46A   /* Normal / OK */
--status-amber:       #FFB800   /* Warning */
--status-red:         #FF2D55   /* Critical / fault active */
--status-blue:        #0090D0   /* Info / pending */
```

### Typography
- **Display / Headers:** `Barlow Condensed` (700 weight) — tight, technical, mechanical
- **Data Values:** `JetBrains Mono` or `Roboto Mono` — monospaced telemetry feel
- **Body / Labels:** `Barlow` (400/500) — clean, legible at small sizes
- Load via Google Fonts or bundle locally

### Layout Language
- Dark carbon-fiber panel backgrounds with subtle `repeating-linear-gradient` texture
- Thin 1px papaya orange border accents on active panels
- Gauge rings using SVG `stroke-dasharray` animations
- Data tables with alternating `carbon-panel` / `carbon-black` row striping
- Top navigation bar styled as F1 pit-wall dashboard rail
- Animated "data pulse" dots on active live feeds (CSS keyframe ping)
- Screen corners with angled chamfer cuts (CSS `clip-path: polygon(...)`)
- McLaren "speed mark" diagonal stripe as decorative separator

---

## 4. APPLICATION ARCHITECTURE

```
/src
  /core
    BluetoothManager.swift       # CoreBluetooth + RFCOMM connection lifecycle
    ELM327Commander.swift        # AT command queue, response parser
    OBDProtocolManager.swift     # Protocol negotiation, PID dispatcher
    GMSWCANBridge.swift          # GM-specific CAN passthrough (SW-CAN / GMLAN)
    VehicleProfile.swift         # 2004 Silverado PID map, known DTCs
  /modules
    LiveDashboard/               # Real-time gauge grid
    ParasiticDrawAnalyzer/       # Core parasitic draw feature
    DTCScanner/                  # Fault code reader/clearer
    FreezeFrameViewer/           # Snapshot at DTC trigger
    ModuleWakeMonitor/           # Sleep/wake bus activity
    DataLogger/                  # CSV + JSON session recording
    FuseMapReference/            # 2004 Silverado fuse panel guide
    SensorExplorer/              # Full PID browser with filters
  /ui
    Theme/                       # Colors, fonts, components
    Components/                  # Gauge, card, chart, table widgets
    Layouts/                     # Sidebar nav, main content area
```

---

## 5. FEATURE MODULES — DETAILED SPECIFICATIONS

---

### 5.1 CONNECTION MANAGER
- **Device scanner:** Auto-discover OBDLink MX+ via Bluetooth; show signal strength (RSSI)
- **Protocol negotiation panel:** Show negotiated protocol (e.g., "SAE J1850 VPW — GM Class II")
- **Adapter status bar:** Firmware version, voltage, protocol, connection latency (ms)
- **ELM327 extended commands:** Expose OBDLink `STI` (adapter info), `STDI` (device info), `STPC` (power control), `STSLLT` (sleep timer)
- **Reconnect logic:** Auto-reconnect on drop with exponential backoff
- **Demo / Simulator mode:** Built-in ELM327 emulator for offline UI testing (seeded with 2004 Silverado typical values)

---

### 5.2 LIVE DASHBOARD (PRIMARY SCREEN)
A configurable telemetry grid of real-time gauges and readouts. Layout: 4-column responsive grid.

#### Engine & Powertrain PIDs
| PID | Name | Display |
|---|---|---|
| 010C | Engine RPM | Analog arc gauge |
| 010D | Vehicle Speed | Digital + bar |
| 0105 | Coolant Temp | Gauge + °F |
| 010B | Intake Manifold Pressure | Bar gauge |
| 010F | Intake Air Temp | Numeric |
| 0110 | MAF Air Flow Rate | Numeric g/s |
| 0111 | Throttle Position | Percentage bar |
| 0104 | Calculated Engine Load | Percentage |
| 0106 | Short-Term Fuel Trim B1 | ±% bar |
| 0107 | Long-Term Fuel Trim B1 | ±% bar |
| 0108 | Short-Term Fuel Trim B2 | ±% bar |
| 0109 | Long-Term Fuel Trim B2 | ±% bar |
| 0113 | O2 Sensor Location | Bitmask |
| 0114–011B | O2 Sensor Voltages | Strip charts |
| 0142 | Control Module Voltage | **Critical for parasitic** |
| 012F | Fuel Tank Level | Percentage |
| 0143 | Absolute Load Value | Percentage |
| 0149 | Fuel Type | Enum |
| 015C | Engine Oil Temp | °F gauge |
| 015D | Fuel Injection Timing | Degrees |
| 015E | Engine Fuel Rate | L/h |

#### Electrical System PIDs (Parasitic-Critical)
| PID | Name | Display |
|---|---|---|
| 0142 | Module Voltage (Battery) | Large prominent gauge, alert < 12.4V |
| 0146 | Ambient Air Temp | Numeric |
| ATRV | Real-time battery voltage (ELM327) | Header bar, always visible |

#### Transmission
| PID | Name |
|---|---|
| 01A4 | Transmission Actual Gear |
| GM-specific | TFT (Transmission Fluid Temp) via GM-LAN |

#### Freeze Frame
- Snapshot button captures all current PID values to a timestamped record
- Comparable side-by-side with historical snapshots

---

### 5.3 PARASITIC DRAW ANALYZER (HERO FEATURE)
This module is purpose-built for diagnosing battery drain on the 2004 Silverado. It addresses the GMT800-specific known culprits: IPC, BCM, Radio, TBC BATT fuse circuit.

#### Sub-Panels:

**A. Battery Voltage Timeline**
- Continuous `ATRV` polling every 500ms
- Line chart showing voltage over time (up to 8 hours of session data)
- Reference lines: 12.6V (full charge), 12.4V (50% charge), 12.0V (critical), 11.8V (deep discharge)
- Annotate voltage drops with timestamps
- Alert: Flash papaya orange banner if voltage drops > 0.1V in < 60 seconds with engine off

**B. Module Sleep Watcher**
- Poll `01 3E` (keep-alive) to detect ECU sleep transitions
- Monitor CAN bus silence intervals (via OBDLink passthrough)
- Log timestamps when modules wake/sleep
- **Known GMT800 issue flagging:** Detect IPC staying awake (draw ~0.2A–1.2A) by monitoring for continued responses after engine-off timeout
- Show bus activity as animated waveform strip chart

**C. Fuse Circuit Map (2004 Silverado)**
Interactive visual fuse panel for the GMT800 platform:

*Under-Hood Fuse/Relay Center (UHFRC):*
- BATT 1 (60A), BATT 2 (60A), BATT 3 (40A)
- IGN 1 (40A), IGN 2 (30A), IGN 3 (30A)
- ABS (40A), HTD SEAT (30A), BLOWER (40A)

*Instrument Panel Fuse Block (IPFB):*
- TBC BATT 10A — **#1 known parasitic culprit (BCM, IPC, interior lights)**
- RADIO 15A — **#2 known culprit (aftermarket radio / stock Delco)**
- IPC B+ 10A — **Instrument Panel Cluster power**
- BODY CTRL 10A — **BCM (Body Control Module)**
- CIGS 20A — **Accessory/lighter circuit**
- DOOR LOCKS 20A
- PWR WINDOWS 30A (driver)
- PWR MIRRORS 10A

Each fuse in the UI has:
- Status indicator: Normal / Suspected / Confirmed Draw
- Current estimated draw label
- Notes field for technician annotations
- Link to the DTC codes associated with that circuit

**D. Step-by-Step Parasitic Draw Protocol**
Guided checklist assistant:
1. [ ] Confirm battery health (voltage ≥ 12.6V resting)
2. [ ] Close all doors, hood, trunk — confirm dome light off
3. [ ] Turn off all accessories
4. [ ] Wait 10–15 minutes for modules to sleep (monitor bus with Module Sleep Watcher)
5. [ ] Check ATRV baseline (should be ≥ 12.4V)
6. [ ] Note which fuse corresponds to observed draw
7. [ ] Pull TBC BATT fuse → observe voltage stabilization
8. [ ] Pull RADIO fuse → observe voltage
9. [ ] Pull IPC fuse → observe voltage
10. [ ] Pull BODY CTRL fuse → observe voltage
11. [ ] Record findings per fuse circuit
12. [ ] If IPC circuit: check IPC connector pins, ground strap at firewall
13. [ ] If RADIO circuit: inspect aftermarket radio ground, harness adapter wiring
14. [ ] If BCM circuit: scan BCM DTCs (requires GM-LAN access)

Each step has Pass/Fail toggle, notes, and timestamp auto-populated.

**E. Known GMT800 Parasitic Draw Knowledge Base**
Built-in reference panel with confirmed Silverado-specific causes:

| Component | Circuit | Typical Draw | Fix |
|---|---|---|---|
| Instrument Panel Cluster (IPC) | TBC BATT / IPC B+ | 0.2A–1.2A | Replace IPC, add firewall ground strap |
| Body Control Module (BCM) | BODY CTRL / TBC BATT | 0.3A–0.8A | BCM replacement, check for LAN communication errors |
| Aftermarket Radio | RADIO 15A | 0.2A–1.5A | Correct harness wiring, dedicated memory wire |
| Dome Light (faulty switch) | TBC BATT | 0.5A+ | Replace door jamb switch |
| Ignition Switch (internal short) | IGN circuit | Variable | Replace ignition switch |
| Bad ground — body/engine | N/A | Causes LAN disruption keeping modules awake | Add/clean ground straps |
| Remote Start Module | Varies | 0.1A–0.5A | Rewire or remove |
| HVAC Blend Door Actuator | HVAC circuit | 0.1A | Replace actuator |

---

### 5.4 DTC SCANNER & CODE LIBRARY
- Read all stored, pending, and permanent DTCs across all accessible modules
- **GM-LAN enhanced codes** (requires OBDLink MX+ SW-CAN passthrough):
  - BCM (Body Control Module) codes
  - IPC (Instrument Panel Cluster) codes
  - TCM (Transmission Control Module) codes
  - ABS / EBCM codes
  - HVAC codes

**Code display fields per DTC:**
- Code (e.g., P0300, B1982, U0100)
- Type badge: Powertrain / Body / Chassis / Network
- Status badge: Active / Pending / Permanent / Historical
- Short description
- Full definition (built-in SAE + GM-specific database)
- Likely cause (top 3)
- Repair procedure summary
- Link to freeze frame captured at time of fault
- Clear button (with confirmation modal)

**Filters & Categories:**
- Filter by: Module, Code Type (P/B/C/U), Status, Severity
- Search by code number or keyword
- Sort by: First Seen, Last Seen, Severity
- Export to PDF/CSV

**2004 Silverado DTC Cross-Reference:**
Pre-loaded with GMT800-common codes including:
- B1982 (IPC power loss), B0429 (seat circuit), U0100 (lost comm with ECM)
- P0446 (EVAP vent), P0300–P0308 (misfire), P0171/P0174 (lean fuel trim)
- C0265 (EBCM relay), U1000 (Class II communication fault)

---

### 5.5 MODULE WAKE MONITOR
Displays all ECU/module activity on the CAN/Class II bus:

- List of all responding module addresses (polled via `01 00` PID support scan + OBD Service $09)
- For each module: last response timestamp, response latency, alive/sleeping status
- "Bus Quiet" detector — alerts when bus goes silent (all modules asleep) → expected behavior
- "Rogue Module" alert — flags any module still responding > 20 minutes after engine-off
- Logs module wake events with timestamps to session file

---

### 5.6 SENSOR EXPLORER / PID BROWSER
Full browser of all 200+ standard OBD-II PIDs:

- **Grouped categories:**
  - Engine Performance
  - Fuel System
  - Air / Emissions
  - Electrical System
  - Sensors (O2, MAF, MAP)
  - Transmission
  - Vehicle Dynamics
  - Diagnostics / Readiness
  - GM Enhanced (GM-LAN)

- For each PID:
  - PID code (hex + decimal)
  - Name and description
  - Unit and value range
  - Formula / calculation
  - Live value (tap to add to dashboard)
  - Supported: Yes / No / Unknown (auto-detected by querying `01 00`, `01 20`, etc.)
  - Sparkline of last 60 seconds

- **Filter bar:** Search by name, filter by category, show only supported PIDs, show only active monitors
- **Add to Dashboard** button on each PID

---

### 5.7 DATA LOGGER
- Toggle recording of any combination of PIDs at configurable intervals (100ms to 5s)
- Session timeline: scrub through recorded data, see all values at any timestamp
- Export formats: CSV, JSON, proprietary `.obdlog` format
- Overlay mode: compare two sessions side-by-side (useful for before/after fuse pulls)
- Auto-annotate: insert a marker event ("Pulled TBC BATT fuse") during recording

---

### 5.8 FREEZE FRAME VIEWER
- List all stored freeze frames per DTC
- Table of all PID values captured at moment of fault
- Compare freeze frame vs. current live values side by side
- Export freeze frame as PDF diagnostic report

---

### 5.9 FUSE MAP REFERENCE (STATIC)
Searchable, full-color interactive fuse panel diagram for the 2004 Silverado 1500:
- Under-Hood Fuse Center
- Instrument Panel Fuse Block
- Tap any fuse to see: amperage, circuit description, components fed, related DTCs
- Notes field per fuse (persisted in local app storage)
- "Suspected" / "Tested" / "Cleared" status badges
- Print-ready PDF export

---

### 5.10 VEHICLE HEALTH SUMMARY
Top-level overview screen (shown on app launch after connection):
- Battery voltage donut gauge (prominent, top-center)
- MIL (Check Engine Light) status — large indicator
- Active DTC count by severity
- Readiness monitors grid (OBD-II I/M readiness): Pass/Fail/Not Ready per monitor
- Last scan timestamp
- Estimated battery health rating (based on resting voltage + voltage drop rate)
- "Parasite Risk Score" — calculated from: module sleep compliance + voltage stability + active BCM/IPC codes

---

## 6. DATA ARCHITECTURE

### PID Polling Engine
- Priority queue: safety-critical PIDs poll at 100ms, standard metrics at 500ms, background scans at 2s
- Adaptive timing: honor ELM327 `ATAT1` adaptive timing, implement custom timeout recovery
- Batch requests: use `01 0C 0D 05 0B` multi-PID requests where supported to reduce bus overhead

### Local Storage
- SQLite database for session history, DTC records, freeze frames, annotations
- UserDefaults for configuration, dashboard layout, vehicle profile

### Session Files
- Auto-save every 60 seconds
- Named by timestamp + vehicle VIN
- Include: all PID data, DTC list, fuse annotations, parasitic draw protocol checklist state

---

## 7. GM-SPECIFIC IMPLEMENTATION NOTES

### SAE J1850 VPW Protocol (2004 Silverado)
The 2004 Silverado uses **SAE J1850 VPW** on the Class II serial data bus for inter-module communication (BCM, IPC, PCM at 10.4 kbps). Key implementation requirements:

- After ELM327 auto-protocol detection, confirm `ATSP1` (J1850 PWM) or `ATSP2` (J1850 VPW) is selected
- OBDLink MX+ supports this natively — confirm with `ATDP` response
- For GM enhanced diagnostics via SW-CAN passthrough: use OBDLink `STPX` command structure

### GMLAN / Class II Access
- Module address map for GMT800:
  - `0x10` — PCM (Powertrain Control Module)
  - `0x28` — BCM (Body Control Module) ← **primary parasitic suspect**
  - `0xE0` — IPC (Instrument Panel Cluster) ← **primary parasitic suspect**
  - `0x60` — TCM (Transmission Control Module)
  - `0x40` — ABS / EBCM
  - `0xA0` — HVAC
  - `0xC0` — Radio / Head Unit ← **if aftermarket, key suspect**

### Known IPC Parasitic Issue — Implementation Flag
When IPC address `0xE0` responds more than 15 minutes after ignition-off:
- Trigger `[!] IPC WAKE DETECTED` banner in Module Wake Monitor
- Auto-append note to Parasitic Draw Protocol step 12
- Recommend checking: IPC connector pins C1, C2 ground integrity; firewall-to-engine ground strap; dome light switch circuit

---

## 8. UX / NAVIGATION

```
┌─────────────────────────────────────────────────────────────┐
│  ◆ SILVERADO DX  [● CONNECTED · J1850 VPW · 12.7V]  ⚡ ⚙   │  ← Header rail
├──────────┬──────────────────────────────────────────────────┤
│          │                                                    │
│  DASH    │   [Main content area — switches per nav item]      │
│  PARASITE│                                                    │
│  DTC     │                                                    │
│  MODULES │                                                    │
│  SENSORS │                                                    │
│  LOGGER  │                                                    │
│  FUSES   │                                                    │
│  HEALTH  │                                                    │
│          │                                                    │
└──────────┴──────────────────────────────────────────────────┘
```

- Left sidebar: icon + label nav, collapsible to icon-only
- Header: always-visible connection status, battery voltage, MIL light, session timer
- Right panel (slide-in): DTC detail, PID detail, alert log
- Bottom status bar: bus protocol, PID poll rate, packets/sec, last error

---

## 9. ALERTS & NOTIFICATIONS

| Condition | Severity | Alert |
|---|---|---|
| Battery voltage < 12.4V | Warning | Amber banner |
| Battery voltage < 12.0V | Critical | Papaya red banner + sound |
| Active DTC detected | Warning | Badge + sidebar pulse |
| Module awake > 15 min post engine-off | Warning | Module Wake Monitor flag |
| Voltage drop > 0.1V in 60 sec (engine off) | Critical | Parasitic Draw alert |
| Bluetooth connection lost | Error | Reconnect overlay |
| IPC/BCM responding post sleep | Info | Diagnostic tip popup |

---

## 10. INSPIRED BY — FEATURES SOURCED FROM COMPARABLE PROJECTS

| Source Project | Feature Borrowed |
|---|---|
| **Torque Pro (Android)** | Configurable gauge dashboard, PID plugin system, DTC with definitions, data logging to CSV |
| **OBDLink App (iOS)** | Enhanced GM-LAN module scanning, sleep mode detection, adapter health panel |
| **OBD Auto Doctor (macOS)** | I/M readiness monitor grid, freeze frame viewer, multi-module DTC scan |
| **AndrOBD (open source)** | Full PID browser with formula display, plugin architecture for extended PIDs |
| **OBDium (open source Rust)** | Offline DTC database, VIN decoder, clean separation of transport/protocol layers |
| **SwiftOBD2 (Swift package)** | CoreBluetooth + RFCOMM bridge pattern for macOS, Combine reactive data pipeline |
| **LTSupportAutomotive (macOS)** | Protocol abstraction layer supporting J1850, ISO14230, CAN; capture file replay |
| **Car Scanner ELM OBD2 (iOS)** | Adaptive dashboard with widget resizing, ECU-specific extended PID profiles |
| **DashCommand (iOS)** | F1-inspired gauge skins, performance measurement tools, dyno-style charts |

---

## 11. TECHNOLOGY STACK OPTIONS

### Option A — Native macOS (Recommended)
```
Language:      Swift 5.9+
UI:            SwiftUI + AppKit (for complex table views)
Bluetooth:     CoreBluetooth (BLE) + IOBluetooth (RFCOMM/Classic)
Serial:        ORSSerialPort for virtual serial port fallback
Data:          Combine framework for reactive PID streams
Storage:       CoreData or SQLite via GRDB.swift
Charts:        Swift Charts (macOS 13+) or Charts library
Fonts:         Bundled Barlow + JetBrains Mono
Build:         Xcode 15+, target macOS 13 Ventura minimum
```

### Option B — Cross-Platform Electron (Faster Prototype)
```
Framework:     Electron 28 + React 18
Language:      TypeScript
BT/Serial:     Node.js `serialport` + `@abandonware/bluetooth-hci-socket`
Charts:        Recharts or Victory
State:         Zustand or Redux Toolkit
Storage:       electron-store + better-sqlite3
Build:         electron-builder for .dmg output
```

---

## 12. TESTING & SIMULATION

- **ELM327 Emulator mode:** Simulate a 2004 Silverado J1850 VPW session with:
  - Battery voltage stepping from 12.6V → 11.8V over 4 hours (simulates drain)
  - IPC staying awake after engine-off (simulates the known GMT800 bug)
  - 3 pre-loaded DTCs: P0300 (misfire), B1982 (IPC power), U0100 (lost comm)
  - Freeze frame data seeded with realistic values

- **Unit tests:** PID formula calculations, DTC parser, ELM327 command builder
- **Integration tests:** Mock Bluetooth serial stream → verify correct PID values decoded

---

## 13. DELIVERABLES

1. **macOS App** (`.app` bundle or `.dmg` installer)
2. **DTC Database** (SQLite, SAE + GM-enhanced codes)
3. **PID Reference File** (JSON, all standard + GM-specific PIDs with formulas)
4. **Fuse Map Data** (JSON, 2004 Silverado UHFRC + IPFB)
5. **Parasitic Draw Protocol Checklist** (exportable PDF template)
6. **User Documentation** (in-app help + PDF quick-start guide)

---

## 14. PHASE BUILD ORDER

```
Phase 1 — Foundation
  ✦ Bluetooth connection manager + ELM327 AT command engine
  ✦ Protocol detection and confirmation (J1850 VPW for Silverado)
  ✦ Core PID polling loop
  ✦ McLaren theme system, nav shell, header bar

Phase 2 — Core Screens
  ✦ Live Dashboard with configurable gauge grid
  ✦ Battery voltage monitor (ATRV)
  ✦ DTC Scanner (standard OBD-II codes)
  ✦ Sensor Explorer / PID Browser

Phase 3 — Silverado-Specific
  ✦ GM-LAN module scanning (BCM, IPC, TCM via SW-CAN)
  ✦ Enhanced GM DTC codes (B and U codes)
  ✦ Fuse Map Reference (2004 Silverado layout)

Phase 4 — Parasitic Draw Suite
  ✦ Battery Voltage Timeline chart
  ✦ Module Wake Monitor
  ✦ Step-by-Step Parasitic Draw Protocol
  ✦ GMT800 Knowledge Base panel
  ✦ Parasite Risk Score

Phase 5 — Pro Features
  ✦ Data Logger with CSV/JSON export
  ✦ Freeze Frame Viewer
  ✦ Session compare / overlay
  ✦ PDF report generation
  ✦ ELM327 simulator mode
```

---

*Document version 1.0 · Generated for 2004 Chevrolet Silverado 1500 Z71 parasitic draw diagnostic project*
