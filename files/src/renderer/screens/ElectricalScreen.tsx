import React from 'react';
import { useAppStore, selectBatteryVoltage, selectVoltageTrend, selectDropMvPerMin } from '../store/appStore';
import { dischargeStatus as statusForDrain } from '../logic/verdicts';
import {
  ScrollPane, SectionHeader, Grid, Card, Metric, Gauge, AlertBanner, VoltageTimeline,
} from '../components/layout/UIComponents';
import { batteryStatus } from '../components/shell/shellLogic';
import { TYPE, NUMERIC, STATUS_TEXT } from '../theme/theme';
import type { Status } from '../theme/theme';
import { PID_MAP } from '../../core/pidCatalog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usePID(pid: string): number | string {
  const v = useAppStore(s => s.liveData[pid]?.value);
  return v !== undefined ? v : '—';
}

function usePIDNum(pid: string, fallback = 0): number {
  const v = usePID(pid);
  return typeof v === 'number' ? v : fallback;
}

function fmt(pid: string, v: number | string): string {
  if (v === '—') return '—';
  const def = PID_MAP.get(pid);
  if (!def || typeof v !== 'number') return String(v);
  return def.format(v);
}

/** 'none' battery reading renders neutral, same as the rest of the app. */
function voltageStatus(v: number): Status {
  const s = batteryStatus(v);
  return s === 'none' ? 'neutral' : s;
}

// ─── ElectricalScreen ─────────────────────────────────────────────────────────

export function ElectricalScreen(): React.ReactElement {
  const batteryV     = useAppStore(selectBatteryVoltage);
  const batteryAt    = useAppStore(s => s.liveData['ATRV']?.timestamp);
  const voltageTrend = useAppStore(selectVoltageTrend);
  const dropMv       = useAppStore(selectDropMvPerMin);

  const ecmV      = usePIDNum('0142');


  const voltageLabel = batteryV <= 0 ? '—'
    : batteryV >= 12.6 ? 'Fully charged'
    : batteryV >= 12.4 ? '75% charged'
    : batteryV >= 12.2 ? '50% charged'
    : batteryV >= 12.0 ? '25% charged'
    : 'Low — charge needed';

  const voltStatus = voltageStatus(batteryV);
  const wiringDrop = batteryV > 0 && ecmV > 0 ? batteryV - ecmV : 0;

  const trendStatus: Status = voltageTrend === 'stable' ? 'neutral' : voltageTrend === 'dropping' ? 'warn' : 'crit';
  const trendLabel = voltageTrend === 'stable' ? 'Stable' : voltageTrend === 'dropping' ? 'Dropping' : 'Critical drop';
  const dischargeStatus: Status = statusForDrain(dropMv);
  // Drain rate text, in the unit the thresholds use (mV/min)
  const drainValue = dropMv === null ? '—' : `${Math.max(dropMv, 0).toFixed(1)}`;
  const drainText  = dropMv === null ? 'Needs 10 min at rest'
    : dischargeStatus === 'crit' ? 'High — investigate draw'
    : dischargeStatus === 'warn' ? 'Moderate drain' : 'Normal self-discharge';
  const trendText  = dropMv === null ? 'Needs 10 min at rest' : dropMv > 0.05 ? `−${dropMv.toFixed(1)} mV/min` : 'No drain detected';

  return (
    <ScrollPane>

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      {batteryV > 0 && batteryV < 12.0 && (
        <AlertBanner message={`Battery critical — ${batteryV.toFixed(2)} V. Risk of deep discharge and failed engine start.`} variant="crit" />
      )}
      {batteryV > 0 && batteryV >= 12.0 && batteryV < 12.4 && (
        <AlertBanner message={`Battery low — ${batteryV.toFixed(2)} V. Charge or investigate parasitic draw.`} variant="warn" />
      )}
      {voltageTrend === 'critical' && (
        <AlertBanner message="Rapid voltage drop — possible active draw." variant="crit" action="Go to Draw" onAction={() => useAppStore.getState().setActiveScreen('parasite')} />
      )}
      {voltageTrend === 'dropping' && (
        <AlertBanner message="Voltage trending down — monitor closely." variant="warn" />
      )}
      {wiringDrop > 0.3 && (
        <AlertBanner message={`High wiring resistance — ${wiringDrop.toFixed(2)} V drop between battery and ECM. Check grounds and battery cables.`} variant="warn" />
      )}

      {/* ── Hero row — battery voltage leads the screen ────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8 }}>
        <Metric
          size="hero"
          label={`Battery (ATRV) — ${voltageLabel.toLowerCase()}`}
          value={batteryV > 0 ? batteryV.toFixed(2) : '—'}
          unit="V"
          status={voltStatus}
          subtext={
            batteryV <= 0 ? 'No reading' :
            batteryV < 12.0 ? 'Critical — risk of failed start' :
            batteryV < 12.4 ? 'Discharged — investigate draw' :
            batteryV < 13.2 ? 'Healthy at rest' : 'Charging — alternator'
          }
          spark={{ pid: 'ATRV', color: 'var(--purple)' }}
          staleAt={batteryAt}
        />
        <Metric
          size="hero"
          label="Voltage trend"
          value={trendLabel}
          status={trendStatus}
          subtext={trendText}
          spark={{ pid: 'ATRV', color: 'var(--label-2)' }}
        />
        <Metric
          size="hero"
          label="Discharge rate"
          value={drainValue}
          unit="mV/min"
          subtext={drainText}
          status={dischargeStatus}
          spark={{ pid: 'ATRV', color: 'var(--warn)' }}
        />
      </div>

      {/* ── Detailed battery panel ─────────────────────────────────── */}
      <SectionHeader>Battery &amp; charging system</SectionHeader>
      <Grid cols={4}>
        <Gauge
          size="compact"
          label="Battery V"
          value={batteryV > 0 ? Math.round(batteryV * 100) / 100 : 0}
          max={13}
          unit="volts"
        />
        <Metric
          size="compact"
          label="ECM supply rail"
          value={ecmV > 0 ? `${ecmV.toFixed(3)} V` : '—'}
          subtext={wiringDrop > 0 ? `${wiringDrop.toFixed(3)} V drop (${wiringDrop > 0.3 ? 'High' : 'OK'})` : 'Compare to battery V'}
          status={wiringDrop > 0.3 ? 'warn' : 'neutral'}
        />
        <Metric
          size="compact"
          label="Voltage trend"
          value={trendLabel}
          status={trendStatus}
          subtext={trendText}
        />
        <Metric
          size="compact"
          label="Discharge rate"
          value={dropMv === null ? '—' : `${drainValue} mV/min`}
          subtext={drainText}
          status={dischargeStatus}
        />
      </Grid>

      {/* ── Voltage timeline ───────────────────────────────────────────── */}
      <SectionHeader>Battery voltage timeline</SectionHeader>
      <Card padding={12}>
        <VoltageTimeline />
      </Card>

      {/* ── Charging system reference ──────────────────────────────────── */}
      <SectionHeader>Charging system state</SectionHeader>
      <Grid cols={3}>
        <Card>
          <SectionHeader>Battery reference chart</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {[
              { v: '≥ 12.65', label: '100% Fully charged', status: 'ok' as Status },
              { v: '12.45',   label: '75% Healthy',        status: 'ok' as Status },
              { v: '12.24',   label: '50% Half charge',    status: 'warn' as Status },
              { v: '12.06',   label: '25% Low — recharge',  status: 'warn' as Status },
              { v: '11.89',   label: '0% Dead',            status: 'crit' as Status },
            ].map(({ v, label, status }) => {
              const threshold = parseFloat(v.replace('≥ ', ''));
              const isCurrent = batteryV > 0 && Math.abs(batteryV - threshold) < 0.15;
              return (
                <div key={v} style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: isCurrent ? 'var(--accent-tint)' : 'transparent',
                  padding: '4px 8px', borderRadius: 6,
                }}>
                  <span style={{ ...TYPE.caption, ...NUMERIC, color: STATUS_TEXT[status], width: 42 }}>{v}</span>
                  <span style={{ ...TYPE.caption, color: isCurrent ? 'var(--label)' : 'var(--label-2)' }}>{label}</span>
                  {isCurrent && <span style={{ ...TYPE.caption, color: 'var(--accent-text)', marginLeft: 'auto' }}>◀ now</span>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionHeader>Alternator charging voltages</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[
              { range: '13.8–14.8 V', label: 'Engine running — healthy alternator', ok: true },
              { range: '13.5–13.7 V', label: 'Low charge — check drive belt tension', ok: false },
              { range: '15.0+ V',     label: 'Overcharging — faulty regulator', ok: false },
              { range: '12.6–13.4 V', label: 'Not charging — check alternator', ok: false },
            ].map(({ range, label, ok }) => (
              <div key={range} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? 'var(--ok)' : 'var(--warn)', marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>{range}</div>
                  <div style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader>Parasitic draw thresholds</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[
              { range: '< 25 mA',   label: 'Normal standby draw (all modules sleeping)', ok: true },
              { range: '25–50 mA',  label: 'Acceptable — clocks, alarm, etc.', ok: true },
              { range: '50–100 mA', label: 'Elevated — investigate within a week', ok: false },
              { range: '100–500 mA', label: 'Significant draw — IPC, radio, or BCM', ok: false },
              { range: '500+ mA',   label: 'Severe — battery dead overnight', ok: false },
            ].map(({ range, label, ok }) => (
              <div key={range} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? 'var(--ok)' : 'var(--warn)', marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>{range}</div>
                  <div style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Grid>

      {/* ── Live electrical data ────────────────────────────────────────── */}
      <SectionHeader>Live electrical readings</SectionHeader>
      <Grid cols={3}>
        <Metric
          size="compact"
          label="Barometric"
          value={fmt('0133', usePID('0133'))}
          subtext="Altitude correction ref"
        />
        <Metric
          size="compact"
          label="Absolute load"
          value={fmt('0143', usePID('0143'))}
          subtext="Speed-independent ref"
        />
        <Metric
          size="compact"
          label="Fuel rate"
          value={fmt('015E', usePID('015E'))}
          subtext="Instantaneous consumption"
        />
      </Grid>

    </ScrollPane>
  );
}
