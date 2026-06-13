# Silverado DX — OBD-II Parasitic Draw Diagnostic Suite

**Vehicle:** 2004 Chevrolet Silverado 1500 Z71 (VIN 1GCEK19T04E)  
**Platform:** Electron 31 + React 18 + TypeScript  
**Adapter:** OBDLink MX+ (Bluetooth, ELM327 v1.5, GM-LAN / J1850 VPW)  
**Theme:** McLaren Technology Centre · Papaya + Gulf Blue

---

## Project Structure

```
silverado-dx/
├── src/
│   ├── main/
│   │   ├── main.ts          # Electron main process — window, IPC, serial bridge
│   │   └── preload.ts       # Secure contextBridge IPC API
│   ├── core/
│   │   ├── elm327Commander.ts   # ELM327 AT command engine + initialization sequence
│   │   ├── elm327Simulator.ts   # Offline simulator — 2004 Silverado session
│   │   ├── obdProtocolManager.ts # PID polling loop, DTC scanner, module wake check
│   │   ├── pidCatalog.ts        # All OBD-II PIDs with formulas, ranges, decode functions
│   │   └── vehicleProfile.ts    # 2004 Silverado profile, fuse panel, module map, checklist
│   ├── renderer/
│   │   ├── App.tsx              # Root component — header, sidebar, IPC wiring
│   │   ├── index.tsx            # React DOM entry point
│   │   ├── index.html           # HTML shell
│   │   ├── store/
│   │   │   └── appStore.ts      # Zustand global state — live data, DTCs, session, logs
│   │   ├── theme/
│   │   │   └── theme.ts         # CSS variables, colors, gauge geometry helpers
│   │   ├── components/
│   │   │   └── layout/
│   │   │       └── UIComponents.tsx  # Card, MetricTile, ArcGauge, Badge, Tooltip, etc.
│   │   └── screens/
│   │       ├── LiveScreen.tsx        # Full live telemetry — all OBD metrics
│   │       ├── HealthScreen.tsx      # Vehicle health overview (Phase 3)
│   │       ├── AllPIDsScreen.tsx     # Full PID browser (Phase 3)
│   │       ├── EngineScreen.tsx      # Engine & fuel deep dive (Phase 3)
│   │       ├── ElectricalScreen.tsx  # Battery & charging (Phase 3)
│   │       ├── HVACScreen.tsx        # Heating, ventilation & AC (Phase 3)
│   │       ├── TransmissionScreen.tsx # Transmission (Phase 3)
│   │       ├── DTCScreen.tsx         # Fault codes (Phase 3)
│   │       ├── ModulesScreen.tsx     # Module wake monitor (Phase 4)
│   │       ├── ParasiteScreen.tsx    # Parasitic draw analysis (Phase 4)
│   │       ├── CompareScreen.tsx     # Live vs historic (Phase 5)
│   │       └── LogsScreen.tsx        # Session log (Phase 5)
│   └── shared/
│       └── types.ts            # All shared TypeScript types across main + renderer
├── tsconfig.json               # TypeScript config (renderer)
├── tsconfig.main.json          # TypeScript config (main process)
├── webpack.renderer.js         # Webpack config for React renderer bundle
└── package.json
```

---

## Prerequisites

- **macOS 13 Ventura or later**
- **Node.js 18+** (`node --version`)
- **Xcode Command Line Tools** (`xcode-select --install`) — required for native modules

```bash
# Install all dependencies
npm install

# Install additional native modules (requires Xcode CLT)
npm install serialport better-sqlite3
```

---

## Development

```bash
# Start in development mode (hot reload)
npm run dev
```

This runs three concurrent processes:
1. `tsc --watch` compiles the main process TypeScript
2. `webpack --watch` bundles the renderer (React)
3. `electron .` launches the app (waits for `dist/main/main.js` to exist)

**The app launches in Simulator mode automatically** — no OBD adapter needed for development. The simulator emulates a 2004 Silverado J1850 VPW session with:
- Battery voltage stepping 12.89 V → 11.8 V over 4 hours (simulates parasitic drain)
- Instrument Cluster staying awake after engine-off (reproduces the known GMT800 bug)
- Pre-loaded DTCs: B1982, P0300, U0100
- Realistic noise on all sensor readings

---

## Connecting to the OBDLink MX+

The OBDLink MX+ connects via Bluetooth Classic (RFCOMM). On macOS it appears as a serial port after pairing.

### Step 1 — Pair the adapter
1. Plug the OBDLink MX+ into the vehicle OBD-II port
2. Turn ignition to ON (engine optional)
3. Open **System Settings → Bluetooth**
4. Pair "OBDLink MX+"

### Step 2 — Find the serial port
```bash
ls /dev/tty.* | grep -i obd
# Usually: /dev/tty.OBDII or /dev/tty.OBDLink-MXPlus-Port
```

### Step 3 — Connect in the app
The app currently auto-connects to the simulator. To connect to a real adapter:

```typescript
// In App.tsx, change:
window.electronAPI.connect('SIMULATOR');
// to:
window.electronAPI.connect('/dev/tty.OBDLink-MXPlus-Port');
```

A connection UI screen (with port selection and RSSI display) is on the Phase 3 roadmap.

---

## ELM327 Initialization Sequence

The app sends the following AT commands on connection (see `elm327Commander.ts`):

```
ATZ      → Reset adapter, clear all state
ATE0     → Echo off
ATL0     → Linefeed off
ATH0     → Headers off
ATS0     → Spaces off
ATSP0    → Auto protocol detection
ATAT1    → Adaptive timing level 1
010C     → Protocol ping — forces J1850 VPW lock for the Silverado
ATDP     → Read negotiated protocol
STI      → OBDLink firmware version
STDI     → OBDLink device info
ATRV     → Live battery voltage
```

---

## PID Polling Architecture

PIDs are polled in three priority tiers:

| Tier   | Interval | PIDs |
|--------|----------|------|
| Fast   | 100 ms   | Engine RPM (010C), ECM voltage (0142), battery voltage (ATRV) |
| Normal | 500 ms   | Speed, coolant, throttle, load, fuel trims, MAF, O2 sensors |
| Slow   | 2000 ms  | Fuel level, oil temp, fuel rail pressure, EGR, EVAP, gear |

All PIDs use the SAE J1979 decode formulas defined in `pidCatalog.ts`.

---

## Building a macOS .dmg

```bash
npm run dist
```

Output: `dist/Silverado DX-1.0.0.dmg`

---

## Phase Roadmap

```
Phase 1 ✅  Foundation — ELM327 engine, PID polling, simulator, theme, store
Phase 2 ✅  Core screens — Live telemetry with all OBD metrics
Phase 3 🔜  All remaining screens — Health, PID browser, Engine, Electrical, HVAC, Trans, DTC, Modules
Phase 4 🔜  Parasitic draw suite — Module wake monitor, voltage timeline, draw protocol, risk score
Phase 5 🔜  Pro features — Data logger, freeze frame viewer, PDF reports, session compare
```
