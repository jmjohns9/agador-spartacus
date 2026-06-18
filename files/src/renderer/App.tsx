import React, { useEffect, useRef } from 'react';
import { useAppStore, selectBatteryVoltage, selectActiveDTCCount, vehicleDisplayName } from './store/appStore';
import { buildCSSVars, FONTS } from './theme/theme';
import { PIDReading, DTCCode, ModuleState, LogEntry, SessionSnapshot, DataRecording, FreezeFrame, StorageConfig, StorageInfo, ReportPayload } from '../shared/types';

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
import { SettingsScreen }     from './screens/SettingsScreen';
import { DataLoggerScreen }  from './screens/DataLoggerScreen';
import { FreezeFrameScreen } from './screens/FreezeFrameScreen';

declare global {
  interface Window {
    electronAPI: {
      listPorts: () => Promise<Array<{ path: string; manufacturer: string; serialNumber: string; isOBD: boolean }>>;
      connect: (port: string) => Promise<void>;
      disconnect: () => Promise<void>;
      scanDTCs: () => Promise<DTCCode[]>;
      clearDTCs: () => Promise<boolean>;
      checkModules: () => Promise<ModuleState[]>;
      exportLog: (filename: string) => Promise<void>;
      exportCSV: (data: string, filename: string) => Promise<void>;
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

// ─── Nav Item Definition ───────────────────────────────────────────────────────

type ScreenId = 'connect' | 'assistant' | 'health' | 'live' | 'allpids' | 'engine' | 'electrical' | 'hvac' | 'transmission' | 'dtc' | 'modules' | 'parasite' | 'compare' | 'logs' | 'ecubus' | 'logger' | 'freezeframes' | 'settings';

const NAV_ITEMS: Array<{ id: ScreenId; icon: string; label: string; tooltip: string; groupLabel?: string }> = [
  { id: 'connect',      icon: 'ti-bluetooth',            label: 'Connect', tooltip: 'Bluetooth / serial connection' },
  { id: 'assistant',    icon: 'ti-sparkles',             label: 'Claude',  tooltip: 'Ask Claude about the live session' },
  { id: 'health',       icon: 'ti-heart-rate-monitor',   label: 'Health',  tooltip: 'Vehicle health overview',     groupLabel: 'Overview' },
  { id: 'live',         icon: 'ti-dashboard',            label: 'Live',    tooltip: 'Live telemetry' },
  { id: 'allpids',      icon: 'ti-list-search',          label: 'PIDs',    tooltip: 'All OBD-II parameters' },
  { id: 'logger',       icon: 'ti-activity',             label: 'Logger',  tooltip: 'PID data logger' },
  { id: 'engine',       icon: 'ti-engine',               label: 'Engine',  tooltip: 'Engine & fuel metrics',       groupLabel: 'Subsystems' },
  { id: 'electrical',   icon: 'ti-battery-automotive',   label: 'Electrical', tooltip: 'Battery & electrical' },
  { id: 'hvac',         icon: 'ti-temperature',          label: 'HVAC',    tooltip: 'Heating, ventilation & AC' },
  { id: 'transmission', icon: 'ti-manual-gearbox',       label: 'Trans',   tooltip: 'Transmission' },
  { id: 'dtc',          icon: 'ti-alert-triangle',       label: 'DTC',     tooltip: 'Diagnostic fault codes',      groupLabel: 'Diagnostic' },
  { id: 'modules',      icon: 'ti-cpu',                  label: 'Modules', tooltip: 'Module wake monitor' },
  { id: 'parasite',     icon: 'ti-zoom-exclamation',     label: 'Draw',    tooltip: 'Parasitic draw analysis' },
  { id: 'ecubus',       icon: 'ti-circuit-diode',         label: 'EcuBus',  tooltip: 'EcuBus-Pro CAN/UDS tools',   groupLabel: 'Advanced' },
  { id: 'compare',      icon: 'ti-arrows-diff',          label: 'Compare', tooltip: 'Live vs historic compare',    groupLabel: 'Records' },
  { id: 'freezeframes', icon: 'ti-camera',               label: 'Freeze',  tooltip: 'Freeze frame viewer' },
  { id: 'logs',         icon: 'ti-file-text',            label: 'Logs',    tooltip: 'Session event log' },
  { id: 'settings',     icon: 'ti-settings',             label: 'Settings', tooltip: 'App settings' },
];

const SCREEN_TITLES: Record<ScreenId, string> = {
  connect:      'Bluetooth / serial connection',
  assistant:    'Claude diagnostic assistant',
  health:       'Vehicle health overview',
  live:         'Live telemetry',
  allpids:      'All OBD-II parameters',
  engine:       'Engine & fuel',
  electrical:   'Electrical & battery',
  hvac:         'Heating, ventilation & AC',
  transmission: 'Transmission',
  dtc:          'Diagnostic fault codes',
  modules:      'Module wake monitor',
  parasite:     'Parasitic draw analysis',
  ecubus:       'EcuBus-Pro — CAN / UDS / LIN',
  compare:      'Live vs historic compare',
  logs:         'Session event log',
  logger:       'Data logger',
  freezeframes: 'Freeze frame viewer',
  settings:     'Settings',
};

// ─── App ──────────────────────────────────────────────────────────────────────

export function App(): React.ReactElement {
  const {
    connectionStatus, protocol, adapterInfo,
    isDarkMode, activeScreen, sessionStartMs,
    setConnectionStatus, updatePIDReading, setDTCs,
    updateModule, addLogEntry, setActiveScreen, toggleDarkMode,
  } = useAppStore();

  const batteryVoltage = useAppStore(selectBatteryVoltage);
  const activeDTCCount = useAppStore(selectActiveDTCCount);
  const vehicle        = useAppStore(s => s.vehicle);
  const dtcs           = useAppStore(s => s.dtcs);
  const liveData       = useAppStore(s => s.liveData);

  // ── Inject CSS variables on mount and when theme changes ──────────────────
  useEffect(() => {
    document.documentElement.style.cssText = buildCSSVars(isDarkMode);
  }, [isDarkMode]);

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

  // ── Session timer ─────────────────────────────────────────────────────────
  const [sessionTime, setSessionTime] = React.useState('00:00:00');
  useEffect(() => {
    if (!sessionStartMs) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - sessionStartMs) / 1000);
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const sc = String(s % 60).padStart(2, '0');
      setSessionTime(`${h}:${m}:${sc}`);
    }, 1000);
    return () => clearInterval(id);
  }, [sessionStartMs]);

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

  // ── Real telemetry stats for the status bar ─────────────────────────────
  const { livePIDCount, readingsPerSec } = useAppStore((s) => {
    const now = Date.now();
    const readings = Object.values(s.liveData);
    const fresh = readings.filter(r => now - r.timestamp < 5000);
    const lastSec = readings.filter(r => now - r.timestamp < 2000).length / 2;
    return { livePIDCount: fresh.length, readingsPerSec: lastSec.toFixed(1) };
  }, (a, b) => a.livePIDCount === b.livePIDCount && a.readingsPerSec === b.readingsPerSec);

  const battColor = batteryVoltage <= 0 ? 'var(--tm)'
    : batteryVoltage >= 13.2 ? 'var(--gb)'
    : batteryVoltage >= 12.4 ? 'var(--sg)'
    : batteryVoltage >= 12.0 ? 'var(--sa)'
    : 'var(--sr)';

  const connColor = connectionStatus === 'connected' ? 'var(--sg)'
    : connectionStatus === 'error' ? 'var(--sr)' : 'var(--sa)';

  const connLabel = {
    disconnected: 'Disconnected',
    scanning: 'Scanning...',
    connecting: 'Connecting...',
    initializing: 'Initializing...',
    connected: 'OBDLink MX+',
    error: 'Connection error',
  }[connectionStatus];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: 'var(--bg)',
      color: 'var(--tw)', fontFamily: FONTS.body,
      fontSize: 13, overflow: 'hidden',
    }}>

      {/* ── Precision accent stripe ───────────────────────────────────── */}
      <div style={{
        height: 1, flexShrink: 0,
        background: 'linear-gradient(90deg, transparent 0%, var(--pp) 20%, rgba(33,136,255,0.4) 80%, transparent 100%)',
      }} />

      {/* ── Header — glass depth ─────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(180deg, var(--bg2) 0%, rgba(22,27,34,0.97) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.3)',
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 14px 0 88px', gap: 0, flexShrink: 0,
        // @ts-ignore — Electron-specific CSS property
        WebkitAppRegion: 'drag',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 14, borderRight: '1px solid rgba(255,255,255,0.07)', height: '100%', flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M2 20 A 13 13 0 0 1 22 20" stroke="var(--pp)" strokeWidth="2.5" strokeLinecap="butt"/>
            <path d="M6 20 A 8 8 0 0 1 18 20" stroke="var(--gb)" strokeWidth="2" strokeLinecap="butt"/>
            <rect x="10.5" y="8.5" width="3" height="3" fill="var(--pp)"/>
          </svg>
          <div>
            <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 14, color: 'var(--pp)', letterSpacing: 2, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
              {vehicleDisplayName(vehicle)}
            </div>
            <div style={{ fontFamily: FONTS.body, fontWeight: 400, fontSize: 10, color: 'var(--tm)', letterSpacing: 1.5, whiteSpace: 'nowrap', marginTop: 1, textTransform: 'uppercase' }}>
              {[vehicle.vin && `VIN ${vehicle.vin}`, vehicle.engine, vehicle.nickname].filter(Boolean).join(' · ')
                || 'Project Agador Spartacus'}
            </div>
          </div>
        </div>

        {/* Status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', flex: 1, overflow: 'hidden' }}>
          {/* Connection status */}
          <div className="chip" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', padding: '0 10px', height: 26, flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, background: connColor }} />
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: connColor, whiteSpace: 'nowrap' }}>
              {connLabel}
            </span>
          </div>

          {/* Protocol */}
          {protocol && (
            <div className="chip" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)', padding: '0 10px', height: 26, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
                {protocol}
              </span>
            </div>
          )}

          {/* Battery voltage */}
          <div
            className="chip"
            title="Live battery terminal voltage measured directly by the OBD adapter at the diagnostic port"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', padding: '0 10px', height: 26, flexShrink: 0 }}
          >
            <span style={{ fontFamily: FONTS.body, fontSize: 10, color: 'var(--tm)', letterSpacing: 1.2, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Batt
            </span>
            <div style={{ width: 1, height: 14, background: 'var(--br)' }} />
            <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: battColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {batteryVoltage > 0 ? `${batteryVoltage.toFixed(2)} V` : '— V'}
            </span>
          </div>

          {/* Check engine / DTC count */}
          {activeDTCCount > 0 && (
            <div
              title={`Check engine light active — ${activeDTCCount} diagnostic fault code${activeDTCCount > 1 ? 's' : ''} stored`}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,61,0,0.08)', border: '2px solid rgba(255,61,0,0.5)', padding: '0 10px', height: 28, flexShrink: 0 }}
            >
              <div style={{ width: 6, height: 6, background: 'var(--sr)', animation: 'blink 1.8s infinite' }} />
              <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'var(--sr)', whiteSpace: 'nowrap' }}>
                CEL · {activeDTCCount} DTC{activeDTCCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.07)', height: '100%', flexShrink: 0 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
            {sessionStartMs ? sessionTime : '—'}
          </span>
          <button
            onClick={toggleDarkMode}
            title="Toggle light / dark mode"
            // @ts-ignore — keep this control clickable inside the draggable header
            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)', padding: '0 6px', height: 22, cursor: 'pointer', color: 'var(--tm)', WebkitAppRegion: 'no-drag' }}
          >
            <i className="ti ti-sun" style={{ fontSize: 12 }} />
            <div style={{ width: 22, height: 12, background: 'var(--bg4)', border: '1px solid var(--br)', position: 'relative' }}>
              <div className="toggle-thumb" style={{ width: 8, height: 8, background: 'var(--pp)', position: 'absolute', top: 1, ...(isDarkMode ? { right: 1 } : { left: 1 }) }} />
            </div>
            <i className="ti ti-moon" style={{ fontSize: 12 }} />
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <nav style={{
          width: 86,
          background: 'linear-gradient(180deg, var(--bg2) 0%, rgba(13,17,23,0.98) 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '6px 0', gap: 1, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeScreen === item.id;
            const showAlert = item.id === 'connect' && (connectionStatus === 'disconnected' || connectionStatus === 'error');
            return (
              <React.Fragment key={item.id}>
                {item.groupLabel && (
                  <div style={{
                    width: 70, marginTop: 8, marginBottom: 3,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{ height: 1, flex: 1, background: 'var(--br)' }} />
                    <span style={{
                      fontFamily: FONTS.body, fontWeight: 700,
                      fontSize: 8, letterSpacing: 1.6, color: 'var(--tm)',
                      textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      {item.groupLabel}
                    </span>
                    <div style={{ height: 1, flex: 1, background: 'var(--br)' }} />
                  </div>
                )}
                <button
                  className="nav-btn"
                  onClick={() => setActiveScreen(item.id)}
                  title={item.tooltip}
                  aria-label={item.tooltip}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    width: 74, height: 52, position: 'relative', padding: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', gap: 3,
                    border: 'none',
                    background: 'transparent',
                  }}
                >
                  {showAlert && (
                    <div style={{ position: 'absolute', top: 5, right: 8, width: 6, height: 6, background: 'var(--sr)', animation: 'blink 1.8s infinite' }} />
                  )}
                  <i
                    className={`ti ${item.icon}`}
                    style={{ fontSize: 22, color: isActive ? 'var(--pp)' : showAlert ? 'var(--sr)' : 'var(--tm)' }}
                  />
                  <span style={{
                    fontSize: 10, fontFamily: FONTS.body, fontWeight: 700,
                    letterSpacing: 1, textTransform: 'uppercase',
                    color: isActive ? 'var(--pp)' : showAlert ? 'var(--sr)' : 'var(--tm)',
                  }}>
                    {item.label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── Main content ─────────────────────────────────────────── */}
        <div style={{
          flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0,
          backgroundImage: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(33,136,255,0.04) 0%, transparent 60%)',
        }}>
          {/* Tab rail */}
          <div style={{
            background: 'rgba(22,27,34,0.7)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.15)',
            padding: '0 2px', flexShrink: 0, display: 'flex', alignItems: 'center',
          }}>
            <div style={{
              padding: '7px 14px', fontSize: 9,
              fontFamily: FONTS.body, fontWeight: 700, letterSpacing: 2,
              color: 'var(--pp)',
              borderBottom: '1px solid var(--pp)',
              textTransform: 'uppercase',
            }}>
              {SCREEN_TITLES[activeScreen]}
            </div>
          </div>

          {/* Screen content */}
          <div key={activeScreen} className="screen-enter" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {activeScreen === 'connect'      && <ConnectionScreen />}
            {activeScreen === 'assistant'    && <AssistantScreen />}
            {activeScreen === 'health'       && <HealthScreen />}
            {activeScreen === 'live'         && <LiveScreen />}
            {activeScreen === 'allpids'      && <AllPIDsScreen />}
            {activeScreen === 'engine'       && <EngineScreen />}
            {activeScreen === 'electrical'   && <ElectricalScreen />}
            {activeScreen === 'hvac'         && <HVACScreen />}
            {activeScreen === 'transmission' && <TransmissionScreen />}
            {activeScreen === 'dtc'          && <DTCScreen />}
            {activeScreen === 'modules'      && <ModulesScreen />}
            {activeScreen === 'parasite'     && <ParasiteScreen />}
            {activeScreen === 'ecubus'       && <EcuBusScreen />}
            {activeScreen === 'compare'      && <CompareScreen />}
            {activeScreen === 'logs'         && <LogsScreen />}
            {activeScreen === 'settings'     && <SettingsScreen />}
            {activeScreen === 'logger'       && <DataLoggerScreen />}
            {activeScreen === 'freezeframes' && <FreezeFrameScreen />}
          </div>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(22,27,34,0.95) 0%, var(--bg2) 100%)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        height: 24, display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 14, flexShrink: 0,
      }}>
        {[
          { icon: 'ti-wifi',     label: 'PROTO',     value: protocol || '—' },
          { icon: 'ti-list',     label: 'PIDs',      value: connectionStatus === 'connected' ? String(livePIDCount) : '—' },
          { icon: 'ti-activity', label: 'RATE',       value: connectionStatus === 'connected' ? `${readingsPerSec}/s` : '—' },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONTS.mono, fontSize: 10, color: 'var(--tm)' }}>
            <i className={`ti ${icon}`} style={{ fontSize: 11 }} />
            {label}: <span style={{ color: 'var(--tw)' }}>{value}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontFamily: FONTS.mono, fontSize: 10, color: 'var(--tm)' }}>
          T+ <span style={{ color: 'var(--tw)' }}>{sessionStartMs ? sessionTime : '—'}</span>
        </div>
      </div>

      {/* Global CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { overflow: hidden; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }

        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes waveAnim { 0%,100%{transform:scaleY(.2)} 50%{transform:scaleY(1)} }

        /* ── Screen enter — fade-up with blur for cinematic depth ── */
        @keyframes screenIn {
          from { opacity: 0; transform: translateY(8px); filter: blur(3px); }
          to   { opacity: 1; transform: translateY(0);   filter: blur(0); }
        }
        .screen-enter { animation: screenIn 0.38s cubic-bezier(0.32,0.72,0,1) both; }

        /* ── Nav — spring physics, left-edge glow on active ── */
        .nav-btn {
          transition: background 0.4s cubic-bezier(0.32,0.72,0,1),
                      box-shadow 0.4s cubic-bezier(0.32,0.72,0,1),
                      transform  0.2s cubic-bezier(0.32,0.72,0,1) !important;
        }
        .nav-btn:hover:not([aria-current="page"]) {
          background: rgba(255,255,255,0.04) !important;
        }
        .nav-btn:active { transform: scale(0.95); }
        .nav-btn[aria-current="page"] {
          background: linear-gradient(90deg, rgba(33,136,255,0.10) 0%, rgba(33,136,255,0.02) 100%) !important;
          box-shadow: inset 2px 0 0 var(--pp) !important;
        }

        /* ── Button — spring physics, scale-on-press ── */
        .btn {
          transition: filter      0.35s cubic-bezier(0.32,0.72,0,1),
                      transform   0.2s  cubic-bezier(0.32,0.72,0,1),
                      box-shadow  0.35s cubic-bezier(0.32,0.72,0,1) !important;
          position: relative;
        }
        .btn:hover:not(:disabled) {
          filter: brightness(1.25);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.12) !important;
        }
        .btn:active:not(:disabled) {
          transform: scale(0.96);
          filter: brightness(0.88);
        }
        /* Button-in-Button icon: diagonal nudge on hover */
        .btn:hover:not(:disabled) span:first-child {
          transform: translate(1px, -1px) scale(1.08);
        }

        /* ── Card — smooth border brightening ── */
        .card-lift {
          transition: border-color 0.4s cubic-bezier(0.32,0.72,0,1),
                      box-shadow   0.4s cubic-bezier(0.32,0.72,0,1) !important;
        }
        .card-lift:hover {
          border-color: rgba(255,255,255,0.1) !important;
        }

        /* ── Data row hover ── */
        .data-row {
          transition: background 0.25s cubic-bezier(0.32,0.72,0,1) !important;
        }
        .data-row:hover { background: rgba(255,255,255,0.03) !important; }

        /* ── Header chips ── */
        .chip { transition: border-color 0.3s cubic-bezier(0.32,0.72,0,1); }
        .chip:hover { border-color: rgba(255,255,255,0.16) !important; }

        /* ── Toggle thumb — bouncy spring ── */
        .toggle-thumb {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        /* ── Input / select focus ── */
        input:focus, select:focus {
          outline: none;
          border-color: var(--pp) !important;
          box-shadow: 0 0 0 3px rgba(33,136,255,0.12) !important;
        }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }

        button { font-family: inherit; font-size: inherit; color: inherit; }
        :focus { outline: none; }
        :focus-visible { outline: 2px solid var(--pp); outline-offset: 2px; }
        input, select {
          color: var(--tw); background: var(--bg3);
          border: 1px solid rgba(255,255,255,0.08);
          font-family: inherit;
          transition: border-color 0.3s cubic-bezier(0.32,0.72,0,1), box-shadow 0.3s cubic-bezier(0.32,0.72,0,1);
        }

        /* ── Compact sidebar at short window heights ── */
        @media (max-height: 700px) {
          .nav-btn { height: 40px !important; width: 68px !important; gap: 2px !important; }
          .nav-btn span { font-size: 8px !important; }
          .nav-btn i { font-size: 18px !important; }
        }
        @media (max-height: 500px) {
          .nav-btn { height: 32px !important; width: 64px !important; flex-direction: row !important; gap: 4px !important; }
          .nav-btn span { font-size: 7px !important; }
          .nav-btn i { font-size: 14px !important; }
        }

        /* ── Responsive grid ── */
        @media (max-width: 800px) {
          .hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
