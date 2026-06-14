import React, { useEffect } from 'react';
import { useAppStore, selectBatteryVoltage, selectActiveDTCCount, vehicleDisplayName } from './store/appStore';
import { buildCSSVars } from './theme/theme';
import { PIDReading, DTCCode, ModuleState, LogEntry } from '../shared/types';

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
    };
  }
}

// ─── Nav Item Definition ───────────────────────────────────────────────────────

type ScreenId = 'connect' | 'assistant' | 'health' | 'live' | 'allpids' | 'engine' | 'electrical' | 'hvac' | 'transmission' | 'dtc' | 'modules' | 'parasite' | 'compare' | 'logs';

const NAV_ITEMS: Array<{ id: ScreenId; icon: string; label: string; tooltip: string; groupLabel?: string }> = [
  { id: 'connect',      icon: 'ti-bluetooth',            label: 'Connect', tooltip: 'Bluetooth / serial connection' },
  { id: 'assistant',    icon: 'ti-sparkles',             label: 'Claude',  tooltip: 'Ask Claude about the live session' },
  { id: 'health',       icon: 'ti-heart-rate-monitor',   label: 'Health',  tooltip: 'Vehicle health overview',     groupLabel: 'Overview' },
  { id: 'live',         icon: 'ti-dashboard',            label: 'Live',    tooltip: 'Live telemetry' },
  { id: 'allpids',      icon: 'ti-list-search',          label: 'PIDs',    tooltip: 'All OBD-II parameters' },
  { id: 'engine',       icon: 'ti-engine',               label: 'Engine',  tooltip: 'Engine & fuel metrics',       groupLabel: 'Subsystems' },
  { id: 'electrical',   icon: 'ti-battery-automotive',   label: 'Electrical', tooltip: 'Battery & electrical' },
  { id: 'hvac',         icon: 'ti-temperature',          label: 'HVAC',    tooltip: 'Heating, ventilation & AC' },
  { id: 'transmission', icon: 'ti-manual-gearbox',       label: 'Trans',   tooltip: 'Transmission' },
  { id: 'dtc',          icon: 'ti-alert-triangle',       label: 'DTC',     tooltip: 'Diagnostic fault codes',      groupLabel: 'Diagnostic' },
  { id: 'modules',      icon: 'ti-cpu',                  label: 'Modules', tooltip: 'Module wake monitor' },
  { id: 'parasite',     icon: 'ti-zoom-exclamation',     label: 'Draw',    tooltip: 'Parasitic draw analysis' },
  { id: 'compare',      icon: 'ti-arrows-diff',          label: 'Compare', tooltip: 'Live vs historic compare',    groupLabel: 'Records' },
  { id: 'logs',         icon: 'ti-file-text',            label: 'Logs',    tooltip: 'Session event log' },
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
  compare:      'Live vs historic compare',
  logs:         'Session event log',
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
  // (but never yank the user out of the assistant or logs — those are exactly
  //  where you go to figure out WHY it disconnected)
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      const current = useAppStore.getState().activeScreen;
      if (current !== 'assistant' && current !== 'logs') setActiveScreen('connect');
    }
  }, [connectionStatus]);

  // ── Real telemetry stats for the status bar (no fake numbers) ─────────────
  // Derived selector: only re-renders App when the computed counts actually
  // change, not on every PID reading (was PRF-004).
  const { livePIDCount, readingsPerSec } = useAppStore((s) => {
    const now = Date.now();
    const readings = Object.values(s.liveData);
    const fresh = readings.filter(r => now - r.timestamp < 5000);
    const lastSec = readings.filter(r => now - r.timestamp < 2000).length / 2;
    return { livePIDCount: fresh.length, readingsPerSec: lastSec.toFixed(1) };
  }, (a, b) => a.livePIDCount === b.livePIDCount && a.readingsPerSec === b.readingsPerSec);

  // Battery chip colour by actual health: charging ~14V, healthy ≥12.4, low <12.0
  const battColor = batteryVoltage <= 0 ? 'var(--tm)'
    : batteryVoltage >= 13.2 ? 'var(--gb)'      // charging
    : batteryVoltage >= 12.4 ? 'var(--sg)'      // healthy rest
    : batteryVoltage >= 12.0 ? 'var(--sa)'      // discharged
    : 'var(--sr)';                              // critically low

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
      color: 'var(--tw)', fontFamily: "'Barlow', sans-serif",
      fontSize: 13, overflow: 'hidden',
    }}>

      {/* ── MTC dual stripe ─────────────────────────────────────────────── */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, var(--pp) 60%, var(--gb) 60%)', flexShrink: 0 }} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* Left padding reserves room for the macOS traffic-light buttons       */}
      {/* (titleBarStyle: 'hiddenInset' overlays them on the top-left).         */}
      {/* WebkitAppRegion: 'drag' lets the user move the window by the header.  */}
      <header style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--br)',
        height: 54, display: 'flex', alignItems: 'center',
        padding: '0 14px 0 88px', gap: 0, flexShrink: 0,
        // @ts-ignore — Electron-specific CSS property
        WebkitAppRegion: 'drag',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 14, borderRight: '1px solid var(--br)', height: '100%', flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M2 20 A 13 13 0 0 1 22 20" stroke="var(--pp)" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M6 20 A 8 8 0 0 1 18 20" stroke="var(--gb)" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="10" r="2" fill="var(--pp)"/>
          </svg>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--pp)', letterSpacing: 1.5, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
              {vehicleDisplayName(vehicle)}
            </div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 400, fontSize: 11, color: 'var(--tm)', letterSpacing: 2, whiteSpace: 'nowrap', marginTop: 1 }}>
              {[vehicle.vin && `VIN ${vehicle.vin}`, vehicle.engine, vehicle.nickname].filter(Boolean).join(' · ')
                || 'Project Agador Spartacus'}
            </div>
          </div>
        </div>

        {/* Status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', flex: 1, overflow: 'hidden' }}>
          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 3, padding: '0 10px', height: 30, flexShrink: 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: connColor }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: connColor, whiteSpace: 'nowrap' }}>
              {connLabel}
            </span>
          </div>

          {/* Protocol */}
          {protocol && (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 3, padding: '0 10px', height: 30, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
                {protocol}
              </span>
            </div>
          )}

          {/* Battery voltage */}
          <div
            title="Live battery terminal voltage measured directly by the OBD adapter at the diagnostic port"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 3, padding: '0 10px', height: 30, flexShrink: 0 }}
          >
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 11, color: 'var(--tm)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Battery
            </span>
            <div style={{ width: 1, height: 16, background: 'var(--br)' }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: battColor, fontWeight: 500, whiteSpace: 'nowrap' }}>
              {batteryVoltage > 0 ? `${batteryVoltage.toFixed(2)} V` : '— V'}
            </span>
          </div>

          {/* Check engine / DTC count */}
          {activeDTCCount > 0 && (
            <div
              title={`Check engine light active — ${activeDTCCount} diagnostic fault code${activeDTCCount > 1 ? 's' : ''} stored`}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,36,64,0.08)', border: '1px solid rgba(255,36,64,0.4)', borderRadius: 3, padding: '0 10px', height: 30, flexShrink: 0 }}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sr)', animation: 'blink 1.8s infinite' }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--sr)', whiteSpace: 'nowrap' }}>
                Check engine · {activeDTCCount} code{activeDTCCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid var(--br)', height: '100%', flexShrink: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
            {sessionStartMs ? sessionTime : '—'}
          </span>
          <button
            onClick={toggleDarkMode}
            title="Toggle light / dark mode"
            // @ts-ignore — keep this control clickable inside the draggable header
            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 6px', height: 26, cursor: 'pointer', color: 'var(--tm)', WebkitAppRegion: 'no-drag' }}
          >
            <i className="ti ti-sun" style={{ fontSize: 12 }} />
            <div style={{ width: 22, height: 12, background: 'var(--bg4)', borderRadius: 6, border: '1px solid var(--br)', position: 'relative' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pp)', position: 'absolute', top: 1, ...(isDarkMode ? { right: 1 } : { left: 1 }) }} />
            </div>
            <i className="ti ti-moon" style={{ fontSize: 12 }} />
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <nav style={{
          width: 88, background: 'var(--bg2)', borderRight: '1px solid var(--br)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '6px 0', gap: 2, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeScreen === item.id;
            const showAlert = item.id === 'connect' && (connectionStatus === 'disconnected' || connectionStatus === 'error');
            return (
              <React.Fragment key={item.id}>
                {item.groupLabel && (
                  <div style={{
                    width: 70, marginTop: 10, marginBottom: 4,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{ height: 1, flex: 1, background: 'var(--br)' }} />
                    <span style={{
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                      fontSize: 9, letterSpacing: 1.4, color: 'var(--tm)',
                      textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      {item.groupLabel}
                    </span>
                    <div style={{ height: 1, flex: 1, background: 'var(--br)' }} />
                  </div>
                )}
                <button
                  onClick={() => setActiveScreen(item.id)}
                  title={item.tooltip}
                  aria-label={item.tooltip}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    width: 76, height: 54, position: 'relative', padding: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 6, cursor: 'pointer', gap: 4,
                    border: isActive ? '1px solid var(--pp)' : '1px solid transparent',
                    background: isActive ? 'var(--bg4)' : 'transparent',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  {showAlert && (
                    <div style={{ position: 'absolute', top: 5, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--sr)', animation: 'blink 1.8s infinite' }} />
                  )}
                  <i
                    className={`ti ${item.icon}`}
                    style={{ fontSize: 24, color: isActive ? 'var(--pp)' : showAlert ? 'var(--sr)' : 'var(--tm)' }}
                  />
                  <span style={{
                    fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
                    letterSpacing: 0.8, textTransform: 'uppercase',
                    color: isActive ? 'var(--pp)' : showAlert ? 'var(--sr)' : 'var(--tm)',
                  }}>
                    {item.label}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Tab rail */}
          <div style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--br)', padding: '0 2px', flexShrink: 0, display: 'flex' }}>
            <div style={{
              padding: '7px 13px', fontSize: 10,
              fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: 0.8,
              color: 'var(--pp)', borderBottom: '2px solid var(--pp)', textTransform: 'uppercase',
            }}>
              {SCREEN_TITLES[activeScreen]}
            </div>
          </div>

          {/* Screen content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
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
            {activeScreen === 'compare'      && <CompareScreen />}
            {activeScreen === 'logs'         && <LogsScreen />}
          </div>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg2)', borderTop: '1px solid var(--br)',
        height: 24, display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 14, flexShrink: 0,
      }}>
        {[
          { icon: 'ti-wifi',     label: 'Protocol',      value: protocol || '—' },
          { icon: 'ti-list',     label: 'PIDs live',     value: connectionStatus === 'connected' ? String(livePIDCount) : '—' },
          { icon: 'ti-activity', label: 'Readings / sec', value: connectionStatus === 'connected' ? readingsPerSec : '—' },
        ].map(({ icon, label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--tm)' }}>
            <i className={`ti ${icon}`} style={{ fontSize: 11 }} />
            {label}: <span style={{ color: 'var(--tw)' }}>{value}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--tm)' }}>
          Session: <span style={{ color: 'var(--tw)' }}>{sessionStartMs ? sessionTime : '—'}</span>
        </div>
      </div>

      {/* Global CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700&family=Barlow:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--br); border-radius: 3px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes waveAnim { 0%,100%{transform:scaleY(.2)} 50%{transform:scaleY(1)} }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }
        button { font-family: inherit; font-size: inherit; color: inherit; }
        :focus { outline: none; }
        :focus-visible { outline: 2px solid var(--pp); outline-offset: 2px; border-radius: 3px; }
        input, select { color: var(--tw); background: var(--bg3); border: 1px solid var(--br); border-radius: 2px; font-family: inherit; }
        input:focus, select:focus { outline: none; border-color: var(--pp); }
      `}</style>
    </div>
  );
}
