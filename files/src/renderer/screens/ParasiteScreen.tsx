import React, { useState } from 'react';
import { useAppStore, selectBatteryVoltage, selectVoltageTrend, selectParasiteRiskScore, selectActiveDTCCount, selectDropMvPerMin } from '../store/appStore';
import { dischargeStatus } from '../logic/verdicts';
import {
  ScrollPane, SectionHeader, Grid, Card, Metric, Gauge, Badge, AlertBanner, Button, DataRow, EmptyState, Divider, VoltageTimeline,
} from '../components/layout/UIComponents';
import { TYPE, WEIGHT, NUMERIC, STATUS_TEXT, STATUS_FILL } from '../theme/theme';
import type { Status } from '../theme/theme';
import { FuseCircuit, FuseStatus } from '../../shared/types';

// ─── Risk score helpers ───────────────────────────────────────────────────────

function riskLabel(score: number): string {
  if (score >= 7) return 'High risk';
  if (score >= 4) return 'Moderate';
  if (score >= 1) return 'Low';
  return 'None detected';
}

/** Same cut-offs the legacy riskColor() used: >=7 crit, >=4 warn, else neutral. */
function riskStatus(score: number): Status {
  if (score >= 7) return 'crit';
  if (score >= 4) return 'warn';
  return 'neutral';
}

// ─── Fuse status helpers ─────────────────────────────────────────────────────

const FUSE_STATUS_TONE: Record<FuseStatus, Status> = {
  normal:      'ok',
  tested_ok:   'ok',
  suspect:     'warn',
  confirmed:   'crit',
  unknown:     'neutral',
};

const FUSE_STATUS_VARIANT: Record<FuseStatus, 'ok' | 'warn' | 'crit' | 'muted'> = {
  normal:      'ok',
  tested_ok:   'ok',
  suspect:     'warn',
  confirmed:   'crit',
  unknown:     'muted',
};

// ─── Fuse Panel ──────────────────────────────────────────────────────────────

function FusePanel({ fuses }: { fuses: FuseCircuit[] }): React.ReactElement {
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
      {fuses.map((f, i) => {
        const isOpen = expanded === f.id;
        const tint = f.status === 'confirmed' ? 'var(--crit-tint)' : f.status === 'suspect' ? 'var(--warn-tint)' : 'transparent';
        return (
          <React.Fragment key={f.id}>
            <div
              onClick={() => setExpanded(isOpen ? null : f.id)}
              className={isOpen ? undefined : 'row-hover'}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px', cursor: 'pointer',
                background: isOpen ? 'var(--fill)' : tint,
              }}
            >
              <span
                aria-hidden
                className={f.status === 'confirmed' ? 'pulse' : undefined}
                style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: STATUS_FILL[FUSE_STATUS_TONE[f.status]] }}
              />
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)', width: 40, flexShrink: 0 }}>{f.amperage}A</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYPE.body, color: 'var(--label)' }}>{f.name}</div>
                <div style={{ ...TYPE.caption, color: 'var(--label-3)' }}>
                  {f.feeds.slice(0, 2).join(' · ')}{f.feeds.length > 2 ? ` +${f.feeds.length - 2}` : ''}
                </div>
              </div>
              <span style={{
                ...TYPE.caption, ...NUMERIC, width: 70, textAlign: 'right', flexShrink: 0,
                color: f.estimatedDrawAmps && f.estimatedDrawAmps > 0.05 ? STATUS_TEXT.warn : 'var(--label-3)',
              }}>
                {f.estimatedDrawAmps ? `${(f.estimatedDrawAmps * 1000).toFixed(0)} mA` : '—'}
              </span>
              <Badge label={f.status.replace('_', ' ')} variant={FUSE_STATUS_VARIANT[f.status]} />
              <Button size="sm" onClick={e => { e.stopPropagation(); cycleStatus(f); }}>Cycle</Button>
            </div>
            {isOpen && (
              <div style={{ padding: '8px 12px 16px' }}>
                <SectionHeader>Circuit detail</SectionHeader>
                <div style={{ ...TYPE.body, color: 'var(--label)', marginTop: 8 }}>
                  <strong>Feeds:</strong> {f.feeds.join(', ')}
                </div>
                {f.notes && (
                  <div style={{ ...TYPE.body, color: 'var(--label)', marginTop: 4 }}><strong>Notes:</strong> {f.notes}</div>
                )}
                {f.relatedDTCs.length > 0 && (
                  <div style={{ ...TYPE.body, color: 'var(--label)', marginTop: 4 }}>
                    <strong>Related DTCs:</strong>{' '}
                    {f.relatedDTCs.map(c => (
                      <span key={c} style={{ ...NUMERIC, color: 'var(--crit-text)', marginRight: 8 }}>{c}</span>
                    ))}
                  </div>
                )}
                {f.relatedModules.length > 0 && (
                  <div style={{ ...TYPE.body, color: 'var(--label)', marginTop: 4 }}>
                    <strong>Related modules:</strong>{' '}
                    {f.relatedModules.map(m => (
                      <span key={m} style={{ ...NUMERIC, color: 'var(--accent-text)', marginRight: 8 }}>{m}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {i < fuses.length - 1 && <Divider />}
          </React.Fragment>
        );
      })}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
          {completed}/{checklist.length} steps completed
        </span>
        {passed > 0 && <Badge label={`${passed} passed`} variant="ok" />}
        {failed > 0 && <Badge label={`${failed} failed`} variant="crit" />}
      </div>
      <Card padding={0}>
        {checklist.map((item, i) => (
          <React.Fragment key={item.id}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 12px', minHeight: 32,
              background: item.completed ? (item.passed ? 'var(--ok-tint)' : 'var(--crit-tint)') : 'transparent',
            }}>
              <i
                aria-hidden
                className={`ti ${item.completed ? (item.passed ? 'ti-circle-check' : 'ti-circle-x') : 'ti-circle-dashed'}`}
                style={{
                  fontSize: 16, marginTop: 1, flexShrink: 0,
                  color: item.completed ? (item.passed ? 'var(--ok-text)' : 'var(--crit-text)') : 'var(--label-3)',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  ...TYPE.body, color: 'var(--label)',
                  opacity: item.completed ? 0.7 : 1,
                  textDecoration: item.completed ? 'line-through' : 'none',
                }}>
                  {item.step}. {item.description}
                </div>
                {item.completed && item.notes && (
                  <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginTop: 2 }}>Note: {item.notes}</div>
                )}
                {item.completed && item.timestamp && (
                  <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)', marginTop: 2 }}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
              {!item.completed && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                  <input
                    placeholder="Notes…"
                    value={noteInput[item.id] ?? ''}
                    onChange={e => setNoteInput({ ...noteInput, [item.id]: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    style={{ width: 130, height: 24 }}
                  />
                  <Button size="sm" variant="primary" onClick={() => toggle(item.id, true, noteInput[item.id] ?? '')}>
                    Pass
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => toggle(item.id, false, noteInput[item.id] ?? '')}>
                    Fail
                  </Button>
                </div>
              )}
            </div>
            {i < checklist.length - 1 && <Divider />}
          </React.Fragment>
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
        <React.Fragment key={c.address}>
          <div className="row-hover" style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)' }}>{c.address}</span>
              <span style={{ ...TYPE.body, fontWeight: WEIGHT.medium, color: 'var(--label)' }}>{c.component}</span>
              <Badge label={c.drawRange} variant={c.severity} />
            </div>
            <div style={{ ...TYPE.body, color: 'var(--label-2)', marginBottom: 4 }}>{c.description}</div>
            <div style={{ ...TYPE.body, color: 'var(--label)' }}>
              <strong>Fix:</strong> {c.fix}
            </div>
          </div>
          {i < culprits.length - 1 && <Divider />}
        </React.Fragment>
      ))}
      <Divider />
      <div style={{ padding: '8px 12px' }}>
        <span style={{ ...TYPE.caption, color: 'var(--label-3)' }}>Platform: {platform.name}</span>
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
    // A module that answers requests is awake, engine running or not
    if (hasCoolant) consumers.push({ name: 'ECM', draw: rpm > 0 ? '0.5–2 A' : 'awake (engine off)', status: 'active', source: 'PID 0105 responding' });
    if (hasMAF) consumers.push({ name: 'MAF sensor', draw: rpm > 0 ? '50–100 mA' : '0 mA', status: rpm > 0 ? 'active' : 'sleep', source: 'PID 0110 responding' });
  }

  if (!isConnected && modules.length === 0) {
    return (
      <Card>
        <EmptyState icon="ti-plug-connected-x" title="No power consumer data" message="Connect the adapter to detect active power consumers." />
      </Card>
    );
  }

  consumers.sort((a, b) => {
    const order = { rogue: 0, active: 1, sleep: 2 };
    return order[a.status] - order[b.status];
  });

  const variant: Record<'rogue' | 'active' | 'sleep', 'crit' | 'warn' | 'ok'> = { rogue: 'crit', active: 'warn', sleep: 'ok' };

  return (
    <Card padding={0}>
      {consumers.map((c, i) => (
        <DataRow
          key={`${c.name}-${i}`}
          name={c.name}
          subtext={c.source}
          value={c.draw}
          badge={<Badge label={c.status} variant={variant[c.status]} />}
        />
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
  const dropMv       = useAppStore(selectDropMvPerMin);
  const platform     = useAppStore(s => s.platform);
  const isGMT800     = platform.id === 'gmt800';

  const rogueCount   = modules.filter(m => m.status === 'rogue').length;
  const suspectCount = modules.filter(m => m.status === 'suspect').length;
  const confirmedFuses = [...ipfbFuses, ...uhfrcFuses].filter(f => f.status === 'confirmed').length;
  const suspectFuses   = [...ipfbFuses, ...uhfrcFuses].filter(f => f.status === 'suspect').length;

  const drainStatus = dischargeStatus(dropMv);

  return (
    <ScrollPane>

      {/* Alerts */}
      {riskScore >= 7 && (
        <AlertBanner message={`Parasitic draw risk score: ${riskScore.toFixed(1)}/10 — active investigation recommended.`} variant="crit" />
      )}
      {rogueCount > 0 && (
        <AlertBanner message={`${rogueCount} rogue module${rogueCount > 1 ? 's' : ''} detected — awake after engine-off. Check the Module monitor screen.`} variant="crit" />
      )}
      {confirmedFuses > 0 && (
        <AlertBanner message={`${confirmedFuses} fuse circuit${confirmedFuses > 1 ? 's' : ''} confirmed as draw source.`} variant="warn" />
      )}

      {/* ── Hero row — risk overview ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8 }}>
        <Metric
          size="hero"
          label="Parasitic draw risk score"
          value={riskScore.toFixed(1)}
          unit="/ 10"
          subtext={riskLabel(riskScore)}
          status={riskStatus(riskScore)}
          spark={{ pid: 'ATRV', color: 'var(--purple)' }}
          staleAt={batteryAt}
        />
        <Metric
          size="hero"
          label="Battery voltage"
          value={batteryV > 0 ? batteryV.toFixed(2) : '—'}
          unit="V"
          status={batteryV > 0 ? (batteryV < 12.0 ? 'crit' : batteryV < 12.4 ? 'warn' : 'neutral') : 'neutral'}
          spark={{ pid: 'ATRV', color: 'var(--purple)' }}
          staleAt={batteryAt}
          subtext={voltageTrend === 'stable' ? 'Stable' : voltageTrend === 'dropping' ? 'Dropping' : 'Critical drop'}
        />
        <Metric
          size="hero"
          label="Discharge rate"
          value={dropMv === null ? '—' : Math.max(dropMv, 0).toFixed(1)}
          unit="mV/min"
          subtext={dropMv === null ? 'Needs 10 min at rest' : drainStatus === 'crit' ? 'High — active draw' : drainStatus === 'warn' ? 'Moderate drain' : 'Normal'}
          status={drainStatus}
          spark={{ pid: 'ATRV', color: 'var(--warn)' }}
        />
      </div>

      {/* ── Risk breakdown ────────────────────────────────────────────── */}
      <SectionHeader>Risk breakdown</SectionHeader>
      <Grid cols={4}>
        <Gauge size="compact" label="Risk" value={Math.round(riskScore)} max={10} unit="/ 10" />
        <Metric
          size="compact"
          label="Rogue modules"
          value={rogueCount}
          status={rogueCount > 0 ? 'crit' : 'neutral'}
          subtext={suspectCount > 0 ? `${suspectCount} suspect` : 'All sleeping'}
          barPercent={rogueCount > 0 ? Math.min(100, rogueCount * 33) : 0}
        />
        <Metric
          size="compact"
          label="Active DTCs"
          value={activeDTCs}
          status={activeDTCs > 0 ? 'warn' : 'neutral'}
          subtext="Stored codes the ECU reports as active"
        />
        <Metric
          size="compact"
          label="Fuse circuits"
          value={confirmedFuses > 0 ? `${confirmedFuses} confirmed` : suspectFuses > 0 ? `${suspectFuses} suspect` : 'All clear'}
          status={confirmedFuses > 0 ? 'crit' : suspectFuses > 0 ? 'warn' : 'neutral'}
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
      {/* GM fuse layouts only exist for platforms that define them */}
      {ipfbFuses.length > 0 && <SectionHeader>Instrument panel fuse block (IPFB)</SectionHeader>}
      {ipfbFuses.length > 0 && <FusePanel fuses={ipfbFuses} />}

      {/* ── Fuse panel — UHFRC ────────────────────────────────────────── */}
      {uhfrcFuses.length > 0 && <SectionHeader>Under-hood fuse relay center (UHFRC)</SectionHeader>}
      {uhfrcFuses.length > 0 && <FusePanel fuses={uhfrcFuses} />}

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
