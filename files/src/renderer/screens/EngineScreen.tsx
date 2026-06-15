import React from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Grid, DenseMetricTile, CompactArcGauge,
  HeroCard, Card, Tooltip, TipContent,
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

/** Timestamp of the last update for a PID (for staleness). */
function usePIDTimestamp(pid: string): number | undefined {
  return useAppStore(s => s.liveData[pid]?.timestamp);
}

function fmt(pid: string, v: number | string): string {
  if (v === '—') return '—';
  const def = PID_MAP.get(pid);
  if (!def || typeof v !== 'number') return String(v);
  return def.format(v);
}

// Dual-bar fuel trim visualiser (STFT + LTFT side by side)
function FuelTrimBar({ pid, label }: { pid: string; label: string }): React.ReactElement {
  const val = usePIDNum(pid, 0);
  const abs = Math.abs(val);
  const barColor = abs > 10 ? 'var(--sr)' : abs > 5 ? 'var(--sa)' : 'var(--sg)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: barColor }}>
          {fmt(pid, usePID(pid))}
        </span>
      </div>
      {/* Centre-zero bar */}
      <div style={{ height: 6, background: 'var(--bg4)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        {/* Centre marker */}
        <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'var(--br)' }} />
        {/* Fill from centre */}
        <div style={{
          position: 'absolute',
          top: 1, height: 4, borderRadius: 2,
          background: barColor,
          left:  val >= 0 ? '50%' : `${50 + val * 2}%`,
          width: `${Math.min(50, abs * 2)}%`,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--tm)' }}>−25%</span>
        <span style={{ fontSize: 10, color: 'var(--tm)' }}>0</span>
        <span style={{ fontSize: 10, color: 'var(--tm)' }}>+25%</span>
      </div>
    </div>
  );
}

// ─── EngineScreen ─────────────────────────────────────────────────────────────

export function EngineScreen(): React.ReactElement {
  const rpm       = usePIDNum('010C');
  const coolantF  = usePIDNum('0105');
  const oilTempF  = usePIDNum('015C');
  const throttle  = usePIDNum('0111');
  const load      = usePIDNum('0104');
  const maf       = usePIDNum('0110');
  const map_kpa   = usePIDNum('010B');

  const stftB1 = usePIDNum('0106');
  const ltftB1 = usePIDNum('0107');
  const stftB2 = usePIDNum('0108');
  const ltftB2 = usePIDNum('0109');

  // Combined fuel trim concern flag
  const fuelTrimAlarm = Math.abs(ltftB1) > 7 || Math.abs(ltftB2) > 7;

  return (
    <ScrollPane>

      {/* ── Hero row — primary engine metrics with sparklines ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <HeroCard
          label="Engine speed"
          value={rpm > 0 ? rpm.toLocaleString() : '—'}
          unit="rpm"
          subtext={rpm === 0 ? 'No reading — engine off or bus quiet' : rpm < 900 ? 'Steady at idle' : rpm < 2500 ? 'Cruise / light load' : 'Under load'}
          valueColor={rpm > 6000 ? 'var(--sr)' : rpm > 5500 ? 'var(--sa)' : 'var(--tw)'}
          accentBorder="var(--pp)"
          pid="010C"
          sparkColor="var(--pp)"
          staleAt={usePIDTimestamp('010C')}
        />
        <HeroCard
          label="Engine load"
          value={fmt('0104', usePID('0104'))}
          subtext={load > 85 ? 'High — sustained load' : load > 0 ? 'Within range' : '—'}
          valueColor={load > 85 ? 'var(--sa)' : 'var(--gb)'}
          pid="0104"
          sparkColor="var(--gb)"
          staleAt={usePIDTimestamp('0104')}
        />
        <HeroCard
          label="Throttle pos"
          value={fmt('0111', usePID('0111'))}
          subtext={throttle < 5 ? 'Closed' : throttle < 30 ? 'Light' : throttle < 70 ? 'Moderate' : 'Heavy'}
          pid="0111"
          sparkColor="var(--tm)"
          staleAt={usePIDTimestamp('0111')}
        />
      </div>

      {/* ── Detailed gauges ─────────────────────────────────────────── */}
      <SectionHeader>Engine performance</SectionHeader>
      <Grid cols={4}>
        <CompactArcGauge label="RPM" value={rpm} max={6000} unit="/ 6,000" color="var(--pp)" />
        <CompactArcGauge label="Load" value={load} max={100} unit="of max" color="var(--gb)" />
        <CompactArcGauge label="Throttle" value={throttle} max={100} unit="position" color="var(--tw)" />
        <CompactArcGauge label="Timing" value={usePIDNum('010E')} max={60} unit="° BTDC" color="var(--gb)" />
      </Grid>

      {/* ── Temperature gauges ─────────────────────────────────────────── */}
      <SectionHeader>Thermal management</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="Coolant temp"
          value={fmt('0105', usePID('0105'))}
          barPercent={((coolantF - 68) / (240 - 68)) * 100}
          barColor={coolantF > 230 ? 'var(--sr)' : coolantF > 215 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={coolantF > 230 ? 'var(--sr)' : coolantF > 215 ? 'var(--sa)' : 'var(--sg)'}
          subtext={coolantF > 230 ? 'OVERHEATING' : coolantF > 215 ? 'High — monitor closely' : coolantF > 180 ? 'Normal operating range' : coolantF > 0 ? 'Warming up' : '—'}
          tooltip={<TipContent name="Engine Coolant Temperature" description="Temperature at the thermostat housing. Drives fuel enrichment, ignition timing, and cooling fan control." formula="(byte A − 40) × 9 ÷ 5 + 32" range="0105 · Normal: 195–220 °F · Overheat threshold: 240 °F" />}
        />
        <DenseMetricTile
          label="Oil temp"
          value={fmt('015C', usePID('015C'))}
          barPercent={((oilTempF - 68) / (270 - 68)) * 100}
          barColor={oilTempF > 260 ? 'var(--sr)' : oilTempF > 240 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={oilTempF > 260 ? 'var(--sr)' : 'var(--sg)'}
          subtext="Sump temp · Normal: 180–230 °F"
          tooltip={<TipContent name="Engine Oil Temperature" description="Oil sump temperature. High oil temp degrades lubrication film and accelerates wear. Allow warmup before hard acceleration." formula="(byte A − 40) × 9 ÷ 5 + 32" range="015C · Normal: 180–230 °F" />}
        />
        <DenseMetricTile
          label="Intake air"
          value={fmt('010F', usePID('010F'))}
          subtext="At MAF sensor housing"
          tooltip={<TipContent name="Intake Air Temperature" description="Air temperature at the MAF / IAT sensor. Hot intake air reduces air density, cutting power and triggering timing retard." formula="(byte A − 40) × 9 ÷ 5 + 32" range="010F · Should be ambient + 10–15 °F" />}
        />
        <DenseMetricTile
          label="Ambient air"
          value={fmt('0146', usePID('0146'))}
          subtext="Bumper sensor"
          tooltip={<TipContent name="Ambient Air Temperature" description="Outside air temperature. Used to correct battery state-of-health estimates and fuel calculations at extreme temperatures." formula="(byte A − 40) × 9 ÷ 5 + 32" range="0146" />}
        />
      </Grid>

      {/* ── Air & fuel ─────────────────────────────────────────────────── */}
      <SectionHeader>Air &amp; fuel delivery</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="MAF rate"
          value={fmt('0110', usePID('0110'))}
          unit="g/s"
          subtext={`V8 idle: 4–6 g/s · now: ${maf > 0 ? maf + ' g/s' : '—'}`}
          tooltip={<TipContent name="Mass Air Flow Rate" description="Grams of air entering the intake per second. Core ECM input for fuel injection quantity calculation." formula="((A × 256) + B) ÷ 100" range="0110 · Idle: 4–6 g/s · WOT: 100+ g/s" />}
        />
        <DenseMetricTile
          label="MAP"
          value={fmt('010B', usePID('010B'))}
          subtext={`${map_kpa > 0 ? (map_kpa < 50 ? 'Low — good vacuum' : 'Rising — under load') : '—'}`}
          tooltip={<TipContent name="Intake Manifold Absolute Pressure" description="Absolute pressure inside the intake manifold. Low at idle due to vacuum; rises toward atmospheric at WOT." formula="byte A × 0.14504 (kPa→psi)" range="010B · Idle: 6–9 psi · WOT: ~14.7 psi" />}
        />
        <DenseMetricTile
          label="Fuel rail"
          value={fmt('0123', usePID('0123'))}
          valueColor="var(--sg)"
          subtext="Spec 55–60 psi"
          tooltip={<TipContent name="Fuel Rail Gauge Pressure" description="Fuel pressure at the rail above atmospheric. The 5.3 L uses a returnless fuel rail regulated by the ECM." formula="((A × 256) + B) × 10 kPa → × 0.14504 psi" range="0123 · Spec: 55–60 psi" />}
        />
        <DenseMetricTile
          label="Inj timing"
          value={fmt('015D', usePID('015D'))}
          subtext="Advance angle · BTDC"
          tooltip={<TipContent name="Fuel Injection Timing" description="Crank angle at which injection begins relative to top dead center. Advanced under load." formula="((A × 256) + B) ÷ 128 − 210" range="015D" />}
        />
      </Grid>

      {/* ── Fuel trims ─────────────────────────────────────────────────── */}
      <SectionHeader>Fuel trim analysis — Bank 1 (right) &amp; Bank 2 (left)</SectionHeader>
      {fuelTrimAlarm && (
        <div style={{ background: 'rgba(255,179,0,0.07)', border: '1px solid rgba(255,179,0,0.3)', borderRadius: 3, padding: '8px 12px', fontSize: 12, color: 'var(--sa)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} />
          Long-term fuel trim above ±7% — persistent correction indicates a real lean/rich condition. Check for vacuum leaks, dirty MAF, or failing O2 sensors.
        </div>
      )}
      <Grid cols={2}>
        <Card>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: 1, color: 'var(--pp)', textTransform: 'uppercase', marginBottom: 10 }}>
            Bank 1 — Cylinders 1, 3, 5, 7 (right bank)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FuelTrimBar pid="0106" label="Short-term trim (instant ECM correction)" />
            <FuelTrimBar pid="0107" label="Long-term trim (learned correction — stored in ECM)" />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--tm)', lineHeight: 1.5 }}>
            Combined correction: <span style={{ color: Math.abs(stftB1 + ltftB1) > 15 ? 'var(--sr)' : 'var(--tw)', fontFamily: "'JetBrains Mono', monospace" }}>
              {(stftB1 + ltftB1).toFixed(1)}%
            </span>
          </div>
        </Card>
        <Card>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: 1, color: 'var(--gb)', textTransform: 'uppercase', marginBottom: 10 }}>
            Bank 2 — Cylinders 2, 4, 6, 8 (left bank)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FuelTrimBar pid="0108" label="Short-term trim (instant ECM correction)" />
            <FuelTrimBar pid="0109" label="Long-term trim (learned correction — stored in ECM)" />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--tm)', lineHeight: 1.5 }}>
            Combined correction: <span style={{ color: Math.abs(stftB2 + ltftB2) > 15 ? 'var(--sr)' : 'var(--tw)', fontFamily: "'JetBrains Mono', monospace" }}>
              {(stftB2 + ltftB2).toFixed(1)}%
            </span>
          </div>
        </Card>
      </Grid>

      {/* ── O2 sensors ─────────────────────────────────────────────────── */}
      <SectionHeader>Oxygen sensors</SectionHeader>
      <Grid cols={4}>
        {[
          { pid: '0114', name: 'B1 upstream', sub: 'Pre-cat · sweeping 0.1–0.9 V' },
          { pid: '0115', name: 'B1 downstream', sub: 'Post-cat · steady ~0.65 V = OK' },
          { pid: '0118', name: 'B2 upstream', sub: 'Pre-cat · sweeping 0.1–0.9 V' },
          { pid: '0119', name: 'B2 downstream', sub: 'Post-cat · steady ~0.65 V = OK' },
        ].map(({ pid, name, sub }) => (
          <DenseMetricTile
            key={pid}
            label={`O2 ${name}`}
            value={fmt(pid, usePID(pid))}
            subtext={sub}
            valueColor="var(--sg)"
          />
        ))}
      </Grid>

      {/* ── Emissions & EVAP ───────────────────────────────────────────── */}
      <SectionHeader>Emissions &amp; EVAP control</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="EGR commanded"
          value={fmt('012C', usePID('012C'))}
          subtext="0% at idle — normal"
          tooltip={<TipContent name="EGR Valve — Commanded Position" description="Exhaust Gas Recirculation valve position commanded by the ECM. Reduces NOx at cruise; 0% at idle." formula="(byte A ÷ 255) × 100" range="012C · Idle: 0% · Cruise: 10–25%" />}
        />
        <DenseMetricTile
          label="EGR error"
          value={fmt('012D', usePID('012D'))}
          valueColor={Math.abs(usePIDNum('012D')) > 15 ? 'var(--sa)' : 'var(--tw)'}
          subtext="Cmd vs actual — high = stuck"
          tooltip={<TipContent name="EGR Error" description="Deviation between commanded and actual EGR position. Stuck or leaking valve causes high error and potential lean misfire." formula="((A − 128) ÷ 128) × 100" range="012D · Normal: ±5% · Fault: ±15%+" />}
        />
        <DenseMetricTile
          label="EVAP purge"
          value={fmt('012E', usePID('012E'))}
          subtext="0% at idle — rises at cruise"
          tooltip={<TipContent name="EVAP Purge Valve Duty Cycle" description="Canister purge valve duty. Stuck open at idle introduces fuel vapour and causes a lean code (P0446)." formula="(byte A ÷ 255) × 100" range="012E · Idle: 0% · Cruise: up to 100%" />}
        />
        <DenseMetricTile
          label="Fuel status"
          value={typeof usePID('012A') === 'string' ? usePID('012A') as string : 'Closed loop'}
          valueColor="var(--sg)"
          subtext="O2 feedback active"
        />
      </Grid>

    </ScrollPane>
  );
}
