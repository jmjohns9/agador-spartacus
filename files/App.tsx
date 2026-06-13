import React, { useEffect } from 'react';
import { useAppStore, selectBatteryVoltage, selectActiveDTCCount } from './store/appStore';
import { buildCSSVars } from './theme/theme';
import { PIDReading, DTCCode, ModuleState, LogEntry } from '../shared/types';

// Screens
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
    };
  }
}

// ─── Nav Item Definition ───────────────────────────────────────────────────────

type ScreenId = 'health' | 'live' | 'allpids' | 'engine' | 'electrical' | 'hvac' | 'transmission' | 'dtc' | 'modules' | 'parasite' | 'compare' | 'logs';

const NAV_ITEMS: Array<{ id: ScreenId; icon: string; label: string; tooltip: string; dividerBefore?: boolean }> = [
  { id: 'health',       icon: 'ti-heart-rate-monitor', label: 'Health',  tooltip: 'Vehicle health overview' },
  { id: 'live',         icon: 'ti-gauge',               label: 'Live',    tooltip: 'Live telemetry' },
  { id: 'allpids',      icon: 'ti-list',                label: 'PIDs',    tooltip: 'All OBD-II parameters' },
  { id: 'engine',       icon: 'ti-engine',              label: 'Engine',  tooltip: 'Engine & fuel metrics',   dividerBefore: true },
  { id: 'electrical',   icon: 'ti-bolt',                label: 'Elec',    tooltip: 'Battery & electrical' },
  { id: 'hvac',         icon: 'ti-air-conditioning',    label: 'HVAC',    tooltip: 'Heating, ventilation & AC' },
  { id: 'transmission', icon: 'ti-manual-gearbox',      label: 'Trans',   tooltip: 'Transmission' },
  { id: 'dtc',          icon: 'ti-alert-triangle',      label: 'DTC',     tooltip: 'Diagnostic fault codes',  dividerBefore: true },
  { id: 'modules',      icon: 'ti-cpu',                 label: 'Mods',    tooltip: 'Module wake monitor' },
  { id: 'parasite',     icon: 'ti-bug',                 label: 'Draw',    tooltip: 'Parasitic draw analysis' },
  { id: 'compare',      icon: 'ti-chart-arrows-vertical', label: 'Cmp',   tooltip: 'Live vs historic compare', dividerBefore: true },
  { id: 'logs',         icon: 'ti-terminal',            label: 'Logs',    tooltip: 'Session event log' },
];

const SCREEN_TITLES: Record<ScreenId, string> = {
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

  // ── Connect to simulator on launch if no real port ────────────────────────
  useEffect(() => {
    if (window.electronAPI && connectionStatus === 'disconnected') {
      window.electronAPI.connect('SIMULATOR');
    }
  }, []);

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
      <header style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--br)',
        height: 44, display: 'flex', alignItems: 'center',
        padding: '0 10px', gap: 0, flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 10, borderRight: '1px solid var(--br)', height: '100%', flexShrink: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M2 20 A 13 13 0 0 1 22 20" stroke="var(--pp)" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M6 20 A 8 8 0 0 1 18 20" stroke="var(--gb)" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="10" r="2" fill="var(--pp)"/>
          </svg>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--pp)', letterSpacing: 1.5, whiteSpace: 'nowrap' }}>
              2004 CHEVROLET SILVERADO 1500
            </div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 300, fontSize: 9, color: 'var(--tm)', letterSpacing: 2, whiteSpace: 'nowrap', marginTop: 1 }}>
              VIN 1GCEK19T04E · Z71 · 5.3L VORTEC V8
            </div>
          </div>
        </div>

        {/* Status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', flex: 1, overflow: 'hidden' }}>
          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 8px', height: 26, flexShrink: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: connColor }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: connColor, whiteSpace: 'nowrap' }}>
              {connLabel}
            </span>
          </div>

          {/* Protocol */}
          {protocol && (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 7px', height: 26, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
                {protocol}
              </span>
            </div>
          )}

          {/* Battery voltage */}
          <div
            title="Live battery terminal voltage measured directly by the OBD adapter at the diagnostic port"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 8px', height: 26, flexShrink: 0 }}
          >
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, color: 'var(--tm)', letterSpacing: 0.8, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Battery voltage
            </span>
            <div style={{ width: 1, height: 14, background: 'var(--br)' }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--pp)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {batteryVoltage > 0 ? `${batteryVoltage.toFixed(2)} V` : '— V'}
            </span>
          </div>

          {/* Check engine / DTC count */}
          {activeDTCCount > 0 && (
            <div
              title={`Check engine light active — ${activeDTCCount} diagnostic fault code${activeDTCCount > 1 ? 's' : ''} stored`}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,36,64,0.08)', border: '1px solid rgba(255,36,64,0.4)', borderRadius: 2, padding: '0 7px', height: 26, flexShrink: 0 }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sr)', animation: 'blink 1.8s infinite' }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--sr)', whiteSpace: 'nowrap' }}>
                Check engine · {activeDTCCount} code{activeDTCCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 8, borderLeft: '1px solid var(--br)', height: '100%', flexShrink: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--tm)', whiteSpace: 'nowrap' }}>
            {sessionStartMs ? sessionTime : '—'}
          </span>
          <button
            onClick={toggleDarkMode}
            title="Toggle light / dark mode"
            style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 6px', height: 26, cursor: 'pointer', color: 'var(--tm)' }}
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
          width: 52, background: 'var(--bg2)', borderRight: '1px solid var(--br)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '4px 0', gap: 1, flexShrink: 0,
        }}>
          {NAV_ITEMS.map((item) => (
            <React.Fragment key={item.id}>
              {item.dividerBefore && (
                <div style={{ width: 28, height: 1, background: 'var(--br)', margin: '2px 0' }} />
              )}
              <div
                onClick={() => setActiveScreen(item.id)}
                title={item.tooltip}
                style={{
                  width: 44, height: 40,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 3, cursor: 'pointer', gap: 2,
                  border: activeScreen === item.id ? '1px solid var(--pp)' : '1px solid transparent',
                  background: activeScreen === item.id ? 'var(--bg4)' : 'transparent',
                  transition: 'all 0.12s',
                }}
              >
                <i
                  className={`ti ${item.icon}`}
                  style={{ fontSize: 15, color: activeScreen === item.id ? 'var(--pp)' : 'var(--tm)' }}
                />
                <span style={{
                  fontSize: 8, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3,
                  textTransform: 'uppercase', color: activeScreen === item.id ? 'var(--pp)' : 'var(--tm)',
                }}>
                  {item.label}
                </span>
              </div>
            </React.Fragment>
          ))}
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
          { icon: 'ti-wifi',     label: 'Protocol',     value: protocol || '—' },
          { icon: 'ti-clock',    label: 'Poll interval', value: '500 ms' },
          { icon: 'ti-activity', label: 'Packets / sec', value: connectionStatus === 'connected' ? '48' : '—' },
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
        button { font-family: inherit; }
        input, select { color: var(--tw); background: var(--bg3); border: 1px solid var(--br); border-radius: 2px; font-family: inherit; }
        input:focus, select:focus { outline: none; border-color: var(--pp); }
      `}</style>
    </div>
  );
}
