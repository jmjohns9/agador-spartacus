import React, { useMemo } from 'react';
import { useAppStore, selectBatteryVoltage, selectVoltageTrend } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Grid, DenseMetricTile, CompactArcGauge,
  HeroCard, Card, AlertBanner, Badge,
} from '../components/layout/UIComponents';
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

// ─── Voltage timeline mini-chart ──────────────────────────────────────────────

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
      <div style={{ height: H + 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg4)', borderRadius: 2 }}>
        <span style={{ fontSize: 11, color: 'var(--tm)' }}>Collecting voltage history…</span>
      </div>
    );
  }

  const values = recent.map(r => typeof r.value === 'number' ? r.value : 12.6);
  const pts    = values.map((v, i) => `${(i / (values.length - 1)) * W},${yOf(v)}`).join(' ');

  const lastV  = values[values.length - 1];
  const firstV = values[0];
  const drift  = lastV - firstV;
  const lineColor = lastV < 12.0 ? 'var(--sr)' : lastV < 12.4 ? 'var(--sa)' : 'var(--pp)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg width="100%" viewBox={`-40 -8 ${W + 60} ${H + 20}`} style={{ overflow: 'visible' }}>
        {/* Reference lines */}
        {REFS.map(({ v, label, color }) => (
          <g key={v}>
            <line x1={0} y1={yOf(v)} x2={W} y2={yOf(v)} stroke={color} strokeWidth="0.7" strokeDasharray="4,3" />
            <text x={W + 4} y={yOf(v) + 4} fontSize="8" fill={color} fontFamily="JetBrains Mono, monospace">{label}</text>
          </g>
        ))}
        {/* Voltage trace */}
        <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {/* Current value dot */}
        {values.length > 0 && (
          <circle
            cx={W}
            cy={yOf(lastV)}
            r="4"
            fill={lineColor}
            stroke="var(--bg2)"
            strokeWidth="1.5"
          />
        )}
        {/* Y axis labels */}
        {[11.6, 11.8, 12.0, 12.2, 12.4, 12.6, 12.8, 13.0].map(v => (
          <text key={v} x={-4} y={yOf(v) + 3} fontSize="8" fill="var(--tm)" fontFamily="JetBrains Mono, monospace" textAnchor="end">{v}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tm)', fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{recent.length} samples · {Math.round(recent.length * 0.5 / 60)} min window</span>
        <span style={{ color: drift < -0.05 ? 'var(--sr)' : drift < -0.02 ? 'var(--sa)' : 'var(--sg)' }}>
          Drift: {drift >= 0 ? '+' : ''}{drift.toFixed(3)} V
        </span>
        <span style={{ color: lineColor }}>Current: {lastV.toFixed(3)} V</span>
      </div>
    </div>
  );
}

// ─── ElectricalScreen ─────────────────────────────────────────────────────────

export function ElectricalScreen(): React.ReactElement {
  const batteryV     = useAppStore(selectBatteryVoltage);
  const batteryAt    = useAppStore(s => s.liveData['ATRV']?.timestamp);
  const voltageTrend = useAppStore(selectVoltageTrend);
  const history      = useAppStore(s => s.history['ATRV'] ?? []);

  const ecmV      = usePIDNum('0142');

  // Voltage drop rate: mV/min from last 10 samples
  const voltDropRate = useMemo(() => {
    if (history.length < 10) return 0;
    const slice = history.slice(-10);
    const dt    = (slice[slice.length - 1].timestamp - slice[0].timestamp) / 60000; // min
    const dv    = (slice[0].value as number) - (slice[slice.length - 1].value as number);
    return dt > 0 ? dv / dt : 0;
  }, [history]);

  const voltageLabel = batteryV <= 0 ? '—'
    : batteryV >= 12.6 ? 'Fully charged'
    : batteryV >= 12.4 ? '75% charged'
    : batteryV >= 12.2 ? '50% charged'
    : batteryV >= 12.0 ? '25% charged'
    : 'Low — charge needed';

  const voltageColor = batteryV <= 0 ? 'var(--tm)'
    : batteryV < 12.0 ? 'var(--sr)'
    : batteryV < 12.4 ? 'var(--sa)'
    : 'var(--sg)';

  const wiringDrop = batteryV > 0 && ecmV > 0 ? batteryV - ecmV : 0;

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
        <AlertBanner message="Rapid voltage drop — possible active draw. Navigate to the Parasitic Draw screen to investigate." variant="crit" />
      )}
      {voltageTrend === 'dropping' && (
        <AlertBanner message="Voltage trending down — monitor closely." variant="warn" />
      )}
      {wiringDrop > 0.3 && (
        <AlertBanner message={`High wiring resistance — ${wiringDrop.toFixed(2)} V drop between battery and ECM. Check grounds and battery cables.`} variant="warn" />
      )}

      {/* ── Hero row — battery voltage leads the screen ────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <HeroCard
          label={`Battery (ATRV) — ${voltageLabel.toLowerCase()}`}
          value={batteryV > 0 ? batteryV.toFixed(2) : '—'}
          unit="V"
          valueColor={voltageColor}
          accentBorder="#9B8AFF"
          subtext={
            batteryV <= 0 ? 'No reading' :
            batteryV < 12.0 ? 'Critical — risk of failed start' :
            batteryV < 12.4 ? 'Discharged — investigate draw' :
            batteryV < 13.2 ? 'Healthy at rest' : 'Charging — alternator'
          }
          pid="ATRV"
          sparkColor="#9B8AFF"
          staleAt={batteryAt}
        />
        <HeroCard
          label="Voltage trend"
          value={voltageTrend === 'stable' ? 'Stable' : voltageTrend === 'dropping' ? 'Dropping' : 'Critical'}
          valueColor={voltageTrend === 'stable' ? 'var(--sg)' : voltageTrend === 'dropping' ? 'var(--sa)' : 'var(--sr)'}
          subtext={voltDropRate > 0.001 ? `−${voltDropRate.toFixed(3)} V/min` : 'No drain detected'}
          pid="ATRV"
          sparkColor="var(--tm)"
        />
        <HeroCard
          label="Discharge rate"
          value={voltDropRate > 0 ? `${(voltDropRate * 1000).toFixed(1)}` : '—'}
          unit="mV/min"
          subtext={voltDropRate > 5 ? 'High — investigate draw' : voltDropRate > 1 ? 'Moderate drain' : 'Normal self-discharge'}
          valueColor={voltDropRate > 5 ? 'var(--sr)' : voltDropRate > 1 ? 'var(--sa)' : 'var(--sg)'}
          pid="ATRV"
          sparkColor="var(--sa)"
        />
      </div>

      {/* ── Detailed battery panel ─────────────────────────────────── */}
      <SectionHeader>Battery &amp; charging system</SectionHeader>
      <Grid cols={4}>
        <CompactArcGauge
          label="Battery V"
          value={batteryV > 0 ? Math.round(batteryV * 100) / 100 : 0}
          max={13}
          unit="volts"
          color={voltageColor}
        />
        <DenseMetricTile
          label="ECM supply rail"
          value={ecmV > 0 ? `${ecmV.toFixed(3)} V` : '—'}
          accentBorder="#9B8AFF"
          subtext={wiringDrop > 0 ? `${wiringDrop.toFixed(3)} V drop (${wiringDrop > 0.3 ? 'HIGH' : 'OK'})` : 'Compare to battery V'}
          valueColor={wiringDrop > 0.3 ? 'var(--sa)' : 'var(--sg)'}
        />
        <DenseMetricTile
          label="Voltage trend"
          value={voltageTrend === 'stable' ? 'Stable' : voltageTrend === 'dropping' ? 'Dropping' : 'Critical drop'}
          valueColor={voltageTrend === 'stable' ? 'var(--sg)' : voltageTrend === 'dropping' ? 'var(--sa)' : 'var(--sr)'}
          subtext={voltDropRate > 0.001 ? `−${voltDropRate.toFixed(3)} V/min` : 'No drain detected'}
        />
        <DenseMetricTile
          label="Discharge rate"
          value={voltDropRate > 0 ? `${(voltDropRate * 1000).toFixed(1)} mV/min` : '—'}
          subtext={voltDropRate > 5 ? 'High — investigate draw' : voltDropRate > 1 ? 'Moderate drain' : 'Normal self-discharge'}
          valueColor={voltDropRate > 5 ? 'var(--sr)' : voltDropRate > 1 ? 'var(--sa)' : 'var(--sg)'}
        />
      </Grid>

      {/* ── Voltage timeline ───────────────────────────────────────────── */}
      <SectionHeader>Battery voltage timeline — last 120 readings (~1 min)</SectionHeader>
      <Card padding={12}>
        <VoltageTimeline />
      </Card>

      {/* ── Charging system reference ──────────────────────────────────── */}
      <SectionHeader>Charging system state</SectionHeader>
      <Grid cols={3}>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Battery reference chart
            </div>
            {[
              { v: '≥ 12.65', label: '100%  Fully charged', color: 'var(--sg)' },
              { v: '12.45',   label: ' 75%  Healthy',       color: 'var(--sg)' },
              { v: '12.24',   label: ' 50%  Half charge',   color: 'var(--sa)' },
              { v: '12.06',   label: ' 25%  Low — recharge', color: 'var(--sa)' },
              { v: '11.89',   label: '  0%  Dead',          color: 'var(--sr)' },
            ].map(({ v, label, color }) => {
              const threshold = parseFloat(v.replace('≥ ', ''));
              const isCurrent = batteryV > 0 && Math.abs(batteryV - threshold) < 0.15;
              return (
                <div key={v} style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: isCurrent ? 'rgba(255,128,0,0.07)' : 'transparent',
                  padding: '3px 6px', borderRadius: 2,
                  border: isCurrent ? '1px solid rgba(255,128,0,0.3)' : '1px solid transparent',
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color, width: 42 }}>{v}</span>
                  <span style={{ fontSize: 11, color: isCurrent ? 'var(--tw)' : 'var(--tm)' }}>{label}</span>
                  {isCurrent && <span style={{ fontSize: 10, color: 'var(--pp)', marginLeft: 'auto' }}>◀ now</span>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Alternator charging voltages
          </div>
          {[
            { range: '13.8–14.8 V', label: 'Engine running — healthy alternator', ok: true },
            { range: '13.5–13.7 V', label: 'Low charge — check drive belt tension', ok: false },
            { range: '15.0+ V',     label: 'Overcharging — faulty regulator', ok: false },
            { range: '12.6–13.4 V', label: 'Not charging — check alternator', ok: false },
          ].map(({ range, label, ok }) => (
            <div key={range} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? 'var(--sg)' : 'var(--sa)', marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tw)' }}>{range}</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 1 }}>{label}</div>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Parasitic draw thresholds
          </div>
          {[
            { range: '< 25 mA',   label: 'Normal standby draw (all modules sleeping)', ok: true },
            { range: '25–50 mA',  label: 'Acceptable — clocks, alarm, etc.', ok: true },
            { range: '50–100 mA', label: 'Elevated — investigate within a week', ok: false },
            { range: '100–500 mA', label: 'Significant draw — IPC, radio, or BCM', ok: false },
            { range: '500+ mA',   label: 'Severe — battery dead overnight', ok: false },
          ].map(({ range, label, ok }) => (
            <div key={range} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? 'var(--sg)' : 'var(--sa)', marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tw)' }}>{range}</div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 1 }}>{label}</div>
              </div>
            </div>
          ))}
        </Card>
      </Grid>

      {/* ── Live electrical data ────────────────────────────────────────── */}
      <SectionHeader>Live electrical readings</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="Barometric"
          value={fmt('0133', usePID('0133'))}
          subtext="Altitude correction ref"
        />
        <DenseMetricTile
          label="Abs throttle load"
          value={fmt('0143', usePID('0143'))}
          subtext="Speed-independent ref"
        />
        <DenseMetricTile
          label="Fuel type"
          value={typeof usePID('0149') === 'string' ? usePID('0149') as string : 'Gasoline'}
          subtext="Fuel system config"
          valueColor="var(--tm)"
        />
        <DenseMetricTile
          label="Fuel rate"
          value={fmt('015E', usePID('015E'))}
          subtext="Instantaneous consumption"
        />
      </Grid>

    </ScrollPane>
  );
}
