import React, { useState, useMemo } from 'react';
import { useAppStore, selectBatteryVoltage, selectVoltageTrend, selectParasiteRiskScore, selectActiveDTCCount } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Grid, Card, DenseMetricTile, CompactArcGauge,
  HeroCard, Badge, AlertBanner, Button, Sparkline,
} from '../components/layout/UIComponents';
import { FuseCircuit, FuseStatus, ParasiticChecklistItem } from '../../shared/types';

// ─── Risk score color helper ─────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score >= 7) return 'var(--sr)';
  if (score >= 4) return 'var(--sa)';
  return 'var(--sg)';
}

function riskLabel(score: number): string {
  if (score >= 7) return 'High risk';
  if (score >= 4) return 'Moderate';
  if (score >= 1) return 'Low';
  return 'None detected';
}

// ─── Fuse status helpers ─────────────────────────────────────────────────────

const FUSE_STATUS_COLOR: Record<FuseStatus, string> = {
  normal:      'var(--sg)',
  tested_ok:   'var(--sg)',
  suspect:     'var(--sa)',
  confirmed:   'var(--sr)',
  unknown:     'var(--tm)',
};

const FUSE_STATUS_VARIANT: Record<FuseStatus, 'ok' | 'warn' | 'crit' | 'muted'> = {
  normal:      'ok',
  tested_ok:   'ok',
  suspect:     'warn',
  confirmed:   'crit',
  unknown:     'muted',
};

// ─── Voltage Timeline (shared with ElectricalScreen pattern) ─────────────────

function VoltageTimeline(): React.ReactElement {
  const history = useAppStore(s => s.history['ATRV'] ?? []);
  const recent  = history.slice(-120);

  const REFS = [
    { v: 12.6, label: '12.6 Full', color: 'var(--sg)' },
    { v: 12.4, label: '12.4 50%',  color: 'var(--sa)' },
    { v: 12.0, label: '12.0 Crit', color: 'var(--sr)' },
    { v: 11.8, label: '11.8 Dead', color: 'rgba(255,36,64,0.5)' },
  ];

  const W = 500, H = 100;
  const V_MIN = 11.6, V_MAX = 13.0;
  const yOf = (v: number) => H - ((v - V_MIN) / (V_MAX - V_MIN)) * H;

  if (recent.length < 2) {
    return (
      <div style={{ height: H + 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg4)', borderRadius: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--tm)' }}>Collecting voltage history…</span>
      </div>
    );
  }

  const values = recent.map(r => typeof r.value === 'number' ? r.value : 12.6);
  const pts    = values.map((v, i) => `${(i / (values.length - 1)) * W},${yOf(v)}`).join(' ');
  const lastV  = values[values.length - 1];
  const firstV = values[0];
  const drift  = lastV - firstV;
  const lineColor = lastV < 12.0 ? 'var(--sr)' : lastV < 12.4 ? 'var(--sa)' : '#9B8AFF';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg width="100%" viewBox={`-40 -8 ${W + 60} ${H + 20}`} style={{ overflow: 'visible' }}>
        {REFS.map(({ v, label, color }) => (
          <g key={v}>
            <line x1={0} y1={yOf(v)} x2={W} y2={yOf(v)} stroke={color} strokeWidth="0.7" strokeDasharray="4,3" />
            <text x={W + 4} y={yOf(v) + 4} fontSize="8" fill={color} fontFamily="JetBrains Mono, Roboto Mono, monospace">{label}</text>
          </g>
        ))}
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {values.length > 0 && (
          <circle cx={W} cy={yOf(lastV)} r="4" fill={lineColor} stroke="var(--bg2)" strokeWidth="1.5" />
        )}
        {[11.6, 11.8, 12.0, 12.2, 12.4, 12.6, 12.8, 13.0].map(v => (
          <text key={v} x={-4} y={yOf(v) + 3} fontSize="8" fill="var(--tm)" fontFamily="JetBrains Mono, Roboto Mono, monospace" textAnchor="end">{v}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tm)', fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}>
        <span>{recent.length} samples · {Math.round(recent.length * 0.5 / 60)} min window</span>
        <span style={{ color: drift < -0.05 ? 'var(--sr)' : drift < -0.02 ? 'var(--sa)' : 'var(--sg)' }}>
          Drift: {drift >= 0 ? '+' : ''}{drift.toFixed(3)} V
        </span>
        <span style={{ color: lineColor }}>Current: {lastV.toFixed(3)} V</span>
      </div>
    </div>
  );
}

// ─── Fuse Panel ──────────────────────────────────────────────────────────────

function FusePanel({ title, fuses }: { title: string; fuses: FuseCircuit[] }): React.ReactElement {
  const updateFuse = useAppStore(s => s.updateFuse);
  const [expanded, setExpanded] = useState<string | null>(null);

  const cycleStatus = (f: FuseCircuit) => {
    const order: FuseStatus[] = ['unknown', 'tested_ok', 'suspect', 'confirmed', 'normal'];
    const idx = order.indexOf(f.status);
    const next = order[(idx + 1) % order.length];
    updateFuse(f.id, { status: next });
  };

  return (
    <Card padding={0}>
      <div style={{
        padding: '8px 12px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        display: 'grid', gridTemplateColumns: '36px 1fr 50px 90px 70px', gap: 8, alignItems: 'center',
      }}>
        {['Amp', 'Circuit', 'Draw', 'Status', 'Action'].map(h => (
          <span key={h} style={{
            fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
            letterSpacing: 1.2, textTransform: 'uppercase' as const, color: 'var(--tm)',
          }}>{h}</span>
        ))}
      </div>
      {fuses.map((f, i) => (
        <React.Fragment key={f.id}>
          <div
            style={{
              display: 'grid', gridTemplateColumns: '36px 1fr 50px 90px 70px', gap: 8,
              padding: '8px 12px', alignItems: 'center',
              borderBottom: i < fuses.length - 1 || expanded === f.id ? '1px solid var(--bg3)' : 'none',
              background: f.status === 'confirmed' ? 'rgba(255,36,64,0.04)' : f.status === 'suspect' ? 'rgba(255,179,0,0.04)' : 'transparent',
              cursor: 'pointer', transition: 'background 0.1s',
            }}
            onClick={() => setExpanded(expanded === f.id ? null : f.id)}
            onMouseEnter={e => { if (f.status === 'unknown' || f.status === 'normal' || f.status === 'tested_ok') (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = f.status === 'confirmed' ? 'rgba(255,36,64,0.04)' : f.status === 'suspect' ? 'rgba(255,179,0,0.04)' : 'transparent'; }}
          >
            <span style={{
              fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12,
              color: FUSE_STATUS_COLOR[f.status], fontWeight: 600,
            }}>
              {f.amperage}A
            </span>
            <div>
              <div style={{ fontSize: 12, color: 'var(--tw)' }}>{f.name}</div>
              <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 1 }}>
                {f.feeds.slice(0, 2).join(' · ')}{f.feeds.length > 2 ? ` +${f.feeds.length - 2}` : ''}
              </div>
            </div>
            <span style={{
              fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
              color: f.estimatedDrawAmps && f.estimatedDrawAmps > 0.05 ? 'var(--sa)' : 'var(--tm)',
            }}>
              {f.estimatedDrawAmps ? `${(f.estimatedDrawAmps * 1000).toFixed(0)}mA` : '—'}
            </span>
            <Badge label={f.status.replace('_', ' ')} variant={FUSE_STATUS_VARIANT[f.status]} />
            <Button size="sm" onClick={(e) => { e.stopPropagation(); cycleStatus(f); }}>
              Cycle
            </Button>
          </div>
          {expanded === f.id && (
            <div style={{
              padding: '10px 12px 10px 48px', background: 'var(--bg3)',
              borderBottom: '2px solid var(--br)', fontSize: 11, color: 'var(--tm)', lineHeight: 1.7,
            }}>
              <div style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase' as const, color: 'var(--tm)', marginBottom: 4 }}>
                Circuit detail
              </div>
              <div><strong style={{ color: 'var(--tw)' }}>Feeds:</strong> {f.feeds.join(', ')}</div>
              {f.notes && <div style={{ marginTop: 4 }}><strong style={{ color: 'var(--tw)' }}>Notes:</strong> {f.notes}</div>}
              {f.relatedDTCs.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong style={{ color: 'var(--tw)' }}>Related DTCs:</strong>{' '}
                  {f.relatedDTCs.map(c => (
                    <span key={c} style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", color: 'var(--sr)', marginRight: 6 }}>{c}</span>
                  ))}
                </div>
              )}
              {f.relatedModules.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <strong style={{ color: 'var(--tw)' }}>Related modules:</strong>{' '}
                  {f.relatedModules.map(m => (
                    <span key={m} style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", color: 'var(--gb)', marginRight: 6 }}>{m}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </Card>
  );
}

// ─── Checklist ───────────────────────────────────────────────────────────────

function ChecklistSection(): React.ReactElement {
  const checklist = useAppStore(s => s.checklist);
  const toggle    = useAppStore(s => s.toggleChecklistItem);
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});

  const completed = checklist.filter(c => c.completed).length;
  const passed    = checklist.filter(c => c.passed === true).length;
  const failed    = checklist.filter(c => c.passed === false).length;

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
        fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: 'var(--tm)',
      }}>
        <span>{completed}/{checklist.length} steps completed</span>
        {passed > 0 && <Badge label={`${passed} passed`} variant="ok" />}
        {failed > 0 && <Badge label={`${failed} failed`} variant="crit" />}
      </div>
      <Card padding={0}>
        {checklist.map((item, i) => (
          <div key={item.id} style={{
            padding: '10px 12px',
            borderBottom: i < checklist.length - 1 ? '1px solid var(--bg3)' : 'none',
            background: item.completed
              ? item.passed ? 'rgba(0,230,118,0.03)' : 'rgba(255,36,64,0.03)'
              : 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{
                fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
                color: item.completed ? (item.passed ? 'var(--sg)' : 'var(--sr)') : 'var(--pp)',
                width: 24, flexShrink: 0, paddingTop: 1,
              }}>
                {item.completed ? (item.passed ? '✓' : '✗') : `${item.step}.`}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 12, color: 'var(--tw)', lineHeight: 1.5,
                  opacity: item.completed ? 0.7 : 1,
                  textDecoration: item.completed ? 'line-through' : 'none',
                }}>
                  {item.description}
                </div>
                {item.completed && item.notes && (
                  <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 3, fontStyle: 'italic' }}>
                    Note: {item.notes}
                  </div>
                )}
                {item.completed && item.timestamp && (
                  <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 2, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
              {!item.completed && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <input
                    placeholder="Notes…"
                    value={noteInput[item.id] ?? ''}
                    onChange={e => setNoteInput({ ...noteInput, [item.id]: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: 120, padding: '3px 6px', fontSize: 10,
                      background: 'var(--bg4)', border: '2px solid var(--br)',
                      borderRadius: 0, color: 'var(--tw)',
                      fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
                    }}
                  />
                  <Button size="sm" variant="primary" onClick={() => { toggle(item.id, true, noteInput[item.id] ?? ''); }}>
                    Pass
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => { toggle(item.id, false, noteInput[item.id] ?? ''); }}>
                    Fail
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

// ─── Known Culprits Knowledge Base ───────────────────────────────────────────

function KnownCulprits(): React.ReactElement {
  const platform = useAppStore(s => s.platform);

  const culprits = [
    {
      component: 'Instrument Panel Cluster (IPC)',
      address: '0xE0',
      drawRange: '0.2–1.2 A',
      severity: 'crit' as const,
      description: 'The #1 GMT800 parasitic draw cause. The IPC backlight driver fails to fully power down, drawing 200mA–1.2A continuously. Intermittent — may not draw every night.',
      fix: 'Inspect IPC connector pins C1/C2 for corrosion. Check firewall ground strap resistance (target: < 0.1 Ω). Known TSB #04-06-03-009.',
    },
    {
      component: 'Body Control Module (BCM)',
      address: '0x28',
      drawRange: '0.3–0.8 A',
      severity: 'warn' as const,
      description: 'BCM stays awake due to stuck door jamb switches, dome light switch left in "on" position, or internal fault. Also triggered by aftermarket alarm installations.',
      fix: 'Scan BCM for B/U codes. Check all 4 door jamb switches with a meter. Verify dome light override switch is in "door" position.',
    },
    {
      component: 'Radio / Head Unit',
      address: '0xC0',
      drawRange: '0.2–1.5 A',
      severity: 'warn' as const,
      description: 'Aftermarket radios installed with the memory wire on constant battery instead of a switched circuit. Factory Delco radios rarely cause draw unless internal fault.',
      fix: 'Verify aftermarket radio memory wire is on ACC, not constant B+. Pull the RADIO fuse for 24h test.',
    },
    {
      component: 'HVAC Blend Door Actuator',
      address: '0xA0',
      drawRange: '0.05–0.15 A',
      severity: 'muted' as const,
      description: 'The blend door actuator can hunt (cycle continuously) if the calibration is lost or the actuator gear is stripped. Small but constant draw.',
      fix: 'Pull the HVAC fuse, listen for clicking behind the dash. Recalibrate by disconnecting battery for 30s then running HVAC from full hot to full cold.',
    },
  ];

  return (
    <Card padding={0}>
      {culprits.map((c, i) => (
        <div key={c.address} style={{
          padding: '10px 12px',
          borderBottom: i < culprits.length - 1 ? '1px solid var(--bg3)' : 'none',
          transition: 'background 0.1s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: 'var(--gb)' }}>{c.address}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tw)' }}>{c.component}</span>
            <Badge label={c.drawRange} variant={c.severity} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--tm)', lineHeight: 1.6, marginBottom: 4 }}>
            {c.description}
          </div>
          <div style={{ fontSize: 11, color: 'var(--sg)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--tw)' }}>Fix:</strong> {c.fix}
          </div>
        </div>
      ))}
      <div style={{
        padding: '6px 12px', background: 'var(--bg4)',
        fontSize: 10, color: 'var(--tm)', fontStyle: 'italic',
      }}>
        Platform: {platform.name}
      </div>
    </Card>
  );
}

// ─── Active Power Consumers ─────────────────────────────────────────────────

function PowerConsumers(): React.ReactElement {
  const modules = useAppStore(s => s.modules);
  const liveData = useAppStore(s => s.liveData);
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const isConnected = connectionStatus === 'connected';

  const consumers: Array<{ name: string; draw: string; status: 'active' | 'sleep' | 'rogue'; source: string }> = [];

  // Only show module-sourced consumers if modules have been detected
  for (const m of modules) {
    const draw = m.status === 'rogue' ? '50–1200 mA' : m.status === 'suspect' ? '10–50 mA' : '< 5 mA';
    consumers.push({ name: m.name, draw, status: m.status === 'rogue' ? 'rogue' : m.status === 'suspect' ? 'active' : 'sleep', source: `Module ${m.address}` });
  }

  if (isConnected) {
    // OBD adapter is always drawing when connected
    consumers.push({ name: 'OBD-II adapter', draw: '30–60 mA', status: 'active', source: 'Adapter' });

    // Engine-running systems — derive from RPM PID
    const rpm = typeof liveData['010C']?.value === 'number' ? liveData['010C'].value as number : 0;
    if (rpm > 0) {
      consumers.push({ name: 'Fuel pump relay', draw: '5–8 A', status: 'active', source: 'Engine running' });
      consumers.push({ name: 'Ignition coils', draw: '3–5 A', status: 'active', source: 'Engine running' });
      consumers.push({ name: 'Fuel injectors', draw: '1–4 A', status: 'active', source: 'Engine running' });
    }

    // Live-detected subsystems
    const hasCoolant = typeof liveData['0105']?.value === 'number';
    const hasMAF = typeof liveData['0110']?.value === 'number';
    if (hasCoolant) consumers.push({ name: 'ECM', draw: rpm > 0 ? '0.5–2 A' : '3–8 mA', status: rpm > 0 ? 'active' : 'sleep', source: 'PID 0105 responding' });
    if (hasMAF) consumers.push({ name: 'MAF sensor', draw: rpm > 0 ? '50–100 mA' : '0 mA', status: rpm > 0 ? 'active' : 'sleep', source: 'PID 0110 responding' });
  }

  if (!isConnected && modules.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--tm)', fontSize: 12 }}>
          <i className="ti ti-plug-connected-x" style={{ fontSize: 20, display: 'block', marginBottom: 6 }} />
          Connect to adapter to detect active power consumers
        </div>
      </Card>
    );
  }

  consumers.sort((a, b) => {
    const order = { rogue: 0, active: 1, sleep: 2 };
    return order[a.status] - order[b.status];
  });

  const statusColor = { rogue: 'var(--sr)', active: 'var(--sa)', sleep: 'var(--sg)' };
  const statusIcon  = { rogue: 'ti-alert-triangle', active: 'ti-bolt', sleep: 'ti-zzz' };

  return (
    <Card padding={0}>
      <div style={{
        padding: '8px 12px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        display: 'grid', gridTemplateColumns: '1fr 90px 70px 90px', gap: 8,
      }}>
        {['Consumer', 'Est. Draw', 'State', 'Source'].map(h => (
          <span key={h} style={{
            fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
            letterSpacing: 1.2, textTransform: 'uppercase' as const, color: 'var(--tm)',
          }}>{h}</span>
        ))}
      </div>
      {consumers.map((c, i) => (
        <div key={`${c.name}-${i}`} style={{
          display: 'grid', gridTemplateColumns: '1fr 90px 70px 90px', gap: 8,
          padding: '6px 12px', alignItems: 'center',
          borderBottom: i < consumers.length - 1 ? '1px solid var(--bg3)' : 'none',
          background: c.status === 'rogue' ? 'rgba(255,59,80,0.04)' : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tw)' }}>
            <i className={`ti ${statusIcon[c.status]}`} style={{ fontSize: 12, color: statusColor[c.status] }} />
            {c.name}
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: statusColor[c.status] }}>{c.draw}</span>
          <Badge label={c.status} variant={c.status === 'rogue' ? 'crit' : c.status === 'active' ? 'warn' : 'ok'} />
          <span style={{ fontSize: 10, color: 'var(--tm)' }}>{c.source}</span>
        </div>
      ))}
    </Card>
  );
}

// ─── ParasiteScreen ──────────────────────────────────────────────────────────

export function ParasiteScreen(): React.ReactElement {
  const batteryV     = useAppStore(selectBatteryVoltage);
  const batteryAt    = useAppStore(s => s.liveData['ATRV']?.timestamp);
  const voltageTrend = useAppStore(selectVoltageTrend);
  const riskScore    = useAppStore(selectParasiteRiskScore);
  const activeDTCs   = useAppStore(selectActiveDTCCount);
  const modules      = useAppStore(s => s.modules);
  const ipfbFuses    = useAppStore(s => s.ipfbFuses);
  const uhfrcFuses   = useAppStore(s => s.uhfrcFuses);
  const history      = useAppStore(s => s.history['ATRV'] ?? []);
  const platform     = useAppStore(s => s.platform);
  const isGMT800     = platform.id === 'gmt800';

  const rogueCount   = modules.filter(m => m.status === 'rogue').length;
  const suspectCount = modules.filter(m => m.status === 'suspect').length;
  const confirmedFuses = [...ipfbFuses, ...uhfrcFuses].filter(f => f.status === 'confirmed').length;
  const suspectFuses   = [...ipfbFuses, ...uhfrcFuses].filter(f => f.status === 'suspect').length;

  const voltDropRate = useMemo(() => {
    if (history.length < 10) return 0;
    const slice = history.slice(-10);
    const dt    = (slice[slice.length - 1].timestamp - slice[0].timestamp) / 60000;
    const dv    = (slice[0].value as number) - (slice[slice.length - 1].value as number);
    return dt > 0 ? dv / dt : 0;
  }, [history]);

  return (
    <ScrollPane>

      {/* Alerts */}
      {riskScore >= 7 && (
        <AlertBanner message={`Parasitic draw risk score: ${riskScore.toFixed(1)}/10 — active investigation recommended.`} variant="crit" />
      )}
      {rogueCount > 0 && (
        <AlertBanner message={`${rogueCount} rogue module${rogueCount > 1 ? 's' : ''} detected — awake after engine-off. Check Module Wake screen.`} variant="crit" />
      )}
      {confirmedFuses > 0 && (
        <AlertBanner message={`${confirmedFuses} fuse circuit${confirmedFuses > 1 ? 's' : ''} confirmed as draw source.`} variant="warn" />
      )}

      {/* ── Hero row — risk overview ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <HeroCard
          label="Parasitic draw risk score"
          value={riskScore.toFixed(1)}
          unit="/ 10"
          subtext={riskLabel(riskScore)}
          valueColor={riskColor(riskScore)}
          accentBorder={riskColor(riskScore)}
          pid="ATRV"
          sparkColor="#9B8AFF"
          staleAt={batteryAt}
        />
        <HeroCard
          label="Battery voltage"
          value={batteryV > 0 ? batteryV.toFixed(2) : '—'}
          unit="V"
          valueColor={batteryV < 12.0 ? 'var(--sr)' : batteryV < 12.4 ? 'var(--sa)' : '#9B8AFF'}
          pid="ATRV"
          sparkColor="#9B8AFF"
          staleAt={batteryAt}
          subtext={voltageTrend === 'stable' ? 'Stable' : voltageTrend === 'dropping' ? 'Dropping' : 'Critical drop'}
        />
        <HeroCard
          label="Discharge rate"
          value={voltDropRate > 0 ? `${(voltDropRate * 1000).toFixed(1)}` : '—'}
          unit="mV/min"
          subtext={voltDropRate > 5 ? 'High — active draw' : voltDropRate > 1 ? 'Moderate drain' : 'Normal'}
          valueColor={voltDropRate > 5 ? 'var(--sr)' : voltDropRate > 1 ? 'var(--sa)' : 'var(--sg)'}
          pid="ATRV"
          sparkColor="var(--sa)"
        />
      </div>

      {/* ── Risk breakdown ────────────────────────────────────────────── */}
      <SectionHeader>Risk breakdown</SectionHeader>
      <Grid cols={4}>
        <CompactArcGauge label="Risk" value={Math.round(riskScore)} max={10} unit="/ 10" color={riskColor(riskScore)} />
        <DenseMetricTile
          label="Rogue modules"
          value={rogueCount}
          valueColor={rogueCount > 0 ? 'var(--sr)' : 'var(--sg)'}
          subtext={suspectCount > 0 ? `${suspectCount} suspect` : 'All sleeping'}
          barPercent={rogueCount > 0 ? Math.min(100, rogueCount * 33) : 0}
          barColor="var(--sr)"
        />
        <DenseMetricTile
          label="Active DTCs"
          value={activeDTCs}
          valueColor={activeDTCs > 0 ? 'var(--sa)' : 'var(--sg)'}
          subtext="Body (B) & network (U) weighted"
        />
        <DenseMetricTile
          label="Fuse circuits"
          value={confirmedFuses > 0 ? `${confirmedFuses} confirmed` : suspectFuses > 0 ? `${suspectFuses} suspect` : 'All clear'}
          valueColor={confirmedFuses > 0 ? 'var(--sr)' : suspectFuses > 0 ? 'var(--sa)' : 'var(--sg)'}
          subtext={`${ipfbFuses.length + uhfrcFuses.length} total circuits`}
        />
      </Grid>

      {/* ── Power consumers ─────────────────────────────────────────── */}
      <SectionHeader>Active power consumers</SectionHeader>
      <PowerConsumers />

      {/* ── Voltage timeline ──────────────────────────────────────────── */}
      <SectionHeader>Battery voltage timeline</SectionHeader>
      <Card padding={12}>
        <VoltageTimeline />
      </Card>

      {/* ── Guided parasitic draw protocol ────────────────────────────── */}
      <SectionHeader>Parasitic draw protocol — step-by-step</SectionHeader>
      <ChecklistSection />

      {/* ── Fuse panel — IPFB ─────────────────────────────────────────── */}
      <SectionHeader>Instrument panel fuse block (IPFB)</SectionHeader>
      <FusePanel title="IPFB" fuses={ipfbFuses} />

      {/* ── Fuse panel — UHFRC ────────────────────────────────────────── */}
      <SectionHeader>Under-hood fuse relay center (UHFRC)</SectionHeader>
      <FusePanel title="UHFRC" fuses={uhfrcFuses} />

      {/* ── Known culprits — platform-specific ───────────────────────── */}
      {isGMT800 && (
        <>
          <SectionHeader>Known culprits — {platform.name}</SectionHeader>
          <KnownCulprits />
        </>
      )}

    </ScrollPane>
  );
}
