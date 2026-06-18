// ─── OBD-II Protocol Types ────────────────────────────────────────────────────

export type OBDProtocol =
  | 'AUTO'
  | 'SAE_J1850_PWM'
  | 'SAE_J1850_VPW'    // 2004 Silverado — GM Class II
  | 'ISO_9141_2'
  | 'ISO_14230_4_KWP'
  | 'ISO_15765_4_CAN_11_500'
  | 'ISO_15765_4_CAN_29_500'
  | 'ISO_15765_4_CAN_11_250'
  | 'ISO_15765_4_CAN_29_250'
  | 'SAE_J1939_CAN'
  | 'USER_1_CAN'
  | 'USER_2_CAN';

export type ConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'initializing'
  | 'connected'
  | 'error';

// ─── PID Definitions ──────────────────────────────────────────────────────────

export interface PIDDefinition {
  pid: string;           // hex e.g. '010C'
  name: string;          // human-readable full name
  shortName: string;     // short label for gauges
  category: PIDCategory;
  unit: string;
  min: number;
  max: number;
  formula: string;       // human-readable formula
  description: string;
  decode: (bytes: number[]) => number | string;
  format: (value: number | string) => string;
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
}

export type PIDCategory =
  | 'engine'
  | 'fuel'
  | 'temperature'
  | 'electrical'
  | 'oxygen_sensors'
  | 'transmission'
  | 'emissions'
  | 'body_network'
  | 'gm_enhanced';

// ─── Live Data ────────────────────────────────────────────────────────────────

export interface PIDReading {
  pid: string;
  value: number | string;
  raw: number[];
  timestamp: number;     // Date.now()
  unit: string;
}

export interface LiveData {
  [pid: string]: PIDReading;
}

// ─── DTC Fault Codes ──────────────────────────────────────────────────────────

export type DTCType = 'P' | 'B' | 'C' | 'U';
export type DTCStatus = 'active' | 'pending' | 'permanent' | 'historical';

export interface DTCCode {
  code: string;         // e.g. 'B1982'
  type: DTCType;
  status: DTCStatus;
  description: string;
  likelyCauses: string[];
  repairSummary: string;
  module: string;       // e.g. 'IPC', 'PCM', 'BCM'
  firstSeen: number;
  lastSeen: number;
}

// ─── Module Wake Monitor ──────────────────────────────────────────────────────

export type ModuleStatus = 'alive' | 'sleeping' | 'rogue' | 'suspect' | 'unknown';

export interface ModuleState {
  address: string;      // hex e.g. '0xE0'
  name: string;
  status: ModuleStatus;
  lastResponseMs: number;
  latencyMs: number;
  minutesAwakePostEngineOff: number;
  busActivity: number[];  // recent activity samples for waveform
}

// ─── Session & Logging ────────────────────────────────────────────────────────

export type LogLevel = 'ok' | 'info' | 'warn' | 'error' | 'otel';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  pid?: string;
  value?: number | string;
}

export interface SessionMarker {
  timestamp: number;
  label: string;
}

export interface SessionData {
  id: string;
  vin: string;
  vehicleName: string;
  startTime: number;
  endTime?: number;
  protocol: OBDProtocol;
  readings: PIDReading[];
  dtcs: DTCCode[];
  markers: SessionMarker[];
  log: LogEntry[];
}

// ─── Vehicle Profile ──────────────────────────────────────────────────────────

export interface VehicleProfile {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmission: string;
  platform: string;     // e.g. 'GMT800'
  protocol: OBDProtocol;
  supportedPIDs: string[];
}

// ─── Parasitic Draw ───────────────────────────────────────────────────────────

export type FuseStatus = 'normal' | 'suspect' | 'confirmed' | 'tested_ok' | 'unknown';

export interface FuseCircuit {
  id: string;
  name: string;
  amperage: number;
  panel: 'IPFB' | 'UHFRC';   // Instrument Panel Fuse Block | Under-Hood Fuse/Relay Center
  feeds: string[];
  status: FuseStatus;
  estimatedDrawAmps?: number;
  notes: string;
  relatedDTCs: string[];
  relatedModules: string[];
}

export interface ParasiticChecklistItem {
  id: string;
  step: number;
  description: string;
  completed: boolean;
  passed?: boolean;
  notes: string;
  timestamp?: number;
}

export interface ParasiticDrawState {
  riskScore: number;            // 0–10
  voltageDriftMvPerMin: number;
  rogueModules: string[];
  suspectFuses: string[];
  confirmedFuses: string[];
  checklist: ParasiticChecklistItem[];
}

// ─── EcuBus-Pro Integration ───────────────────────────────────────────────────

export type CANBusType = 'CAN' | 'CAN-FD';
export type CANDirection = 'TX' | 'RX';

export interface CANFrame {
  id: number;
  idHex: string;
  dlc: number;
  data: number[];
  dataHex: string;
  timestamp: number;
  delta: number;
  channel: number;
  direction: CANDirection;
  busType: CANBusType;
  isExtended: boolean;
  count: number;
}

export type UDSServiceId =
  | 0x10 | 0x11 | 0x14 | 0x19 | 0x22 | 0x23 | 0x24
  | 0x27 | 0x28 | 0x2E | 0x2F | 0x31 | 0x34 | 0x35
  | 0x36 | 0x37 | 0x3D | 0x3E | 0x85 | 0x87;

export interface UDSService {
  sid: number;
  name: string;
  shortName: string;
  description: string;
  subFunctions?: { id: number; name: string }[];
}

export interface UDSRequest {
  id: string;
  timestamp: number;
  txId: number;
  rxId: number;
  serviceId: number;
  serviceName: string;
  subFunction?: number;
  payload: number[];
  payloadHex: string;
  rawRequest: string;
}

export interface UDSResponse {
  id: string;
  requestId: string;
  timestamp: number;
  positive: boolean;
  serviceId: number;
  data: number[];
  dataHex: string;
  rawResponse: string;
  nrc?: number;
  nrcName?: string;
}

export interface CANSignal {
  name: string;
  messageId: number;
  messageName: string;
  startBit: number;
  length: number;
  byteOrder: 'little_endian' | 'big_endian';
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  value: number;
  rawValue: number;
  timestamp: number;
}

export interface LINFrame {
  id: number;
  idHex: string;
  dlc: number;
  data: number[];
  dataHex: string;
  timestamp: number;
  direction: 'master' | 'slave';
  checksum: number;
  checksumType: 'classic' | 'enhanced';
  error?: string;
}

export interface DoIPEntity {
  ip: string;
  port: number;
  logicalAddress: number;
  eid: string;
  gid: string;
  vin: string;
  entityType: 'gateway' | 'node';
  status: 'online' | 'offline' | 'busy';
}

export interface EcuBusScript {
  id: string;
  name: string;
  code: string;
  language: 'typescript' | 'capl';
  lastRun?: number;
  status: 'idle' | 'running' | 'error' | 'success';
  output: string[];
}

export type EcuBusSubTab = 'can' | 'uds' | 'transmit' | 'signals' | 'script' | 'lin' | 'doip';

// ─── IPC (Electron Inter-Process Communication) ───────────────────────────────

export interface IPCChannels {
  // Renderer → Main
  'obd:connect': { port: string };
  'obd:disconnect': void;
  'obd:send-command': { command: string };
  'obd:start-polling': { pids: string[]; intervalMs: number };
  'obd:stop-polling': void;
  'obd:scan-dtc': void;
  'obd:clear-dtc': void;
  'session:export-csv': { sessionId: string };
  'session:export-log': { sessionId: string };

  // Main → Renderer
  'obd:pid-reading': PIDReading;
  'obd:dtc-result': DTCCode[];
  'obd:module-state': ModuleState;
  'obd:connection-status': { status: ConnectionStatus; protocol?: OBDProtocol; adapterInfo?: string };
  'obd:error': { message: string };
  'session:log-entry': LogEntry;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface StorageConfig {
  backend: 'local' | 'sqlite';
}

export interface SnapshotPID {
  value: number | string;
  timestamp: number;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  savedAt: number;
  vehicleName: string;
  liveData: Record<string, SnapshotPID>;
  voltageHistory: number[];
  dtcs: Array<{ code: string; description: string; status: string; module: string }>;
  sessionStartMs: number | null;
}

export interface DataRecording {
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

export interface FreezeFrame {
  id: string;
  dtcCode: string;
  capturedAt: number;
  vehicleName: string;
  liveData: Record<string, SnapshotPID>;
}

export interface StorageInfo {
  localPath: string;
  sqlitePath: string;
  localSizeBytes: number;
  sqliteSizeBytes: number;
  counts: { snapshots: number; recordings: number; freezeFrames: number };
}

export interface ReportPayload {
  vehicle: { nickname: string; year: string; make: string; model: string; engine: string; vin: string; notes: string };
  batteryVoltage: number;
  voltageHistory: number[];
  milOn: boolean;
  dtcs: DTCCode[];
  modules: ModuleState[];
  checklist: ParasiticChecklistItem[];
  freezeFrames: FreezeFrame[];
  log: LogEntry[];
  reportDate: number;
  adapterInfo: string;
  protocol: string;
  appVersion: string;
}
