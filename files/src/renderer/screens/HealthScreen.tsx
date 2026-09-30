import React, { useState } from 'react';
import { useAppStore, selectBatteryVoltage, selectActiveDTCCount, selectParasiteRiskScore, selectVoltageTrend } from '../store/appStore';
import { FreezeFrame, ReportPayload, LogEntry, PIDReading } from '../../shared/types';
import {
  ScrollPane, SectionHeader, Grid, Card, Metric, Gauge, Badge, AlertBanner, Button, DataRow, EmptyState,
} from '../components/layout/UIComponents';
import { connectionTone } from '../components/shell/shellLogic';
import { readinessMonitors, isReading, batterySoC } from '../logic/verdicts';
import { TYPE, NUMERIC, STATUS_TEXT } from '../theme/theme';
import type { Status } from '../theme/theme';

const NO_READINGS: PIDReading[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usePIDNum(pid: string, fallback = 0): number {
  const v = useAppStore(s => s.liveData[pid]?.value);
  return typeof v === 'number' ? v : fallback;
}

const voltageLabel = batterySoC;

function riskLabel(score: number): string {
  if (score <= 2)  return 'Low risk';
  if (score <= 5)  return 'Moderate risk';
  if (score <= 7)  return 'Elevated risk';
  return 'High risk — investigate';
}

function riskStatus(score: number): Status {
  if (score > 5) return 'crit';
  if (score > 2) return 'warn';
  return 'neutral';
}

// ─── HealthScreen ─────────────────────────────────────────────────────────────

export function HealthScreen(): React.ReactElement {
  const dtcs         = useAppStore(s => s.dtcs);
  const modules      = useAppStore(s => s.modules);
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const readinessRaw = useAppStore(s => s.liveData['0101']?.raw);
  // Only trust readiness read in this session
  const readiness = connectionStatus === 'connected' && readinessRaw ? readinessMonitors(readinessRaw) : null;
  const adapterInfo  = useAppStore(s => s.adapterInfo);
  const protocol     = useAppStore(s => s.protocol);
  const vehicle      = useAppStore(s => s.vehicle);
  const platform     = useAppStore(s => s.platform);
  const isGMT800     = platform.id === 'gmt800';
  const checklist    = useAppStore(s => s.checklist);
  const log          = useAppStore(s => s.log);
  // A shared empty array: a new [] per call made every store update re-render
  const atrvHistory  = useAppStore(s => s.history['ATRV'] ?? NO_READINGS);

  const batteryV     = useAppStore(selectBatteryVoltage);
  const activeDTCs   = useAppStore(selectActiveDTCCount);
  const riskScore    = useAppStore(selectParasiteRiskScore);
  const voltageTrend = useAppStore(selectVoltageTrend);

  const [exporting, setExporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const exportReport = async () => {
    setExporting(true);
    setReportError(null);
    try {
      const appInfo = await window.electronAPI.getAppInfo().catch(() => null);
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
        milOn,
        dtcs,
        modules,
        checklist,
        freezeFrames,
        // The log is newest-first: take the 100 newest, then put them in time order
        log:            (log as LogEntry[]).filter(e => e.level === 'error' || e.level === 'warn').slice(0, 100).reverse(),
        reportDate:     Date.now(),
        adapterInfo:    adapterInfo ?? '',
        protocol:       protocol ?? '',
        appVersion:     appInfo?.version ?? '',
      };
      await window.electronAPI.reportGenerate(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': /, '') : String(err);
      setReportError(`The report could not be generated: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const coolantF     = usePIDNum('0105', NaN);
  const rpm          = usePIDNum('010C', 0);
  const engineOn     = rpm > 200;

  const pendingDTCs  = dtcs.filter(d => d.status === 'pending').length;
  const permDTCs     = dtcs.filter(d => d.status === 'permanent').length;
  const rogueModules = modules.filter(m => m.status === 'rogue').length;

  // The lamp state the vehicle reports (PID 0101) wins; before it has been
  // read, infer it from active powertrain codes. Used by the tiles and report.
  const milOn = readiness ? readiness.milOn : dtcs.some(d => d.status === 'active' && d.type === 'P');

  return (
    <ScrollPane>
      {reportError && <AlertBanner variant="crit" message={reportError} />}

      {/* ── Export button ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="secondary"
          size="sm"
          icon={exporting ? 'ti-loader-2' : 'ti-file-report'}
          disabled={exporting}
          onClick={exportReport}
        >
          {exporting ? 'Generating…' : 'Export report'}
        </Button>
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
        <Gauge
          size="compact"
          label="Battery voltage"
          value={batteryV > 0 ? parseFloat(batteryV.toFixed(1)) : 0}
          max={13}
          unit={batteryV > 0 ? voltageLabel(batteryV) : '—'}
          warnLow={batteryV > 0 ? 12.4 : undefined}
          critLow={batteryV > 0 ? 12.0 : undefined}
        />

        {/* MIL / Check Engine */}
        <Card padding={12} style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Check engine light</span>
          <span
            aria-hidden
            className={milOn ? 'pulse' : undefined}
            style={{ width: 14, height: 14, borderRadius: 7, background: milOn ? 'var(--crit)' : 'var(--label-4)' }}
          />
          <span style={{ ...TYPE.caption, color: milOn ? 'var(--crit-text)' : 'var(--label-2)' }}>
            {milOn ? `On — ${activeDTCs} active fault${activeDTCs !== 1 ? 's' : ''}` : connectionStatus === 'connected' ? 'Off — no active faults' : 'Not connected'}
          </span>
        </Card>

        {/* Parasite risk score */}
        <Card padding={12} style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Parasite risk score</span>
          <span style={{ ...TYPE.title1, ...NUMERIC, color: connectionStatus === 'connected' ? STATUS_TEXT[riskStatus(riskScore)] : 'var(--label-3)' }}>
            {connectionStatus === 'connected' ? riskScore.toFixed(1) : '—'}
          </span>
          <span style={{ ...TYPE.caption, color: 'var(--label-3)' }}>out of 10</span>
          <span style={{ ...TYPE.caption, color: connectionStatus === 'connected' ? STATUS_TEXT[riskStatus(riskScore)] : 'var(--label-2)' }}>
            {connectionStatus === 'connected' ? riskLabel(riskScore) : 'Not connected'}
          </span>
        </Card>

        {/* Engine status */}
        <Metric
          size="compact"
          label="Engine status"
          value={connectionStatus !== 'connected' ? '—' : engineOn ? `${rpm.toLocaleString()} rpm` : 'Off'}
          subtext={connectionStatus === 'connected' ? (engineOn ? `Coolant: ${isReading(coolantF) ? coolantF + ' °F' : '—'}` : 'Engine not running') : 'Adapter not connected'}
        />
      </Grid>

      {/* ── DTC summary ────────────────────────────────────────────────────── */}
      <SectionHeader>Diagnostic fault codes</SectionHeader>
      <Grid cols={4}>
        <Metric
          size="compact"
          label="Active faults"
          value={activeDTCs}
          subtext={activeDTCs === 0 ? 'No active faults' : milOn ? 'Check engine light on' : 'Check engine light off'}
          status={activeDTCs > 0 ? 'crit' : 'neutral'}
        />
        <Metric
          size="compact"
          label="Pending faults"
          value={pendingDTCs}
          subtext={pendingDTCs > 0 ? 'Detected, not yet confirmed' : 'None pending'}
          status={pendingDTCs > 0 ? 'warn' : 'neutral'}
        />
        <Metric
          size="compact"
          label="Permanent faults"
          value={permDTCs}
          subtext={permDTCs > 0 ? 'Cannot be cleared by scan tool' : 'None permanent'}
          status={permDTCs > 0 ? 'warn' : 'neutral'}
        />
        <Metric
          size="compact"
          label="Total stored"
          value={dtcs.length}
          subtext={dtcs.length > 0 ? 'Navigate to DTC screen for details' : 'No codes stored'}
          status={dtcs.length > 0 ? 'warn' : 'neutral'}
        />
      </Grid>

      {/* Active DTC list if any */}
      {dtcs.filter(d => d.status === 'active').length > 0 && (
        <Card padding={0}>
          {dtcs.filter(d => d.status === 'active').map(dtc => (
            <DataRow
              key={dtc.code}
              name={dtc.description}
              subtext={`${dtc.module} · ${dtc.likelyCauses[0]}`}
              value={dtc.type === 'P' ? 'Powertrain' : dtc.type === 'B' ? 'Body' : dtc.type === 'C' ? 'Chassis' : 'Network'}
              badge={<Badge label={dtc.code} variant="crit" />}
            />
          ))}
        </Card>
      )}

      {/* ── Readiness monitors (Mode 01 PID 01) ─────────────────────────── */}
      <SectionHeader>I/M readiness monitors</SectionHeader>
      {readiness === null ? (
        <Card>
          <EmptyState
            icon="ti-clipboard-check"
            title={connectionStatus === 'connected' ? 'Readiness not read yet' : 'Not connected'}
            message={connectionStatus === 'connected'
              ? 'Monitor status (PID 0101) is read every few seconds once polling is running.'
              : 'Connect to the vehicle to read which emissions monitors have completed.'}
          />
        </Card>
      ) : (
        <Card padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {readiness.monitors.map(m => (
              <DataRow
                key={m.name}
                name={m.name}
                value=""
                badge={<Badge label={m.status === 'ready' ? 'Ready' : 'Not ready'} variant={m.status === 'ready' ? 'ok' : 'warn'} />}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ── Module status ──────────────────────────────────────────────────── */}
      <SectionHeader>Module status</SectionHeader>
      {modules.length === 0 ? (
        <Card>
          <EmptyState icon="ti-cpu-off" title="No module data" message="Connect adapter and run a module scan." />
        </Card>
      ) : (
        <Card padding={0}>
          {modules.map(mod => {
            const badgeVariant = mod.status === 'alive' ? 'ok'
              : mod.status === 'rogue' ? 'crit'
              : mod.status === 'suspect' ? 'warn'
              : 'info';
            return (
              <DataRow
                key={mod.address}
                pid={mod.address}
                name={mod.name}
                subtext={mod.latencyMs > 0 ? `${mod.latencyMs} ms` : undefined}
                value=""
                badge={<Badge label={mod.status} variant={badgeVariant} />}
              />
            );
          })}
        </Card>
      )}

      {/* ── Adapter info ───────────────────────────────────────────────────── */}
      <SectionHeader>Adapter &amp; connection</SectionHeader>
      <Grid cols={3}>
        <Metric
          size="compact"
          label="Connection status"
          value={connectionStatus}
          status={connectionTone(connectionStatus)}
        />
        <Metric
          size="compact"
          label="Negotiated protocol"
          value={protocol || '—'}
          subtext={isGMT800 ? 'Expected: SAE J1850 VPW (GM Class II)' : undefined}
        />
        <Metric
          size="compact"
          label="Adapter firmware"
          value={adapterInfo || '—'}
          subtext="As reported by the adapter"
        />
      </Grid>

    </ScrollPane>
  );
}
