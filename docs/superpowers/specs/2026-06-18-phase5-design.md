# Silverado DX — Phase 5 Design Spec

**Date:** 2026-06-18  
**Project:** Silverado DX — OBD-II Parasitic Draw Diagnostic Suite  
**Vehicle:** 2004 Chevrolet Silverado 1500 Z71  
**Scope:** Phase 5 — Pro Features (CompareScreen, Data Logger, Freeze Frame Viewer, PDF Report)

---

## 1. Overview

Phase 5 completes the Silverado DX feature set with four pro-grade screens built on a unified storage layer. All features are implemented in order:

1. CompareScreen — live vs. saved snapshot comparison
2. Data Logger — PID recording with CSV/JSON export
3. Freeze Frame Viewer — DTC-linked PID snapshots
4. PDF Report — exportable diagnostic summary

---

## 2. Storage Layer

### 2.1 Architecture

All persistence lives in the main process as a `StorageService` class (`src/main/storageService.ts`). The renderer never touches files or SQLite directly — it communicates exclusively via IPC channels (`window.api.storage.*`), following the same pattern as `window.api.claude.*`.

### 2.2 Backends

**LocalBackend** — `electron-store` writing to `~/.config/silverado-dx/storage.json`. Zero setup, fast, suitable for small datasets.

**SQLiteBackend** — `better-sqlite3` with three tables:
- `snapshots` — session snapshot records
- `recordings` — data logger recordings (samples as JSON blob in Local mode, rows in SQLite mode)
- `freeze_frames` — DTC-linked PID captures

The active backend is determined by a persisted config flag: `storage.backend: 'local' | 'sqlite'`.

### 2.3 Backend Switching & Migration

Switching backends triggers a one-way migration: existing data is copied to the new backend, the old file is kept as a backup. Migration runs in the main process; the renderer shows a spinner until it completes.

### 2.4 StorageService Interface

```typescript
// Snapshots
saveSnapshot(snap: SessionSnapshot): string        // returns id
getSnapshots(): SessionSnapshot[]
deleteSnapshot(id: string): void

// Recordings
saveRecording(rec: DataRecording): string
getRecordings(): DataRecording[]
deleteRecording(id: string): void

// Freeze frames
saveFreezeFrame(ff: FreezeFrame): string
getFreezeFrames(dtcCode?: string): FreezeFrame[]
deleteFreezeFrame(id: string): void

// Config
getConfig(): StorageConfig
setConfig(updates: Partial<StorageConfig>): void
```

### 2.5 IPC Channels

Registered in `main.ts`, exposed via preload `contextBridge` as `window.api.storage.*`:

```
storage:get-config / storage:set-config
storage:save-snapshot / storage:get-snapshots / storage:delete-snapshot
storage:save-recording / storage:get-recordings / storage:delete-recording
storage:save-freeze-frame / storage:get-freeze-frames / storage:delete-freeze-frame
```

### 2.6 Data Types

```typescript
interface SessionSnapshot {
  id: string;
  name: string;
  savedAt: number;
  vehicleName: string;
  liveData: Record<string, { value: number | string; timestamp: number }>;
  voltageHistory: number[];      // last 120 ATRV samples (values only)
  dtcs: Array<{ code: string; description: string; status: string; module: string }>;
  sessionStartMs: number | null;
}

interface DataRecording {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  sampleIntervalMs: number;
  pids: string[];
  sampleCount: number;
  markers: Array<{ timestamp: number; label: string }>;
  samples: Array<{ timestamp: number; values: Record<string, number | string> }>;
}

interface FreezeFrame {
  id: string;
  dtcCode: string;
  capturedAt: number;
  vehicleName: string;
  liveData: Record<string, { value: number | string; timestamp: number }>;
}

interface StorageConfig {
  backend: 'local' | 'sqlite';
}
```

---

## 3. Settings Screen

### 3.1 Placement

New `SettingsScreen` added to sidebar bottom (icon: `ti-settings`, label: "Settings"), below Logs.

### 3.2 Storage Section

Two-option radio toggle: **Local** / **SQLite**.

- *Local selected:* shows JSON file path and file size
- *SQLite selected:* shows DB file path, DB size, and table row counts

On toggle change: confirmation dialog — "Migrate existing data to [SQLite / Local]? Your current data will be copied over." Confirming triggers migration in main process with a spinner. Old file kept as backup.

"**Open data folder**" button calls `shell.openPath()` to reveal the storage directory in Finder.

### 3.3 About Section

App version, Electron version, current adapter info, "Check for updates" stub button (no-op).

---

## 4. CompareScreen

### 4.1 Placement

Existing stub at `src/renderer/screens/CompareScreen.tsx`. Sidebar position unchanged (Records group).

### 4.2 Snapshot Capture

Toolbar: name input + "Save Snapshot" button. Captures: `liveData`, last 120 voltage history points, DTCs, vehicle profile, timestamp. Calls `window.api.storage.saveSnapshot()`. Cap: 10 snapshots; oldest dropped when full (with warning toast).

### 4.3 Snapshot List

Selectable list. Each row: name, date/time, vehicle, DTC count. Trash icon to delete. Selected item: orange left-border highlight.

### 4.4 Comparison View

Visible when a snapshot is selected:

**Session header cards** — Snapshot metadata (Gulf Blue accent) | Live status (Papaya accent), side-by-side.

**Voltage overlay chart** — Single SVG, two polylines: snapshot (Gulf Blue dashed), live (Papaya solid). Reference lines at 12.6 / 12.4 / 12.0 V. Legend below.

**PID comparison table** — 12 key PIDs:

| PID | Label |
|-----|-------|
| ATRV | Battery Voltage |
| 010C | Engine RPM |
| 0104 | Engine Load |
| 0105 | Coolant Temp |
| 0110 | MAF |
| 010B | MAP |
| 0111 | Throttle Pos |
| 0106 | STFT Bank 1 |
| 0107 | LTFT Bank 1 |
| 0108 | STFT Bank 2 |
| 0109 | LTFT Bank 2 |
| 012F | Fuel Level |

Columns: Parameter | Snapshot | Live | Δ. Delta color-coded: green (improved), amber (minor), red (significant degradation). Thresholds: fuel trims >2% = amber, >5% = red; voltage drop >0.05 V = amber, >0.1 V = red.

**DTC diff panel** — Three sub-sections: "New since snapshot" (red, + icon) / "Resolved since snapshot" (green, ✓ icon) / "Present in both" (muted, − icon).

---

## 5. Data Logger

### 5.1 Placement

New `DataLoggerScreen` (`src/renderer/screens/DataLoggerScreen.tsx`). Sidebar: icon `ti-activity`, label "Logger", positioned between AllPIDs and Compare.

### 5.2 Recording Controls

- **PID selector** — multi-select dropdown, defaults to the 12 key PIDs. Full supported PID list available.
- **Sample interval** — segmented control: 100ms / 500ms / 1s / 5s
- **Record button** — red while recording, grey while idle
- **Label field** — type a note + Enter to insert a timestamped marker mid-recording

### 5.3 Active Recording State

Status bar: `● REC  00:04:23  1,840 samples  12.4 V`

Live sparkline per selected PID while recording.

### 5.4 Recordings List

Each row: name/timestamp, duration, sample count, PID count, file size.  
Actions per row: **Export CSV** / **Export JSON** / **Delete**.

CSV format: `timestamp_ms` + one column per PID.  
JSON format: `{ meta: {...}, pids: [...], markers: [...], samples: [...] }`.

Cap: 10 recordings. Oldest dropped when full (with warning toast).

### 5.5 Storage Mode Difference

- *Local:* each recording stored as a JSON blob in electron-store
- *SQLite:* samples stored as individual rows — enables future in-app scrubbing and querying

---

## 6. Freeze Frame Viewer

### 6.1 Auto-Capture

Triggered in the renderer by a Zustand store subscription on `dtcs`. When the `dtcs` array gains a code not previously seen in this session, the renderer immediately captures all current `liveData` and calls `window.api.storage.saveFreezeFrame()`. One freeze frame per DTC code; if the same code fires again, the existing freeze frame is updated (not duplicated). No user action required.

### 6.2 DTCScreen Integration

Each DTC row gains a "Freeze Frame" button (icon: `ti-camera`). Active if a freeze frame exists for that code → navigates to FreezeFrameScreen filtered to that code. Dimmed with tooltip "No freeze frame captured yet" if none exists.

### 6.3 FreezeFrameScreen

New screen (`src/renderer/screens/FreezeFrameScreen.tsx`). Sidebar: icon `ti-camera`, label "Freeze Frames", grouped under Records with Compare and Logs.

**Selector:** All captured freeze frames grouped by DTC code (e.g., `B1982 — IPC — 2026-06-14 11:32`).

**Comparison table:**

- "At fault time" column (Gulf Blue) — PID values from freeze frame
- "Live now" column (Papaya) — current `liveData`
- Delta column, same color coding as CompareScreen
- Battery voltage given a hero row at the top

**Footer:** Export CSV button, Delete button.

---

## 7. PDF Report

### 7.1 Mechanism

Uses Electron's built-in `webContents.printToPDF()` — no external PDF library required. Flow:

1. Renderer serializes app state into `ReportPayload` and sends via `report:generate` IPC
2. Main opens a hidden `BrowserWindow` loading `report.html` (bundled with app)
3. Main injects `ReportPayload` as a JSON data attribute
4. Page renders; main calls `printToPDF()`
5. File saved to `~/Documents/SilveradoDX/`
6. `shell.openPath()` opens it in Preview

### 7.2 Trigger

"Export Report" button in HealthScreen header. Also available in Settings screen as "Generate Report."

### 7.3 Report Contents

| Page | Content |
|------|---------|
| 1 — Cover | Vehicle info (year/make/model/VIN), report date, connection info, app version |
| 2 — Health Summary | Battery voltage gauge, MIL status, active DTC count, I/M readiness grid (if available — omitted if no readiness monitor data in current session) |
| 3 — Fault Codes | DTC table: code, module, description, first seen, status |
| 4 — Freeze Frames | One sub-table per freeze frame: PID values at fault time |
| 5 — Voltage Timeline | Voltage history chart as inline SVG |
| 6 — Parasitic Draw Checklist | 14-step protocol: pass/fail/notes per step |
| 7 — Session Log | Last 100 log entries (error + warn only) |

### 7.4 Styling

White background, black text, orange/blue accents for headers. System fonts only (no network requests from the hidden window).

---

## 8. Navigation Changes

| Screen | Sidebar Label | Icon | Group | Position |
|--------|--------------|------|-------|----------|
| SettingsScreen (new) | Settings | ti-settings | — | Bottom, below Logs |
| DataLoggerScreen (new) | Logger | ti-activity | Analysis | After AllPIDs |
| FreezeFrameScreen (new) | Freeze Frames | ti-camera | Records | After Compare |

`ScreenId` union in `appStore.ts` gains: `'logger' | 'freezeframes' | 'settings'`.

---

## 9. Implementation Order

1. `StorageService` + IPC registration + preload bridge
2. SettingsScreen (storage toggle, migration)
3. CompareScreen (replace stub, backed by StorageService)
4. DataLoggerScreen
5. FreezeFrameScreen + DTCScreen integration
6. PDF report (`report.html` template + `report:generate` IPC handler)
