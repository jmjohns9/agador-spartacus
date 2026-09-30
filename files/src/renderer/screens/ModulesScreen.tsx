import React from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Card, Badge, AlertBanner, Button, Divider, EmptyState,
} from '../components/layout/UIComponents';
import { TYPE, NUMERIC } from '../theme/theme';
import { ModuleStatus } from '../../shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<ModuleStatus, 'ok' | 'crit' | 'warn' | 'info' | 'muted'> = {
  alive:    'ok',
  sleeping: 'info',
  rogue:    'crit',
  suspect:  'warn',
  unknown:  'muted',
};

const STATUS_LABEL: Record<ModuleStatus, string> = {
  alive:    'Alive',
  sleeping: 'Sleeping',
  rogue:    'Rogue',
  suspect:  'Suspect',
  unknown:  'Unknown',
};

// ─── ModulesScreen ─────────────────────────────────────────────────────────────

export function ModulesScreen(): React.ReactElement {
  const modules     = useAppStore(s => s.modules);
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const platform    = useAppStore(s => s.platform);
  const isGMT800    = platform.id === 'gmt800';
  const updateModule = useAppStore(s => s.updateModule);

  const handleScan = () => {
    // Seed the known module map for this platform (empty for generic vehicles —
    // those are discovered from live bus responses), then poll the bus.
    // Only add modules not already listed: re-seeding reset every status to "unknown"
    platform.modules.filter(m => !modules.some(x => x.address === m.address)).forEach(m => updateModule(m));
    if (window.electronAPI) window.electronAPI.checkModules();
  };

  const rogueModules   = modules.filter(m => m.status === 'rogue');
  const suspectModules = modules.filter(m => m.status === 'suspect');
  const aliveModules   = modules.filter(m => m.status === 'alive');
  const sleepingModules = modules.filter(m => m.status === 'sleeping');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'var(--grouped)',
        boxShadow: 'inset 0 -1px 0 var(--separator)',
        flexShrink: 0,
      }}>
        <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)', flex: 1 }}>
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
            message={`Rogue module: ${m.name} (${m.address}) has been awake ${m.minutesAwakePostEngineOff.toFixed(0)} min after engine-off — parasitic draw suspect`}
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
            <EmptyState
              icon="ti-cpu-off"
              title="No module data"
              message={platform.modules.length > 0
                ? 'Connect the adapter and click Scan modules to poll the bus.'
                : 'No known module map for this vehicle — modules will appear as they respond on the bus after connecting.'}
            />
          </Card>
        ) : (
          <Card padding={0}>
            {/* Header row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '50px 1fr 80px 80px 90px 90px',
              gap: 8, padding: '4px 12px',
              background: 'var(--fill)',
            }}>
              {['Addr', 'Module', 'Latency', 'Awake', 'Bus', 'Status'].map(h => (
                <span key={h} style={{ ...TYPE.caption, color: 'var(--label-3)' }}>{h}</span>
              ))}
            </div>
            <Divider />
            {modules.map((mod, i) => (
              <React.Fragment key={mod.address}>
                <div
                  className="row-hover"
                  style={{
                    display: 'grid', gridTemplateColumns: '50px 1fr 80px 80px 90px 90px',
                    gap: 8, padding: '8px 12px', alignItems: 'center',
                    background: mod.status === 'rogue' ? 'var(--crit-tint)' : 'transparent',
                  }}
                >
                  <span style={{ ...TYPE.caption, ...NUMERIC, color: mod.status === 'rogue' ? 'var(--crit-text)' : 'var(--label-3)' }}>
                    {mod.address}
                  </span>
                  <span style={{ ...TYPE.body, color: 'var(--label)' }}>{mod.name}</span>
                  <span style={{ ...TYPE.caption, ...NUMERIC, color: mod.latencyMs > 50 ? 'var(--warn-text)' : 'var(--label-2)' }}>
                    {mod.latencyMs > 0 ? `${mod.latencyMs} ms` : '—'}
                  </span>
                  <span style={{ ...TYPE.caption, ...NUMERIC, color: mod.minutesAwakePostEngineOff > 15 ? 'var(--crit-text)' : 'var(--label-2)' }}>
                    {mod.minutesAwakePostEngineOff > 0 ? `${mod.minutesAwakePostEngineOff.toFixed(0)}m` : '—'}
                  </span>
                  <Badge
                    label={mod.status === 'rogue' ? 'Rogue' : mod.status === 'alive' ? 'Awake' : mod.status === 'sleeping' ? 'Asleep' : mod.status === 'suspect' ? 'Awake?' : 'Unknown'}
                    variant={mod.status === 'rogue' ? 'crit' : mod.status === 'alive' ? 'ok' : mod.status === 'suspect' ? 'warn' : 'muted'}
                  />
                  <Badge label={STATUS_LABEL[mod.status]} variant={STATUS_VARIANT[mod.status]} />
                </div>
                {i < modules.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Card>
        )}

        {/* Platform-specific module address map — GMT800 only */}
        {isGMT800 && (
          <>
            <SectionHeader>GMT800 module address map</SectionHeader>
            <Card padding={0}>
              {[
                { addr: '0x10', name: 'PCM — Powertrain Control Module',            parasitic: false, note: 'Engine ECM. Should sleep ~2 min after engine-off.' },
                { addr: '0xE0', name: 'IPC — Instrument Panel Cluster',              parasitic: true,  note: 'Known draw source (0.2–1.2 A). Check IPC connector C1/C2 and firewall ground.' },
                { addr: '0x28', name: 'BCM — Body Control Module',                   parasitic: true,  note: 'Primary bus coordinator. Draw: 0.3–0.8 A. Scan for B/U codes if rogue.' },
                { addr: '0x60', name: 'TCM — Transmission Control Module',           parasitic: false, note: '4L60-E controller. Should sleep with PCM.' },
                { addr: '0x40', name: 'EBCM — Electronic Brake Control Module (ABS)',parasitic: false, note: 'Wakes briefly on door open. Should sleep within 1 min.' },
                { addr: '0xA0', name: 'HVAC Control Module',                          parasitic: true,  note: 'Blend door actuator can draw ~0.1 A if module stays awake.' },
                { addr: '0xC0', name: 'Radio / Head Unit',                            parasitic: true,  note: 'Aftermarket radios a major draw source (0.2–1.5 A). Check memory wire.' },
              ].map(({ addr, name, parasitic, note }, i, arr) => (
                <React.Fragment key={addr}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: 8,
                    padding: '8px 12px', alignItems: 'flex-start',
                  }}>
                    <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)', paddingTop: 1 }}>{addr}</span>
                    <div>
                      <div style={{ ...TYPE.body, color: 'var(--label)', marginBottom: 4 }}>{name}</div>
                      <div style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{note}</div>
                    </div>
                    {parasitic && <Badge label="Draw risk" variant="warn" />}
                  </div>
                  {i < arr.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </Card>
          </>
        )}

      </ScrollPane>
    </div>
  );
}
