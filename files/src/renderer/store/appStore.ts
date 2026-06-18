import { create } from 'zustand';
import {
  ConnectionStatus, PIDReading, DTCCode, ModuleState,
  LogEntry, SessionMarker, FuseCircuit, ParasiticChecklistItem,
  CANFrame, UDSRequest, UDSResponse, CANSignal, LINFrame,
  DoIPEntity, EcuBusScript, EcuBusSubTab,
} from '../../shared/types';
import { resolvePlatform, PlatformProfile } from '../../core/platforms';

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppState {
  // Connection
  connectionStatus: ConnectionStatus;
  protocol: string;
  adapterInfo: string;
  sessionStartMs: number | null;

  // Live data — keyed by PID string
  liveData: Record<string, PIDReading>;

  // Historical data — keyed by PID, array of readings for charts
  history: Record<string, PIDReading[]>;
  historyMaxPoints: number;

  // Diagnostic fault codes
  dtcs: DTCCode[];

  // Module wake monitor
  modules: ModuleState[];

  // Fuse circuits
  ipfbFuses: FuseCircuit[];
  uhfrcFuses: FuseCircuit[];

  // Parasitic draw protocol checklist
  checklist: ParasiticChecklistItem[];

  // Session log
  log: LogEntry[];
  markers: SessionMarker[];

  // EcuBus-Pro state
  ecubus: {
    activeSubTab: EcuBusSubTab;
    canFrames: CANFrame[];
    canPaused: boolean;
    canFilter: string;
    udsRequests: UDSRequest[];
    udsResponses: UDSResponse[];
    udsTxId: string;
    udsRxId: string;
    signals: CANSignal[];
    linFrames: LINFrame[];
    doipEntities: DoIPEntity[];
    scripts: EcuBusScript[];
    busLoad: number;
    errorFrameCount: number;
    messageRate: number;
  };
  setEcuBusSubTab: (tab: EcuBusSubTab) => void;
  addCANFrame: (frame: CANFrame) => void;
  toggleCANPause: () => void;
  setCANFilter: (filter: string) => void;
  addUDSExchange: (req: UDSRequest, res: UDSResponse) => void;
  clearCANFrames: () => void;
  addEcuBusScript: (script: EcuBusScript) => void;
  updateEcuBusScript: (id: string, updates: Partial<EcuBusScript>) => void;

  // UI state
  activeScreen: ScreenId;
  isDarkMode: boolean;

  // Claude assistant chat (persists across screen switches)
  chatMessages: ChatMessage[];
  addChatMessage: (m: ChatMessage) => void;
  replaceLastAssistantMessage: (m: ChatMessage) => void;
  removeLastMessage: () => void;
  clearChat: () => void;

  // Vehicle profile (persisted to localStorage)
  vehicle: VehicleProfile;
  setVehicle: (v: VehicleProfile) => void;

  // Platform reference data resolved from the vehicle (fuse maps, module maps,
  // parasitic checklist). Falls back to a generic OBD-II profile.
  platform: PlatformProfile;

  // Bluetooth signal
  btRSSI: number | null;
  btDistance: number | null;
  setBtRSSI: (rssi: number | null) => void;

  // Freeze frame filter (set by DTC screen to pre-filter freeze frame viewer)
  freezeFrameFilter: string | null;
  setFreezeFrameFilter: (code: string | null) => void;

  // Actions
  setConnectionStatus: (status: ConnectionStatus, protocol?: string, adapterInfo?: string) => void;
  updatePIDReading: (reading: PIDReading) => void;
  setDTCs: (dtcs: DTCCode[]) => void;
  updateModule: (module: ModuleState) => void;
  updateFuse: (id: string, updates: Partial<FuseCircuit>) => void;
  toggleChecklistItem: (id: string, passed: boolean, notes?: string) => void;
  addLogEntry: (entry: LogEntry) => void;
  addMarker: (label: string) => void;
  setActiveScreen: (screen: ScreenId) => void;
  toggleDarkMode: () => void;
  exportCSV: () => string;
  exportLog: () => string;
}

export type ScreenId =
  | 'connect'
  | 'assistant'
  | 'health'
  | 'live'
  | 'allpids'
  | 'engine'
  | 'electrical'
  | 'hvac'
  | 'transmission'
  | 'dtc'
  | 'modules'
  | 'parasite'
  | 'compare'
  | 'logs'
  | 'ecubus'
  | 'logger'
  | 'freezeframes'
  | 'settings';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
  model?: string;                                   // which model produced an assistant reply
  usage?: { input_tokens: number; output_tokens: number };
}

// ─── Vehicle profile ──────────────────────────────────────────────────────────
// The app is vehicle-agnostic: the user describes whatever they plug into.
// Persisted in localStorage so it survives restarts.

export interface VehicleProfile {
  nickname: string;   // e.g. "Daily driver"
  year: string;
  make: string;
  model: string;
  engine: string;     // e.g. "5.3L V8"
  vin: string;
  notes: string;      // known issues, mission, mods — fed to the Claude assistant
}

export const EMPTY_VEHICLE: VehicleProfile = {
  nickname: '', year: '', make: '', model: '', engine: '', vin: '', notes: '',
};

function loadVehicle(): VehicleProfile {
  try {
    const raw = localStorage.getItem('vehicleProfile');
    if (raw) return { ...EMPTY_VEHICLE, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { ...EMPTY_VEHICLE };
}

/** One-line display name, e.g. "2004 Chevrolet Silverado 1500" or a fallback. */
export function vehicleDisplayName(v: VehicleProfile): string {
  const name = [v.year, v.make, v.model].filter(Boolean).join(' ');
  return name || v.nickname || 'No vehicle set';
}

// ─── Store ────────────────────────────────────────────────────────────────────

const initialVehicle  = loadVehicle();
const initialPlatform = resolvePlatform(initialVehicle);

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  connectionStatus: 'disconnected',
  protocol: '',
  adapterInfo: '',
  sessionStartMs: null,
  liveData: {},
  history: {},
  historyMaxPoints: 500,  // ~4 minutes at 500ms polling
  dtcs: [],
  modules: [],
  platform: initialPlatform,
  ipfbFuses: initialPlatform.ipfbFuses,
  uhfrcFuses: initialPlatform.uhfrcFuses,
  checklist: initialPlatform.parasiticChecklist.map(t => ({ ...t, completed: false, notes: '' })),
  log: [],
  markers: [],
  ecubus: {
    activeSubTab: 'can',
    canFrames: [],
    canPaused: false,
    canFilter: '',
    udsRequests: [],
    udsResponses: [],
    udsTxId: '0x7E0',
    udsRxId: '0x7E8',
    signals: [],
    linFrames: [],
    doipEntities: [],
    scripts: [{
      id: 'default',
      name: 'example.ts',
      code: `// EcuBus-Pro TypeScript scripting\n// CAPL-like syntax for CAN/UDS automation\n\nimport { CAN, UDS, DiagRequest } from 'ecubus';\n\nasync function main() {\n  // Read DID F190 (VIN)\n  const vin = await UDS.readDataByIdentifier(0xF190);\n  console.log('VIN:', vin.toString());\n\n  // Send a CAN frame\n  CAN.send({ id: 0x7E0, data: [0x02, 0x01, 0x00] });\n\n  // Listen for CAN frames\n  CAN.on('message', (frame) => {\n    if (frame.id === 0x7E8) {\n      console.log('ECU response:', frame.dataHex);\n    }\n  });\n}\n\nmain();`,
      language: 'typescript',
      status: 'idle',
      output: [],
    }],
    busLoad: 0,
    errorFrameCount: 0,
    messageRate: 0,
  },
  activeScreen: 'connect',
  isDarkMode: true,
  chatMessages: [],
  btRSSI: null,
  btDistance: null,
  freezeFrameFilter: null,

  addChatMessage: (m) => set((state) => ({ chatMessages: [...state.chatMessages, m] })),
  replaceLastAssistantMessage: (m) => set((state) => {
    const lastAssistantIdx = [...state.chatMessages].reverse().findIndex(x => x.role === 'assistant' || x.role === 'error');
    if (lastAssistantIdx < 0) return { chatMessages: [...state.chatMessages, m] };
    const realIdx = state.chatMessages.length - 1 - lastAssistantIdx;
    const next = [...state.chatMessages];
    next[realIdx] = m;
    return { chatMessages: next };
  }),
  removeLastMessage: () => set((state) => ({ chatMessages: state.chatMessages.slice(0, -1) })),
  clearChat: () => set({ chatMessages: [] }),

  vehicle: initialVehicle,
  setVehicle: (v) => {
    localStorage.setItem('vehicleProfile', JSON.stringify(v));
    const platform = resolvePlatform(v);
    set((state) => {
      // Re-seed platform reference data only when the platform actually changed,
      // so in-progress fuse statuses and checklist notes survive profile edits.
      if (platform.id === state.platform.id) return { vehicle: v };
      return {
        vehicle: v,
        platform,
        ipfbFuses: platform.ipfbFuses,
        uhfrcFuses: platform.uhfrcFuses,
        checklist: platform.parasiticChecklist.map(t => ({ ...t, completed: false, notes: '' })),
        modules: [],
      };
    });
  },

  // ── Actions ──────────────────────────────────────────────────────────────────

  setConnectionStatus: (status, protocol = '', adapterInfo = '') => {
    set({
      connectionStatus: status,
      protocol,
      adapterInfo,
      sessionStartMs: status === 'connected' ? Date.now() : null,
    });
  },

  updatePIDReading: (reading) => {
    set((state) => {
      const prev = state.liveData[reading.pid];
      const valueChanged = !prev || prev.value !== reading.value;

      if (!valueChanged) {
        // Timestamp-only change — update the entry in-place without cloning the
        // entire liveData map. History doesn't need a new point either.
        prev.timestamp = reading.timestamp;
        return {};
      }

      // Append to history ring buffer
      const prevHistory = state.history[reading.pid] ?? [];
      const newHistory = prevHistory.length >= state.historyMaxPoints
        ? [...prevHistory.slice(1), reading]
        : [...prevHistory, reading];

      return {
        liveData: { ...state.liveData, [reading.pid]: reading },
        history: { ...state.history, [reading.pid]: newHistory },
      };
    });
  },

  setDTCs: (dtcs) => set({ dtcs }),

  updateModule: (module) => {
    set((state) => {
      const modules = state.modules.map(m =>
        m.address === module.address ? { ...m, ...module } : m
      );
      // If not found, add it
      if (!state.modules.find(m => m.address === module.address)) {
        modules.push(module);
      }
      return { modules };
    });
  },

  updateFuse: (id, updates) => {
    set((state) => ({
      ipfbFuses: state.ipfbFuses.map(f => f.id === id ? { ...f, ...updates } : f),
      uhfrcFuses: state.uhfrcFuses.map(f => f.id === id ? { ...f, ...updates } : f),
    }));
  },

  toggleChecklistItem: (id, passed, notes = '') => {
    set((state) => ({
      checklist: state.checklist.map(item =>
        item.id === id
          ? { ...item, completed: true, passed, notes, timestamp: Date.now() }
          : item
      ),
    }));
  },

  addLogEntry: (entry) => {
    set((state) => ({ log: [entry, ...state.log].slice(0, 1000) }));
  },

  addMarker: (label) => {
    const marker: SessionMarker = { timestamp: Date.now(), label };
    set((state) => ({ markers: [...state.markers, marker] }));
    get().addLogEntry({ timestamp: Date.now(), level: 'info', message: `Marker: ${label}` });
  },

  setEcuBusSubTab: (tab) => set((s) => ({ ecubus: { ...s.ecubus, activeSubTab: tab } })),
  addCANFrame: (frame) => set((s) => ({
    ecubus: {
      ...s.ecubus,
      canFrames: s.ecubus.canPaused ? s.ecubus.canFrames : [...s.ecubus.canFrames.slice(-999), frame],
    },
  })),
  toggleCANPause: () => set((s) => ({ ecubus: { ...s.ecubus, canPaused: !s.ecubus.canPaused } })),
  setCANFilter: (filter) => set((s) => ({ ecubus: { ...s.ecubus, canFilter: filter } })),
  addUDSExchange: (req, res) => set((s) => ({
    ecubus: {
      ...s.ecubus,
      udsRequests: [...s.ecubus.udsRequests.slice(-199), req],
      udsResponses: [...s.ecubus.udsResponses.slice(-199), res],
    },
  })),
  clearCANFrames: () => set((s) => ({ ecubus: { ...s.ecubus, canFrames: [] } })),
  addEcuBusScript: (script) => set((s) => ({ ecubus: { ...s.ecubus, scripts: [...s.ecubus.scripts, script] } })),
  updateEcuBusScript: (id, updates) => set((s) => ({
    ecubus: {
      ...s.ecubus,
      scripts: s.ecubus.scripts.map(sc => sc.id === id ? { ...sc, ...updates } : sc),
    },
  })),

  setActiveScreen: (screen) => set({ activeScreen: screen }),

  setBtRSSI: (rssi) => {
    if (rssi === null) { set({ btRSSI: null, btDistance: null }); return; }
    const txPower = -59;
    const n = 2.5;
    const distance = Math.pow(10, (txPower - rssi) / (10 * n));
    set({ btRSSI: rssi, btDistance: Math.round(distance * 10) / 10 });
  },

  setFreezeFrameFilter: (code) => set({ freezeFrameFilter: code }),

  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),

  // ── Export helpers ───────────────────────────────────────────────────────────

  exportCSV: () => {
    const { history } = get();
    const allPIDs = Object.keys(history);
    if (allPIDs.length === 0) return '';

    // Build a unified time series
    const allReadings: PIDReading[] = allPIDs.flatMap(pid => history[pid]);
    allReadings.sort((a, b) => a.timestamp - b.timestamp);

    const header = ['timestamp', 'pid', 'value', 'unit'].join(',');
    const rows = allReadings.map(r => [
      new Date(r.timestamp).toISOString(),
      r.pid,
      r.value,
      r.unit,
    ].join(','));

    return [header, ...rows].join('\n');
  },

  exportLog: () => {
    const { log } = get();
    return log.map(e =>
      `${new Date(e.timestamp).toISOString()}\t${e.level.toUpperCase().padEnd(5)}\t${e.message}`
    ).join('\n');
  },
}));

// ─── Computed selectors ───────────────────────────────────────────────────────

export const selectBatteryVoltage = (s: AppState): number => {
  const atrv = s.liveData['ATRV'];
  return typeof atrv?.value === 'number' ? atrv.value : 0;
};

export const selectRPM = (s: AppState): number => {
  const r = s.liveData['010C'];
  return typeof r?.value === 'number' ? r.value : 0;
};

export const selectActiveDTCCount = (s: AppState): number =>
  s.dtcs.filter(d => d.status === 'active').length;

export const selectParasiteRiskScore = (s: AppState): number => {
  const rogueCount = s.modules.filter(m => m.status === 'rogue').length;
  const ltftB1 = typeof s.liveData['0107']?.value === 'number' ? s.liveData['0107'].value as number : 0;
  const voltDrift = 0; // Calculated from voltage history elsewhere
  const faultWeight = s.dtcs.filter(d => d.type === 'B' || d.type === 'U').length;
  const sleepFail = rogueCount;
  return Math.min(10, (sleepFail * 3) + (voltDrift * 4) + (faultWeight * 1.5) + (Math.abs(ltftB1) > 7 ? 1 : 0));
};

export const selectVoltageTrend = (s: AppState): 'stable' | 'dropping' | 'critical' => {
  const readings = s.history['ATRV'] ?? [];
  if (readings.length < 10) return 'stable';
  const recent = readings.slice(-10);
  const first = recent[0].value as number;
  const last = recent[recent.length - 1].value as number;
  const dropV = first - last;
  if (dropV > 0.05) return 'critical';
  if (dropV > 0.02) return 'dropping';
  return 'stable';
};
