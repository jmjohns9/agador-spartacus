import { create } from 'zustand';
import {
  ConnectionStatus, PIDReading, DTCCode, ModuleState,
  LogEntry, SessionMarker, FuseCircuit, ParasiticChecklistItem,
} from '../../shared/types';
import { IPFB_FUSES, UHFRC_FUSES, PARASITIC_CHECKLIST_TEMPLATE } from '../../core/vehicleProfile';

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

// ─── Store ────────────────────────────────────────────────────────────────────

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
  ipfbFuses: IPFB_FUSES,
  uhfrcFuses: UHFRC_FUSES,
  checklist: PARASITIC_CHECKLIST_TEMPLATE.map(t => ({ ...t, completed: false, notes: '' })),
  log: [],
  markers: [],
  activeScreen: 'health',
  isDarkMode: true,

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
