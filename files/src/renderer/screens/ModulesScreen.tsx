import React from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Card, Badge, AlertBanner, WaveBar, Button,
} from '../components/layout/UIComponents';
import { ModuleStatus } from '../../shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<ModuleStatus, 'ok' | 'crit' | 'warn' | 'info' | 'muted'> = {
  alive:    'ok',
  sleeping: 'info',
  rogue:    'crit',
  suspect:  'warn',
  unknown:  'muted',
};

const STATUS_COLOR: Record<ModuleStatus, string> = {
  alive:    'var(--sg)',
  sleeping: 'var(--gb)',
  rogue:    'var(--sr)',
  suspect:  'var(--sa)',
  unknown:  'var(--tm)',
};

const STATUS_LABEL: Record<ModuleStatus, string> = {
  alive:    'Alive — responding',
  sleeping: 'Sleeping — normal',
  rogue:    'ROGUE — awake after engine-off',
  suspect:  'Suspect — delayed sleep',
  unknown:  'Unknown',
};

// ─── ModulesScreen ─────────────────────────────────────────────────────────────

export function ModulesScreen(): React.ReactElement {
  const modules     = useAppStore(s => s.modules);
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const platform    = useAppStore(s => s.platform);
  const updateModule = useAppStore(s => s.updateModule);

  const handleScan = () => {
    // Seed the known module map for this platform (empty for generic vehicles —
    // those are discovered from live bus responses), then poll the bus.
    platform.modules.forEach(m => updateModule(m));
    if (window.electronAPI) window.electronAPI.checkModules();
  };

  const rogueModules   = modules.filter(m => m.status === 'rogue');
  const suspectModules = modules.filter(m => m.status === 'suspect');
  const aliveModules   = modules.filter(m => m.status === 'alive');
  const sleepingModules = modules.filter(m => m.status === 'sleeping');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toolbar — Dash0-style dense header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', background: 'var(--bg2)', borderBottom: '1px solid var(--br)',
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10,
          letterSpacing: 1.2, textTransform: 'uppercase',
          color: 'var(--tm)', flex: 1,
        }}>
          {modules.length} modules known · {aliveModules.length} alive · {sleepingModules.length} sleeping · {rogueModules.length} rogue
        </span>
        <Button
          size="sm"
          icon="ti-refresh"
          onClick={handleScan}
          disabled={connectionStatus !== 'connected'}
        >
          Scan modules
        </Button>
      </div>

      <ScrollPane>

        {/* Alerts */}
        {rogueModules.map(m => (
          <AlertBanner
            key={m.address}
            message={`ROGUE MODULE: ${m.name} (${m.address}) has been awake ${m.minutesAwakePostEngineOff.toFixed(0)} min after engine-off — parasitic draw suspect`}
            variant="crit"
          />
        ))}
        {suspectModules.map(m => (
          <AlertBanner
            key={m.address}
            message={`Suspect: ${m.name} (${m.address}) — delayed sleep. Monitor for rogue transition.`}
            variant="warn"
          />
        ))}

        {/* Module list */}
        <SectionHeader>{platform.name} — module status</SectionHeader>
        {modules.length === 0 ? (
          <Card>
            <div style={{ padding: '20px 12px', textAlign: 'center' }}>
              <i className="ti ti-cpu" style={{ fontSize: 28, color: 'var(--tm)', display: 'block', marginBottom: 8 }} />
              <div style={{ fontSize: 13, color: 'var(--tw)', marginBottom: 4 }}>No module data</div>
              <div style={{ fontSize: 12, color: 'var(--tm)' }}>
                {platform.modules.length > 0
                  ? 'Connect the adapter and click Scan modules to poll the bus.'
                  : 'No known module map for this vehicle — modules will appear as they respond on the bus after connecting.'}
              </div>
            </div>
          </Card>
        ) : (
          <Card padding={0}>
            {/* Header row — Dash0-style dense column labels */}
            <div style={{
              display: 'grid', gridTemplateColumns: '50px 1fr 80px 80px 90px 130px',
              gap: 8, padding: '6px 12px',
              background: 'var(--bg4)', borderBottom: '1px solid var(--br)',
            }}>
              {['Addr', 'Module', 'Latency', 'Awake', 'Bus', 'Status'].map(h => (
                <span key={h} style={{
                  fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9,
                  letterSpacing: 1.2, textTransform: 'uppercase',
                  color: 'var(--tm)',
                }}>{h}</span>
              ))}
            </div>
            {modules.map((mod, i) => {
              const color = STATUS_COLOR[mod.status];
              return (
                <div
                  key={mod.address}
                  style={{
                    display: 'grid', gridTemplateColumns: '50px 1fr 80px 80px 90px 130px',
                    gap: 8, padding: '10px 12px', alignItems: 'center',
                    borderBottom: i < modules.length - 1 ? '1px solid var(--bg3)' : 'none',
                    background: mod.status === 'rogue' ? 'rgba(255,36,64,0.04)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (mod.status !== 'rogue') (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = mod.status === 'rogue' ? 'rgba(255,36,64,0.04)' : 'transparent'; }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color }}>
                    {mod.address}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--tw)' }}>{mod.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: mod.latencyMs > 50 ? 'var(--sa)' : 'var(--tm)' }}>
                    {mod.latencyMs > 0 ? `${mod.latencyMs} ms` : '—'}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: mod.minutesAwakePostEngineOff > 15 ? 'var(--sr)' : 'var(--tm)' }}>
                    {mod.minutesAwakePostEngineOff > 0 ? `${mod.minutesAwakePostEngineOff.toFixed(0)}m` : '—'}
                  </span>
                  <WaveBar color={color} active={mod.status === 'alive' || mod.status === 'rogue'} />
                  <Badge label={mod.status} variant={STATUS_VARIANT[mod.status]} />
                </div>
              );
            })}
          </Card>
        )}

        {/* GMT800 module map reference */}
        <SectionHeader>GMT800 module address map</SectionHeader>
        <Card padding={0}>
          {[
            { addr: '0x10', name: 'PCM — Powertrain Control Module',            parasitic: false, note: 'Engine ECM. Should sleep ~2 min after engine-off.' },
            { addr: '0xE0', name: 'IPC — Instrument Panel Cluster',              parasitic: true,  note: 'Known GMT800 draw source (0.2–1.2 A). Check IPC connector C1/C2 and firewall ground.' },
            { addr: '0x28', name: 'BCM — Body Control Module',                   parasitic: true,  note: 'Primary bus coordinator. Draw: 0.3–0.8 A. Scan for B/U codes if rogue.' },
            { addr: '0x60', name: 'TCM — Transmission Control Module',           parasitic: false, note: '4L60-E controller. Should sleep with PCM.' },
            { addr: '0x40', name: 'EBCM — Electronic Brake Control Module (ABS)',parasitic: false, note: 'Wakes briefly on door open. Should sleep within 1 min.' },
            { addr: '0xA0', name: 'HVAC Control Module',                          parasitic: true,  note: 'Blend door actuator can draw ~0.1 A if module stays awake.' },
            { addr: '0xC0', name: 'Radio / Head Unit',                            parasitic: true,  note: 'Aftermarket radios a major draw source (0.2–1.5 A). Check memory wire.' },
          ].map(({ addr, name, parasitic, note }, i, arr) => (
            <div
              key={addr}
              style={{
                display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: 10,
                padding: '9px 12px', borderBottom: i < arr.length - 1 ? '1px solid var(--bg3)' : 'none',
                alignItems: 'flex-start',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tm)', paddingTop: 1 }}>{addr}</span>
              <div>
                <div style={{ fontSize: 12, color: 'var(--tw)', marginBottom: 3 }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', lineHeight: 1.5 }}>{note}</div>
              </div>
              {parasitic && <Badge label="Draw risk" variant="warn" />}
            </div>
          ))}
        </Card>

      </ScrollPane>
    </div>
  );
}
