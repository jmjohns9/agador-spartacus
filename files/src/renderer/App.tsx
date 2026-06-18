import React, { useEffect } from 'react';
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

  // ── Auto-navigate to connection screen when disconnected ─────────────────
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      const current = useAppStore.getState().activeScreen;
      if (current !== 'assistant' && current !== 'logs' && current !== 'settings') setActiveScreen('connect');
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

      {/* ── Industrial accent stripe — solid 2px ─────────────────────── */}
      <div style={{ height: 2, background: 'var(--pp)', flexShrink: 0 }} />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--bg2)', borderBottom: '2px solid var(--br)',
        height: 52, display: 'flex', alignItems: 'center',
        padding: '0 14px 0 88px', gap: 0, flexShrink: 0,
        // @ts-ignore — Electron-specific CSS property
        WebkitAppRegion: 'drag',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 14, borderRight: '2px solid var(--br)', height: '100%', flexShrink: 0 }}>
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
          <div className="chip" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', border: '2px solid var(--br)', padding: '0 10px', height: 28, flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, background: connColor }} />
            <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: connColor, whiteSpace: 'nowrap' }}>
              {connLabel}
            </span>
          </div>

          {/* Protocol */}
          {protocol && (
            <div className="chip" style={{ background: 'var(--bg3)', border: '2px solid var(--br)', padding: '0 10px', height: 28, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
                {protocol}
              </span>
            </div>
          )}

          {/* Battery voltage */}
          <div
            className="chip"
            title="Live battery terminal voltage measured directly by the OBD adapter at the diagnostic port"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '2px solid var(--br)', padding: '0 10px', height: 28, flexShrink: 0 }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '2px solid var(--br)', height: '100%', flexShrink: 0 }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
            {sessionStartMs ? sessionTime : '—'}
          </span>
          <button
            onClick={toggleDarkMode}
            title="Toggle light / dark mode"
            // @ts-ignore — keep this control clickable inside the draggable header
            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--bg3)', border: '2px solid var(--br)', padding: '0 6px', height: 24, cursor: 'pointer', color: 'var(--tm)', WebkitAppRegion: 'no-drag' }}
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
          width: 86, background: 'var(--bg2)', borderRight: '2px solid var(--br)',
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
                    border: isActive ? '2px solid var(--pp)' : '2px solid transparent',
                    background: isActive ? 'var(--bg4)' : 'transparent',
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
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Tab rail */}
          <div style={{ background: 'var(--bg3)', borderBottom: '2px solid var(--br)', padding: '0 2px', flexShrink: 0, display: 'flex' }}>
            <div style={{
              padding: '6px 13px', fontSize: 10,
              fontFamily: FONTS.mono, fontWeight: 700, letterSpacing: 1.2,
              color: 'var(--pp)', borderBottom: '2px solid var(--pp)', textTransform: 'uppercase',
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
          </div>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg2)', borderTop: '2px solid var(--br)',
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--br); }
        ::-webkit-scrollbar-thumb:hover { background: var(--bs); }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes waveAnim { 0%,100%{transform:scaleY(.2)} 50%{transform:scaleY(1)} }

        @keyframes screenIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .screen-enter { animation: screenIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both; }

        /* Nav — border-brighten on hover, no shadows */
        .nav-btn {
          transition: background 0.12s, border-color 0.12s, transform 0.1s !important;
        }
        .nav-btn:hover:not([aria-current="page"]) {
          background: var(--bg3) !important;
          border-color: var(--bs) !important;
        }
        .nav-btn:active { transform: scale(0.96); }
        .nav-btn[aria-current="page"] {
          background: var(--bg4) !important;
        }

        /* Button — invert/brighten on hover, NO shadows */
        .btn {
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
          position: relative;
        }
        .btn:hover:not(:disabled) {
          filter: brightness(1.2);
          border-color: var(--pp) !important;
        }
        .btn:active:not(:disabled) {
          transform: scale(0.97);
          filter: brightness(0.9);
        }

        /* Card — border-brighten hover, no lift/shadow */
        .card-lift {
          transition: border-color 0.15s !important;
        }
        .card-lift:hover {
          border-color: var(--bs) !important;
        }

        /* Data row hover */
        .data-row {
          transition: background 0.1s !important;
        }
        .data-row:hover { background: var(--bg3) !important; }

        /* Status chip hover — border brighten */
        .chip { transition: border-color 0.15s; }
        .chip:hover { border-color: var(--bs) !important; }

        /* Toggle thumb */
        .toggle-thumb {
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        /* Input focus — border brighten, no glow */
        input:focus, select:focus {
          outline: none;
          border-color: var(--pp) !important;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }
        button { font-family: inherit; font-size: inherit; color: inherit; }
        :focus { outline: none; }
        :focus-visible { outline: 2px solid var(--pp); outline-offset: 1px; }
        input, select { color: var(--tw); background: var(--bg3); border: 2px solid var(--br); font-family: inherit; transition: border-color 0.15s; }

        /* Compact sidebar at short window heights */
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

        /* Responsive grid at narrow widths */
        @media (max-width: 800px) {
          .hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
