import { create } from 'zustand';
import {
  ConnectionStatus, PIDReading, DTCCode, ModuleState,
  LogEntry, SessionMarker, FuseCircuit, ParasiticChecklistItem,
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
  | 'logs';

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
  activeScreen: 'connect',
  isDarkMode: true,
  chatMessages: [],

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
      // Update live data
      const liveData = { ...state.liveData, [reading.pid]: reading };

      // Append to history ring buffer
      const prevHistory = state.history[reading.pid] ?? [];
      const newHistory = [...prevHistory, reading].slice(-state.historyMaxPoints);
      const history = { ...state.history, [reading.pid]: newHistory };

      return { liveData, history };
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

  setActiveScreen: (screen) => set({ activeScreen: screen }),

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
