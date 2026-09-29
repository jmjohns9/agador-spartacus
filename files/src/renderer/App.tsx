import React, { useEffect, useRef } from 'react';
import { useAppStore, vehicleDisplayName, selectActiveDTCCount, ScreenId } from './store/appStore';
import { buildThemeCSS, FONTS, TYPE } from './theme/theme';
import { GLOBAL_CSS } from './theme/globalStyles';
import { Sidebar } from './components/shell/Sidebar';
import { Toolbar } from './components/shell/Toolbar';
import { shortcutFor, readSidebarPref, writeSidebarPref } from './components/shell/shellLogic';
import { PIDReading, DTCCode, ModuleState, LogEntry, SessionSnapshot, DataRecording, FreezeFrame, StorageConfig, StorageInfo, ReportPayload, PcmReadResult, Appearance } from '../shared/types';

// Screens
import { ConnectionScreen }   from './screens/ConnectionScreen';
import { AssistantScreen }    from './screens/AssistantScreen';
import { HealthScreen }       from './screens/HealthScreen';
import { LiveScreen }         from './screens/LiveScreen';
import { AllPIDsScreen }      from './screens/AllPIDsScreen';
import { EngineScreen }       from './screens/EngineScreen';
import { ElectricalScreen }   from './screens/ElectricalScreen';
import { HVACScreen }         from './screens/HVACScreen';
import { TransmissionScreen } from './screens/TransmissionScreen';
import { DTCScreen }          from './screens/DTCScreen';
import { ModulesScreen }      from './screens/ModulesScreen';
import { ParasiteScreen }     from './screens/ParasiteScreen';
import { CompareScreen }      from './screens/CompareScreen';
import { LogsScreen }         from './screens/LogsScreen';
import { EcuBusScreen }       from './screens/EcuBusScreen';
import { PcmScreen }          from './screens/PcmScreen';
import { SettingsScreen }     from './screens/SettingsScreen';
import { DataLoggerScreen }  from './screens/DataLoggerScreen';
import { FreezeFrameScreen } from './screens/FreezeFrameScreen';

const safeStorage = (): Storage | undefined => { try { return window.localStorage; } catch { return undefined; } };

declare global {
  interface Window {
    electronAPI: {
      listPorts: () => Promise<Array<{ path: string; manufacturer: string; serialNumber: string; isOBD: boolean }>>;
      connect: (port: string) => Promise<void>;
      disconnect: () => Promise<void>;
      scanDTCs: () => Promise<DTCCode[] | null>;
      checkModules: () => Promise<ModuleState[]>;
      readPcmIds: () => Promise<PcmReadResult>;
      onPcmProgress: (cb: (p: { done: number; total: number }) => void) => () => void;
      exportLog: (filename: string) => Promise<void>;
      exportCSV: (data: string, filename: string) => Promise<void>;
      getAppearance: () => Promise<Appearance>;
      setAppearance: (a: Appearance) => Promise<Appearance>;
      onPIDReading: (cb: (r: PIDReading) => void) => () => void;
      onDTCResult: (cb: (d: DTCCode[]) => void) => () => void;
      onModuleState: (cb: (m: ModuleState) => void) => () => void;
      onConnectionStatus: (cb: (s: { status: string; protocol?: string; adapterInfo?: string }) => void) => () => void;
      onLogEntry: (cb: (e: LogEntry) => void) => () => void;
      onVINDetected: (cb: (vin: string) => void) => () => void;
      claudeAsk: (payload: { question: string; context: unknown; history: unknown }) =>
        Promise<
          | { ok: true; text: string; model: string; usage: { input_tokens: number; output_tokens: number } }
          | { ok: false; error: string; cancelled?: boolean }
        >;
      claudeGetConfig: () => Promise<{
        hasKey: boolean; keyHint: string; model: string;
        models: ReadonlyArray<{ id: string; label: string }>;
        customSystemPrompt: string;
        defaultSystemPrompt: string;
      }>;
      claudeSetConfig: (cfg: { apiKey?: string; model?: string; customSystemPrompt?: string }) => Promise<boolean>;
      claudeExportChat?: (markdown: string, filename: string) => Promise<boolean>;
      claudeCancel: () => Promise<boolean>;
      onClaudeStreamChunk: (cb: (delta: string) => void) => () => void;
      onBtRSSI?: (cb: (rssi: number | null) => void) => () => void;
      decodeVIN: (vin: string) => Promise<{ year: string; make: string; model: string; engine: string; trim: string; transmission: string } | null>;
      storage: {
        getConfig:         () => Promise<StorageConfig>;
        setConfig:         (u: Partial<StorageConfig>) => Promise<boolean>;
        migrate:           (to: 'local' | 'sqlite') => Promise<boolean>;
        getInfo:           () => Promise<StorageInfo>;
        openDataFolder:    () => Promise<void>;
        saveSnapshot:      (snap: SessionSnapshot) => Promise<string>;
        getSnapshots:      () => Promise<SessionSnapshot[]>;
        deleteSnapshot:    (id: string) => Promise<boolean>;
        saveRecording:     (rec: DataRecording) => Promise<string>;
        getRecordings:     () => Promise<DataRecording[]>;
        deleteRecording:   (id: string) => Promise<boolean>;
        saveFreezeFrame:   (ff: FreezeFrame) => Promise<string>;
        getFreezeFrames:   (dtcCode?: string) => Promise<FreezeFrame[]>;
        deleteFreezeFrame: (id: string) => Promise<boolean>;
      };
      reportGenerate: (payload: ReportPayload) => Promise<string>;
      carsxeDecode: (code: string) => Promise<
        | { ok: true; description: string; causes: string[]; repair: string }
        | { ok: false; error: string }
      >;
    };
  }
}

// ─── Screen map ─────────────────────────────────────────────────────────────────

const SCREENS: Record<ScreenId, React.ComponentType> = {
  connect: ConnectionScreen, assistant: AssistantScreen, health: HealthScreen, live: LiveScreen,
  allpids: AllPIDsScreen, engine: EngineScreen, electrical: ElectricalScreen, hvac: HVACScreen,
  transmission: TransmissionScreen, dtc: DTCScreen, modules: ModulesScreen, parasite: ParasiteScreen,
  ecubus: EcuBusScreen, pcm: PcmScreen, compare: CompareScreen, logs: LogsScreen,
  settings: SettingsScreen, logger: DataLoggerScreen, freezeframes: FreezeFrameScreen,
};

// ─── App ──────────────────────────────────────────────────────────────────────

export function App(): React.ReactElement {
  const {
    connectionStatus, activeScreen,
    setConnectionStatus, updatePIDReading, setDTCs,
    updateModule, addLogEntry, setActiveScreen,
  } = useAppStore();
  const activeDTCCount = useAppStore(selectActiveDTCCount);
  const vehicle        = useAppStore(s => s.vehicle);
  const dtcs           = useAppStore(s => s.dtcs);
  const liveData       = useAppStore(s => s.liveData);

  // ── Wire Electron IPC events ───────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanups = [
      window.electronAPI.onConnectionStatus((s) => {
        setConnectionStatus(s.status as any, s.protocol, s.adapterInfo);
      }),
      window.electronAPI.onPIDReading((r) => updatePIDReading(r)),
      window.electronAPI.onDTCResult((d) => setDTCs(d)),
      window.electronAPI.onModuleState((m) => updateModule(m)),
      window.electronAPI.onLogEntry((e) => addLogEntry(e)),
      window.electronAPI.onVINDetected(async (vin) => {
        const v = useAppStore.getState().vehicle;
        if (!v.vin) useAppStore.getState().setVehicle({ ...v, vin });
        if (vin && (!v.make || !v.model)) {
          const decoded = await window.electronAPI.decodeVIN(vin);
          if (decoded) {
            const cur = useAppStore.getState().vehicle;
            useAppStore.getState().setVehicle({
              ...cur,
              vin: cur.vin || vin,
              year: cur.year || decoded.year,
              make: cur.make || decoded.make,
              model: cur.model || decoded.model,
              engine: cur.engine || decoded.engine,
            });
          }
        }
      }),
      window.electronAPI.onBtRSSI?.((rssi) => {
        useAppStore.getState().setBtRSSI(rssi);
      }),
    ];

    return () => cleanups.forEach(fn => fn?.());
  }, []);

  // ── Freeze-frame auto-capture on new DTC detection ───────────────────────
  const knownDTCCodes = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const dtc of dtcs) {
      if (!knownDTCCodes.current.has(dtc.code)) {
        knownDTCCodes.current.add(dtc.code);
        const ff: FreezeFrame = {
          id:          `ff_${Date.now()}_${dtc.code}`,
          dtcCode:     dtc.code,
          capturedAt:  Date.now(),
          vehicleName: vehicleDisplayName(vehicle),
          liveData:    Object.fromEntries(
            Object.entries(liveData).map(([pid, r]) => [pid, { value: r.value, timestamp: r.timestamp }])
          ),
        };
        window.electronAPI.storage.saveFreezeFrame(ff).catch(() => {/* non-blocking */});
      }
    }
  }, [dtcs]);

  // ── Auto-navigate to connection screen when disconnected ─────────────────
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      const current = useAppStore.getState().activeScreen;
      if (current !== 'assistant' && current !== 'logs' && current !== 'settings' && current !== 'logger' && current !== 'freezeframes') setActiveScreen('connect');
    }
  }, [connectionStatus]);

  // ── Sidebar collapse preference + keyboard shortcuts ─────────────────────
  const [sidebarOpen, setSidebarOpen] = React.useState(() => readSidebarPref(safeStorage()));
  const toggleSidebar = React.useCallback(() => {
    setSidebarOpen(open => { writeSidebarPref(safeStorage(), !open); return !open; });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'toggle-sidebar') toggleSidebar();
      else setActiveScreen('settings');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar, setActiveScreen]);

  const Screen = SCREENS[activeScreen];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: FONTS.ui, ...TYPE.body, color: 'var(--label)' }}> {/* style-ok: app root font */}
      {sidebarOpen && (
        <Sidebar
          active={activeScreen}
          onSelect={setActiveScreen}
          dtcCount={activeDTCCount}
          connectionAlert={connectionStatus === 'disconnected' || connectionStatus === 'error'}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--content)' }}>
        <Toolbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          onOpenDTC={() => setActiveScreen('dtc')}
          onOpenConnection={() => setActiveScreen('connect')}
        />
        <main key={activeScreen} className="screen-enter" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Screen />
        </main>
      </div>
      <style>{`${buildThemeCSS()}\n${GLOBAL_CSS}`}</style>
    </div>
  );
}
