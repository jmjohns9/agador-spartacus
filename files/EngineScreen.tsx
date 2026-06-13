import React from 'react';
import { useAppStore } from './appStore';
import {
  ScrollPane, SectionHeader, Grid, MetricTile, ArcGauge, Card, Tooltip, TipContent,
} from './UIComponents';
import { PID_MAP } from '../core/pidCatalog';

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

// Narrow horizontal spark-line from the last N history readings
function Sparkline({ pid, color = 'var(--pp)' }: { pid: string; color?: string }): React.ReactElement {
  const history = useAppStore(s => s.history[pid] ?? []);
  const recent  = history.slice(-60);

  if (recent.length < 2) {
    return <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 10, color: 'var(--tm)' }}>No data</span>
    </div>;
  }

  const values = recent.map(r => typeof r.value === 'number' ? r.value : 0);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;
  const w      = 120;
  const h      = 28;
  const pts    = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');

  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
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
        <span style={{ fontSize: 9, color: 'var(--tm)' }}>−25%</span>
        <span style={{ fontSize: 9, color: 'var(--tm)' }}>0</span>
        <span style={{ fontSize: 9, color: 'var(--tm)' }}>+25%</span>
      </div>
    </div>
  );
}

// ─── EngineScreen ─────────────────────────────────────────────────────────────

export function EngineScreen(): React.ReactElement {
  const isDark = useAppStore(s => s.isDarkMode);

  const rpm       = usePIDNum('010C');
  const coolantF  = usePIDNum('0105');
  const oilTempF  = usePIDNum('015C');
  const throttle  = usePIDNum('0111');
  const load      = usePIDNum('0104');
  const maf       = usePIDNum('0110');
  const map_kpa   = usePIDNum('010B');
  const timing    = usePIDNum('010E');

  const stftB1 = usePIDNum('0106');
  const ltftB1 = usePIDNum('0107');
  const stftB2 = usePIDNum('0108');
  const ltftB2 = usePIDNum('0109');

  // Combined fuel trim concern flag
  const fuelTrimAlarm = Math.abs(ltftB1) > 7 || Math.abs(ltftB2) > 7;

  return (
    <ScrollPane>

      {/* ── Primary gauges ─────────────────────────────────────────────── */}
      <SectionHeader>Engine performance</SectionHeader>
      <Grid cols={4}>
        <ArcGauge
          label="Engine speed"
          value={rpm}
          min={0} max={6000} unit="rpm"
          warnHigh={5500} critHigh={6000}
          isDark={isDark} size={90}
        />
        <ArcGauge
          label="Engine load"
          value={load}
          min={0} max={100} unit="%"
          warnHigh={85}
          isDark={isDark} size={90} color="var(--gb)"
        />
        <ArcGauge
          label="Throttle position"
          value={throttle}
          min={0} max={100} unit="%"
          isDark={isDark} size={90}
        />
        <ArcGauge
          label="Ignition advance"
          value={timing}
          min={-20} max={40} unit="° BTDC"
          isDark={isDark} size={90} color="var(--gb)"
        />
      </Grid>

      {/* ── Temperature gauges ─────────────────────────────────────────── */}
      <SectionHeader>Thermal management</SectionHeader>
      <Grid cols={4}>
        <MetricTile
          label="Engine coolant temperature"
          value={fmt('0105', usePID('0105'))}
          barPercent={((coolantF - 68) / (240 - 68)) * 100}
          barColor={coolantF > 230 ? 'var(--sr)' : coolantF > 215 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={coolantF > 230 ? 'var(--sr)' : coolantF > 215 ? 'var(--sa)' : 'var(--sg)'}
          subtext={coolantF > 230 ? 'OVERHEATING' : coolantF > 215 ? 'High — monitor closely' : coolantF > 180 ? 'Normal operating range' : coolantF > 0 ? 'Warming up' : '—'}
          tooltip={<TipContent name="Engine Coolant Temperature" description="Temperature at the thermostat housing. Drives fuel enrichment, ignition timing, and cooling fan control." formula="(byte A − 40) × 9 ÷ 5 + 32" range="0105 · Normal: 195–220 °F · Overheat threshold: 240 °F" />}
        />
        <MetricTile
          label="Engine oil temperature"
          value={fmt('015C', usePID('015C'))}
          barPercent={((oilTempF - 68) / (270 - 68)) * 100}
          barColor={oilTempF > 260 ? 'var(--sr)' : oilTempF > 240 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={oilTempF > 260 ? 'var(--sr)' : 'var(--sg)'}
          subtext="Sump temperature · Normal: 180–230 °F"
          tooltip={<TipContent name="Engine Oil Temperature" description="Oil sump temperature. High oil temp degrades lubrication film and accelerates wear. Allow warmup before hard acceleration." formula="(byte A − 40) × 9 ÷ 5 + 32" range="015C · Normal: 180–230 °F" />}
        />
        <MetricTile
          label="Intake air temperature"
          value={fmt('010F', usePID('010F'))}
          subtext="At MAF sensor housing"
          tooltip={<TipContent name="Intake Air Temperature" description="Air temperature at the MAF / IAT sensor. Hot intake air reduces air density, cutting power and triggering timing retard." formula="(byte A − 40) × 9 ÷ 5 + 32" range="010F · Should be ambient + 10–15 °F" />}
        />
        <MetricTile
          label="Ambient outside temperature"
          value={fmt('0146', usePID('0146'))}
          subtext="Front bumper sensor"
          tooltip={<TipContent name="Ambient Air Temperature" description="Outside air temperature. Used to correct battery state-of-health estimates and fuel calculations at extreme temperatures." formula="(byte A − 40) × 9 ÷ 5 + 32" range="0146" />}
        />
      </Grid>

      {/* ── Air & fuel ─────────────────────────────────────────────────── */}
      <SectionHeader>Air &amp; fuel delivery</SectionHeader>
      <Grid cols={4}>
        <MetricTile
          label="Mass Air Flow rate"
          value={fmt('0110', usePID('0110'))}
          subtext={`5.3 L Vortec idle: 4–6 g/s · current: ${maf > 0 ? maf + ' g/s' : '—'}`}
          tooltip={<TipContent name="Mass Air Flow Rate" description="Grams of air entering the intake per second. Core ECM input for fuel injection quantity calculation." formula="((A × 256) + B) ÷ 100" range="0110 · Idle: 4–6 g/s · WOT: 100+ g/s" />}
        />
        <MetricTile
          label="Intake manifold pressure"
          value={fmt('010B', usePID('010B'))}
          subtext={`${map_kpa > 0 ? (map_kpa < 50 ? 'Low — good vacuum at idle' : 'Rising — under load') : '—'}`}
          tooltip={<TipContent name="Intake Manifold Absolute Pressure" description="Absolute pressure inside the intake manifold. Low at idle due to vacuum; rises toward atmospheric at WOT." formula="byte A × 0.14504 (kPa→psi)" range="010B · Idle: 6–9 psi · WOT: ~14.7 psi" />}
        />
        <MetricTile
          label="Fuel rail pressure"
          value={fmt('0123', usePID('0123'))}
          subtext="Returnless fuel rail spec: 55–60 psi"
          tooltip={<TipContent name="Fuel Rail Gauge Pressure" description="Fuel pressure at the rail above atmospheric. The 5.3 L uses a returnless fuel rail regulated by the ECM." formula="((A × 256) + B) × 10 kPa → × 0.14504 psi" range="0123 · Spec: 55–60 psi" />}
        />
        <MetricTile
          label="Fuel injection timing"
          value={fmt('015D', usePID('015D'))}
          subtext="Advance angle relative to TDC"
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
          { pid: '0114', name: 'B1 Upstream', sub: 'Pre-cat · should sweep 0.1–0.9 V' },
          { pid: '0115', name: 'B1 Downstream', sub: 'Post-cat · steady ~0.65 V = cat OK' },
          { pid: '0118', name: 'B2 Upstream', sub: 'Pre-cat · should sweep 0.1–0.9 V' },
          { pid: '0119', name: 'B2 Downstream', sub: 'Post-cat · steady ~0.65 V = cat OK' },
        ].map(({ pid, name, sub }) => (
          <MetricTile
            key={pid}
            label={`O2 sensor — ${name}`}
            value={fmt(pid, usePID(pid))}
            subtext={sub}
            valueColor="var(--sg)"
          />
        ))}
      </Grid>

      {/* ── Emissions & EVAP ───────────────────────────────────────────── */}
      <SectionHeader>Emissions &amp; EVAP control</SectionHeader>
      <Grid cols={4}>
        <MetricTile
          label="EGR commanded position"
          value={fmt('012C', usePID('012C'))}
          subtext="0% at idle is normal"
          tooltip={<TipContent name="EGR Valve — Commanded Position" description="Exhaust Gas Recirculation valve position commanded by the ECM. Reduces NOx at cruise; 0% at idle." formula="(byte A ÷ 255) × 100" range="012C · Idle: 0% · Cruise: 10–25%" />}
        />
        <MetricTile
          label="EGR position error"
          value={fmt('012D', usePID('012D'))}
          valueColor={Math.abs(usePIDNum('012D')) > 15 ? 'var(--sa)' : 'var(--tw)'}
          subtext="Commanded vs actual — high = stuck valve"
          tooltip={<TipContent name="EGR Error" description="Deviation between commanded and actual EGR position. Stuck or leaking valve causes high error and potential lean misfire." formula="((A − 128) ÷ 128) × 100" range="012D · Normal: ±5% · Fault: ±15%+" />}
        />
        <MetricTile
          label="EVAP purge valve duty"
          value={fmt('012E', usePID('012E'))}
          subtext="0% at idle — rises at cruise"
          tooltip={<TipContent name="EVAP Purge Valve Duty Cycle" description="Canister purge valve duty. Stuck open at idle introduces fuel vapour and causes a lean code (P0446)." formula="(byte A ÷ 255) × 100" range="012E · Idle: 0% · Cruise: up to 100%" />}
        />
        <MetricTile
          label="Fuel system status — Bank 1"
          value={typeof usePID('012A') === 'string' ? usePID('012A') : 'Closed loop'}
          valueColor="var(--sg)"
          subtext="Closed loop = O2 sensor feedback active"
        />
      </Grid>

      {/* ── History trend ──────────────────────────────────────────────── */}
      <SectionHeader>RPM &amp; load trend — last 60 readings</SectionHeader>
      <Grid cols={2}>
        <Card>
          <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Engine RPM
          </div>
          <Sparkline pid="010C" color="var(--pp)" />
        </Card>
        <Card>
          <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Engine load %
          </div>
          <Sparkline pid="0104" color="var(--gb)" />
        </Card>
      </Grid>

    </ScrollPane>
  );
}
