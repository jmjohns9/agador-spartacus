import React, { useState } from 'react';
import { useAppStore, selectBatteryVoltage, selectActiveDTCCount, selectParasiteRiskScore, selectVoltageTrend } from '../store/appStore';
import { FreezeFrame, ReportPayload, LogEntry } from '../../shared/types';
import {
  ScrollPane, SectionHeader, Grid, Card, DenseMetricTile, CompactArcGauge, Badge, AlertBanner,
} from '../components/layout/UIComponents';

// ─── Readiness monitor definitions ────────────────────────────────────────────

const READINESS_MONITORS = [
  { id: '0101_mis', name: 'Misfire monitor',              pid: '0101', bit: 0 },
  { id: '0101_fuel', name: 'Fuel system monitor',         pid: '0101', bit: 1 },
  { id: '0101_comp', name: 'Comprehensive components',    pid: '0101', bit: 2 },
  { id: '0101_cat',  name: 'Catalytic converter',         pid: '0101', bit: 6 },
  { id: '0101_hcat', name: 'Heated catalytic converter',  pid: '0101', bit: 7 },
  { id: '0101_evap', name: 'Evaporative system (EVAP)',   pid: '0101', bit: 8 },
  { id: '0101_air',  name: 'Secondary air system',        pid: '0101', bit: 9 },
  { id: '0101_o2s',  name: 'O2 sensor',                   pid: '0101', bit: 11 },
  { id: '0101_o2sh', name: 'O2 sensor heater',            pid: '0101', bit: 12 },
  { id: '0101_egr',  name: 'Exhaust Gas Recirculation',   pid: '0101', bit: 13 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usePIDNum(pid: string, fallback = 0): number {
  const v = useAppStore(s => s.liveData[pid]?.value);
  return typeof v === 'number' ? v : fallback;
}

function voltageLabel(v: number): string {
  if (v <= 0)   return '—';
  if (v >= 12.6) return 'Fully charged';
  if (v >= 12.4) return '75% charge';
  if (v >= 12.2) return '50% charge';
  if (v >= 12.0) return '25% charge';
  return 'Low — check for draw';
}

function voltageColor(v: number): string {
  if (v <= 0)    return 'var(--tm)';
  if (v < 12.0)  return 'var(--sr)';
  if (v < 12.4)  return 'var(--sa)';
  return 'var(--sg)';
}

function riskLabel(score: number): string {
  if (score <= 2)  return 'Low risk';
  if (score <= 5)  return 'Moderate risk';
  if (score <= 7)  return 'Elevated risk';
  return 'High risk — investigate';
}

function riskColor(score: number): string {
  if (score <= 2)  return 'var(--sg)';
  if (score <= 5)  return 'var(--sa)';
  return 'var(--sr)';
}

// ─── HealthScreen ─────────────────────────────────────────────────────────────

export function HealthScreen(): React.ReactElement {
  const dtcs         = useAppStore(s => s.dtcs);
  const modules      = useAppStore(s => s.modules);
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const adapterInfo  = useAppStore(s => s.adapterInfo);
  const protocol     = useAppStore(s => s.protocol);
  const vehicle      = useAppStore(s => s.vehicle);
  const platform     = useAppStore(s => s.platform);
  const isGMT800     = platform.id === 'gmt800';
  const checklist    = useAppStore(s => s.checklist);
  const log          = useAppStore(s => s.log);
  const atrvHistory  = useAppStore(s => s.history['ATRV'] ?? []);

  const batteryV     = useAppStore(selectBatteryVoltage);
  const activeDTCs   = useAppStore(selectActiveDTCCount);
  const riskScore    = useAppStore(selectParasiteRiskScore);
  const voltageTrend = useAppStore(selectVoltageTrend);

  const [exporting, setExporting] = useState(false);

  const exportReport = async () => {
    setExporting(true);
    try {
      const freezeFrames = await window.electronAPI.storage.getFreezeFrames() as FreezeFrame[];
      const payload: ReportPayload = {
        vehicle: {
          nickname: vehicle.nickname ?? '',
          year:     vehicle.year ?? '',
          make:     vehicle.make ?? '',
          model:    vehicle.model ?? '',
          engine:   vehicle.engine ?? '',
          vin:      vehicle.vin ?? '',
          notes:    vehicle.notes ?? '',
        },
        batteryVoltage: batteryV,
        voltageHistory: atrvHistory.map(r => r.value as number),
        milOn:          dtcs.some(d => d.status === 'active'),
        dtcs,
        modules,
        checklist,
        freezeFrames,
        log:            (log as LogEntry[]).filter(e => e.level === 'error' || e.level === 'warn').slice(-100),
        reportDate:     Date.now(),
        adapterInfo:    adapterInfo ?? '',
        protocol:       protocol ?? '',
        appVersion:     '1.0.0',
      };
      await window.electronAPI.reportGenerate(payload);
    } finally {
      setExporting(false);
    }
  };

  const coolantF     = usePIDNum('0105', 0);
  const rpm          = usePIDNum('010C', 0);
  const engineOn     = rpm > 200;

  const pendingDTCs  = dtcs.filter(d => d.status === 'pending').length;
  const permDTCs     = dtcs.filter(d => d.status === 'permanent').length;
  const rogueModules = modules.filter(m => m.status === 'rogue').length;

  // Infer MIL state: active if any active powertrain DTCs exist
  const milOn = dtcs.some(d => d.status === 'active' && d.type === 'P');

  return (
    <ScrollPane>

      {/* ── Export button ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button
          disabled={exporting}
          onClick={exportReport}
          style={{
            padding: '4px 10px', background: 'var(--bg4)', border: '1px solid var(--br)',
            color: exporting ? 'var(--tm)' : 'var(--tw)', fontSize: 11, cursor: exporting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, opacity: exporting ? 0.6 : 1,
          }}
        >
          <i className={`ti ${exporting ? 'ti-loader-2' : 'ti-file-report'}`} style={{ fontSize: 12 }} />
          {exporting ? 'Generating…' : 'Export Report'}
        </button>
      </div>

      {/* ── Critical alerts ────────────────────────────────────────────────── */}
      {batteryV > 0 && batteryV < 12.0 && (
        <AlertBanner
          message={`Battery critical — ${batteryV.toFixed(2)} V. Deep discharge risk. Do not start engine until voltage is restored.`}
          variant="crit"
        />
      )}
      {batteryV > 0 && batteryV >= 12.0 && batteryV < 12.4 && (
        <AlertBanner
          message={`Battery low — ${batteryV.toFixed(2)} V. Charge the battery or investigate parasitic draw.`}
          variant="warn"
        />
      )}
      {voltageTrend === 'critical' && (
        <AlertBanner message="Rapid voltage drop detected — possible active parasitic draw." variant="crit" action="Go to Draw" onAction={() => useAppStore.getState().setActiveScreen('parasite')} />
      )}
      {rogueModules > 0 && (
        <AlertBanner
          message={`${rogueModules} module${rogueModules > 1 ? 's' : ''} awake after engine-off — parasitic draw suspect.`}
          variant="warn"
          action="Modules"
          onAction={() => useAppStore.getState().setActiveScreen('modules')}
        />
      )}

      {/* ── Overview tiles ─────────────────────────────────────────────────── */}
      <SectionHeader>System overview</SectionHeader>
      <Grid cols={4}>

        {/* Battery voltage — compact arc gauge */}
        <CompactArcGauge
          label="Battery voltage"
          value={batteryV > 0 ? parseFloat(batteryV.toFixed(1)) : 0}
          max={13}
          unit={batteryV > 0 ? voltageLabel(batteryV) : '—'}
          color={voltageColor(batteryV)}
        />

        {/* MIL / Check Engine */}
        <div
          style={{
            background: 'var(--bg2)',
            border: `1px solid ${milOn ? 'rgba(255,36,64,0.4)' : 'var(--br)'}`,
            borderRadius: 0, padding: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { if (!milOn) (e.currentTarget as HTMLElement).style.borderColor = 'var(--bs)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = milOn ? 'rgba(255,36,64,0.4)' : 'var(--br)'; }}
        >
          <span style={{
            fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
            letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'var(--tm)',
          }}>
            Check engine light
          </span>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: milOn ? 'rgba(255,36,64,0.12)' : 'var(--bg4)',
            border: `2px solid ${milOn ? 'var(--sr)' : 'var(--br)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: milOn ? 'blink 2s infinite' : 'none',
          }}>
            <i className="ti ti-engine" style={{ fontSize: 20, color: milOn ? 'var(--sr)' : 'var(--bs)' }} />
          </div>
          <span style={{
            fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 10,
            color: milOn ? 'var(--sr)' : 'var(--sg)',
          }}>
            {milOn ? `ON — ${activeDTCs} active fault${activeDTCs !== 1 ? 's' : ''}` : connectionStatus === 'connected' ? 'OFF — No active faults' : 'Not connected'}
          </span>
        </div>

        {/* Parasite risk score */}
        <div
          style={{
            background: 'var(--bg2)',
            border: `1px solid ${riskScore > 5 ? 'rgba(255,36,64,0.4)' : riskScore > 2 ? 'rgba(255,179,0,0.3)' : 'var(--br)'}`,
            borderRadius: 0, padding: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--bs)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = riskScore > 5 ? 'rgba(255,36,64,0.4)' : riskScore > 2 ? 'rgba(255,179,0,0.3)' : 'var(--br)'; }}
        >
          <span style={{
            fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
            letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'var(--tm)',
          }}>
            Parasite risk score
          </span>
          <div style={{
            fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 32, fontWeight: 600,
            color: riskColor(riskScore), lineHeight: 1,
          }}>
            {connectionStatus === 'connected' ? riskScore.toFixed(1) : '—'}
          </div>
          <span style={{ fontSize: 10, color: 'var(--tm)' }}>out of 10</span>
          <span style={{
            fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 10,
            color: riskColor(riskScore),
          }}>
            {connectionStatus === 'connected' ? riskLabel(riskScore) : 'Not connected'}
          </span>
        </div>

        {/* Engine status */}
        <DenseMetricTile
          label="Engine status"
          value={connectionStatus !== 'connected' ? '—' : engineOn ? `${rpm.toLocaleString()} rpm` : 'Off'}
          subtext={connectionStatus === 'connected' ? (engineOn ? `Coolant: ${coolantF > 0 ? coolantF + ' °F' : '—'}` : 'Engine not running') : 'Adapter not connected'}
          valueColor={engineOn ? 'var(--sg)' : 'var(--tm)'}
        />
      </Grid>

      {/* ── DTC summary ────────────────────────────────────────────────────── */}
      <SectionHeader>Diagnostic fault codes</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="Active faults"
          value={activeDTCs}
          subtext={activeDTCs > 0 ? 'MIL illuminated' : 'No active faults'}
          valueColor={activeDTCs > 0 ? 'var(--sr)' : 'var(--sg)'}
          accentBorder={activeDTCs > 0 ? 'var(--sr)' : undefined}
        />
        <DenseMetricTile
          label="Pending faults"
          value={pendingDTCs}
          subtext={pendingDTCs > 0 ? 'Detected, not yet confirmed' : 'None pending'}
          valueColor={pendingDTCs > 0 ? 'var(--sa)' : 'var(--tm)'}
        />
        <DenseMetricTile
          label="Permanent faults"
          value={permDTCs}
          subtext={permDTCs > 0 ? 'Cannot be cleared by scan tool' : 'None permanent'}
          valueColor={permDTCs > 0 ? 'var(--sa)' : 'var(--tm)'}
        />
        <DenseMetricTile
          label="Total stored"
          value={dtcs.length}
          subtext={dtcs.length > 0 ? 'Navigate to DTC screen for details' : 'No codes stored'}
          valueColor={dtcs.length > 0 ? 'var(--sa)' : 'var(--sg)'}
        />
      </Grid>

      {/* Active DTC list if any */}
      {dtcs.filter(d => d.status === 'active').length > 0 && (
        <Card padding={0}>
          {dtcs.filter(d => d.status === 'active').map((dtc, i) => (
            <div key={dtc.code} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
              borderBottom: i < dtcs.filter(d => d.status === 'active').length - 1 ? '1px solid var(--bg3)' : 'none',
            }}>
              <Badge label={dtc.code} variant="crit" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--tw)', fontWeight: 500 }}>{dtc.description}</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{dtc.module} · {dtc.likelyCauses[0]}</div>
              </div>
              <Badge label={dtc.type === 'P' ? 'Powertrain' : dtc.type === 'B' ? 'Body' : dtc.type === 'C' ? 'Chassis' : 'Network'} variant="muted" />
            </div>
          ))}
        </Card>
      )}

      {/* ── Readiness monitors ─────────────────────────────────────────────── */}
      <SectionHeader>I/M readiness monitors</SectionHeader>
      <Card padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
          {READINESS_MONITORS.map((m, i) => {
            // Without live 0101 data use a placeholder state
            const ready = connectionStatus === 'connected';
            return (
              <div key={m.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 12px',
                borderBottom: i < READINESS_MONITORS.length - 2 ? '1px solid var(--bg3)' : 'none',
                borderRight: i % 2 === 0 ? '1px solid var(--bg3)' : 'none',
              }}>
                <span style={{ fontSize: 12, color: 'var(--tw)' }}>{m.name}</span>
                <Badge
                  label={connectionStatus !== 'connected' ? 'N/A' : ready ? 'Ready' : 'Not ready'}
                  variant={connectionStatus !== 'connected' ? 'muted' : ready ? 'ok' : 'warn'}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Module status ──────────────────────────────────────────────────── */}
      <SectionHeader>Module status</SectionHeader>
      {modules.length === 0 ? (
        <Card>
          <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--tm)', textAlign: 'center' }}>
            No module data — connect adapter and run a module scan
          </div>
        </Card>
      ) : (
        <Card padding={0}>
          {modules.map((mod, i) => {
            const statusColor = mod.status === 'alive' ? 'var(--sg)'
              : mod.status === 'rogue' ? 'var(--sr)'
              : mod.status === 'suspect' ? 'var(--sa)'
              : mod.status === 'sleeping' ? 'var(--gb)'
              : 'var(--tm)';
            const badgeVariant = mod.status === 'alive' ? 'ok'
              : mod.status === 'rogue' ? 'crit'
              : mod.status === 'suspect' ? 'warn'
              : 'info' as any;
            return (
              <div
                key={mod.address}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderBottom: i < modules.length - 1 ? '1px solid var(--bg3)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 10, color: 'var(--tm)', width: 38, flexShrink: 0 }}>
                  {mod.address}
                </span>
                <span style={{ fontSize: 12, color: 'var(--tw)', flex: 1 }}>{mod.name}</span>
                {mod.latencyMs > 0 && (
                  <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 10, color: 'var(--tm)' }}>
                    {mod.latencyMs} ms
                  </span>
                )}
                <Badge label={mod.status} variant={badgeVariant} />
              </div>
            );
          })}
        </Card>
      )}

      {/* ── Adapter info ───────────────────────────────────────────────────── */}
      <SectionHeader>Adapter &amp; connection</SectionHeader>
      <Grid cols={3}>
        <DenseMetricTile
          label="Connection status"
          value={connectionStatus}
          valueColor={connectionStatus === 'connected' ? 'var(--sg)' : connectionStatus === 'error' ? 'var(--sr)' : 'var(--sa)'}
        />
        <DenseMetricTile
          label="Negotiated protocol"
          value={protocol || '—'}
          subtext={isGMT800 ? 'Expected: SAE J1850 VPW (GM Class II)' : undefined}
          valueColor={protocol ? 'var(--tw)' : 'var(--tm)'}
        />
        <DenseMetricTile
          label="Adapter firmware"
          value={adapterInfo || '—'}
          subtext="OBDLink MX+ ELM327 v1.5"
          valueColor="var(--tm)"
        />
      </Grid>

    </ScrollPane>
  );
}
