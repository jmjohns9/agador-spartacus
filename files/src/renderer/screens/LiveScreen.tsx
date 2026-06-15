import React from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Grid, DenseMetricTile, CompactArcGauge,
  HeroCard, StatusBar, Tooltip, TipContent,
} from '../components/layout/UIComponents';
import { PID_MAP } from '../../core/pidCatalog';

// ─── Helper: pull a live numeric value from store ──────────────────────────────

function usePID(pid: string): number | string {
  const reading = useAppStore(s => s.liveData[pid]);
  if (!reading) return '—';
  // Show stale engine-dependent PIDs as "—" when engine is off (RPM = 0)
  const rpm = useAppStore(s => s.liveData['010C']);
  if (pid !== '010C' && pid !== 'ATRV' && rpm && typeof rpm.value === 'number' && rpm.value === 0) {
    const age = Date.now() - reading.timestamp;
    if (age > 5000) return '—';
  }
  return reading.value;
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

// ─── LiveScreen ───────────────────────────────────────────────────────────────

export function LiveScreen(): React.ReactElement {
  const rpmAt      = useAppStore(s => s.liveData['010C']?.timestamp);
  const loadAt     = useAppStore(s => s.liveData['0104']?.timestamp);
  const throttleAt = useAppStore(s => s.liveData['0111']?.timestamp);
  const rpm        = usePIDNum('010C');

  return (
    <ScrollPane>
      <StatusBar />

      {/* ── Hero row — primary engine metrics with sparklines ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <HeroCard
          label="Engine speed"
          value={rpm > 0 ? rpm.toLocaleString() : '—'}
          unit="rpm"
          subtext={rpm === 0 ? 'Engine off or bus quiet' : rpm < 900 ? 'Steady at idle' : rpm < 2500 ? 'Cruise / light load' : 'Under load'}
          valueColor={rpm > 6000 ? 'var(--sr)' : rpm > 5500 ? 'var(--sa)' : 'var(--tw)'}
          accentBorder="var(--pp)"
          pid="010C"
          sparkColor="var(--pp)"
          staleAt={rpmAt}
        />
        <HeroCard
          label="Engine load"
          value={fmt('0104', usePID('0104'))}
          subtext={usePIDNum('0104') > 85 ? 'High sustained load' : usePIDNum('0104') > 0 ? 'Within range' : '—'}
          valueColor="var(--gb)"
          pid="0104"
          sparkColor="var(--gb)"
          staleAt={loadAt}
        />
        <HeroCard
          label="Throttle position"
          value={fmt('0111', usePID('0111'))}
          subtext={usePIDNum('0111') < 5 ? 'Closed' : usePIDNum('0111') < 30 ? 'Light' : usePIDNum('0111') < 70 ? 'Moderate' : 'Heavy'}
          pid="0111"
          sparkColor="var(--tm)"
          staleAt={throttleAt}
        />
      </div>

      {/* ── Engine Performance — compact arc gauges ─────────────────── */}
      <SectionHeader>Engine performance</SectionHeader>
      <Grid cols={4}>
        <CompactArcGauge label="RPM" value={usePIDNum('010C')} max={6000} unit="/ 6,000" color="var(--pp)" />
        <CompactArcGauge label="Load" value={usePIDNum('0104')} max={100} unit="of max" color="var(--gb)" />
        <CompactArcGauge label="Throttle" value={usePIDNum('0111')} max={100} unit="position" color="var(--tw)" />
        <CompactArcGauge label="Timing" value={usePIDNum('010E')} max={60} unit="° BTDC" color="var(--gb)" />
      </Grid>

      {/* ── Temperature Sensors ─────────────────────────────────────── */}
      <SectionHeader>Temperature sensors</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="Coolant temp"
          value={fmt('0105', usePID('0105'))}
          subtext="Normal · 195–220 °F"
          barPercent={((usePIDNum('0105', 68) - 68) / (240 - 68)) * 100}
          barColor={usePIDNum('0105') > 230 ? 'var(--sr)' : usePIDNum('0105') > 220 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={usePIDNum('0105') > 230 ? 'var(--sr)' : usePIDNum('0105') > 220 ? 'var(--sa)' : 'var(--sg)'}
          tooltip={<TipContent name="Engine Coolant Temperature" description="Coolant temperature at the thermostat housing. Drives fuel enrichment and ignition timing maps in the Engine Control Module." formula="(byte A − 40) × 9 ÷ 5 + 32" range="Parameter 0105 · Normal: 195–220 °F · Overheat: above 240 °F" />}
        />
        <DenseMetricTile
          label="Oil temp"
          value={fmt('015C', usePID('015C'))}
          subtext="Normal · 180–230 °F"
          barPercent={((usePIDNum('015C', 68) - 68) / (270 - 68)) * 100}
          barColor="var(--sg)"
          valueColor="var(--sg)"
          tooltip={<TipContent name="Engine Oil Temperature" description="Engine oil temperature in the sump. High oil temperature degrades lubrication film strength and accelerates wear." formula="(byte A − 40) × 9 ÷ 5 + 32" range="Parameter 015C · Normal: 180–230 °F" />}
        />
        <DenseMetricTile
          label="Intake air"
          value={fmt('010F', usePID('010F'))}
          subtext="At MAF sensor"
          tooltip={<TipContent name="Intake Air Temperature" description="Air temperature at the Mass Air Flow / Intake Air Temperature sensor. High intake air temperature reduces power output." formula="(byte A − 40) × 9 ÷ 5 + 32" range="Parameter 010F · Should be near ambient + 10–15 °F" />}
        />
        <DenseMetricTile
          label="Ambient air"
          value={fmt('0146', usePID('0146'))}
          subtext="Bumper sensor"
          tooltip={<TipContent name="Ambient Outside Air Temperature" description="Outside air temperature measured by the sensor near the front bumper. Used to correct battery state of health and fuel calculations." formula="(byte A − 40) × 9 ÷ 5 + 32" range="Parameter 0146" />}
        />
      </Grid>

      {/* ── Fuel System ─────────────────────────────────────────────── */}
      <SectionHeader>Fuel system</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="STFT Bank 1"
          value={fmt('0106', usePID('0106'))}
          subtext={usePIDNum('0106') > 5 ? 'Lean — adding fuel' : usePIDNum('0106') < -5 ? 'Rich — removing fuel' : 'Normal range'}
          barPercent={50 + usePIDNum('0106') * 2}
          barColor={Math.abs(usePIDNum('0106')) > 10 ? 'var(--sr)' : Math.abs(usePIDNum('0106')) > 5 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={Math.abs(usePIDNum('0106')) > 10 ? 'var(--sr)' : Math.abs(usePIDNum('0106')) > 5 ? 'var(--sa)' : 'var(--tw)'}
          tooltip={<TipContent name="Short-Term Fuel Trim — Bank 1" description="Instant Engine Control Module fuel correction for right-side cylinders based on oxygen sensor feedback. Positive values mean the engine is running lean — the computer is adding fuel to compensate." formula="((byte A − 128) ÷ 128) × 100" range="Parameter 0106 · Normal: ±5% · Concern: ±10% or more" />}
        />
        <DenseMetricTile
          label="LTFT Bank 1"
          value={fmt('0107', usePID('0107'))}
          subtext={usePIDNum('0107') > 7 ? 'Lean — persistent' : 'Normal range'}
          subtextColor={usePIDNum('0107') > 7 ? 'var(--sa)' : undefined}
          barPercent={50 + usePIDNum('0107') * 2}
          barColor={Math.abs(usePIDNum('0107')) > 10 ? 'var(--sr)' : 'var(--sa)'}
          valueColor={Math.abs(usePIDNum('0107')) > 10 ? 'var(--sr)' : 'var(--sa)'}
          tooltip={<TipContent name="Long-Term Fuel Trim — Bank 1" description="Learned persistent fuel correction stored in Engine Control Module memory for Bank 1. High positive value combined with high short-term trim signals a real lean condition — suspect a vacuum leak, dirty Mass Air Flow sensor, or failing oxygen sensor." formula="((byte A − 128) ÷ 128) × 100" range="Parameter 0107 · Normal: ±5% · Alarm: ±10% or more" />}
        />
        <DenseMetricTile
          label="STFT Bank 2"
          value={fmt('0108', usePID('0108'))}
          barPercent={50 + usePIDNum('0108') * 2}
          barColor={Math.abs(usePIDNum('0108')) > 5 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={Math.abs(usePIDNum('0108')) > 5 ? 'var(--sa)' : 'var(--tw)'}
          tooltip={<TipContent name="Short-Term Fuel Trim — Bank 2" description="Same as Bank 1 short-term trim but for the left-side cylinders. Both banks lean simultaneously points to an upstream cause — vacuum leak, Mass Air Flow sensor, or Evaporative Emission Control purge valve stuck open." formula="((byte A − 128) ÷ 128) × 100" range="Parameter 0108 · Normal: ±5%" />}
        />
        <DenseMetricTile
          label="LTFT Bank 2"
          value={fmt('0109', usePID('0109'))}
          barPercent={50 + usePIDNum('0109') * 2}
          barColor={Math.abs(usePIDNum('0109')) > 7 ? 'var(--sa)' : 'var(--sg)'}
          valueColor={Math.abs(usePIDNum('0109')) > 7 ? 'var(--sa)' : 'var(--tw)'}
          tooltip={<TipContent name="Long-Term Fuel Trim — Bank 2" description="Learned correction for left-side cylinders. Both banks above +7% is a strong indicator of a global lean condition — common causes are a cracked intake manifold gasket, Evaporative Emission Control purge valve stuck open, or dirty Mass Air Flow sensor." formula="((byte A − 128) ÷ 128) × 100" range="Parameter 0109 · Alarm: ±10% or more" />}
        />
      </Grid>
      <Grid cols={4}>
        <DenseMetricTile
          label="MAF rate"
          value={fmt('0110', usePID('0110'))}
          unit="g/s"
          subtext="Idle 5.3 L: 4–6"
          tooltip={<TipContent name="Mass Air Flow Rate" description="Mass of air entering the intake per second via the hot-wire Mass Air Flow sensor. Core Engine Control Module input for fuel injection calculation." formula="((byte A × 256) + byte B) ÷ 100" range="Parameter 0110 · Idle 5.3 L: 4–6 g/s" />}
        />
        <DenseMetricTile
          label="MAP"
          value={fmt('010B', usePID('010B'))}
          subtext="Low at idle · rises at WOT"
          tooltip={<TipContent name="Intake Manifold Absolute Pressure" description="Absolute pressure inside the intake manifold. Low at idle due to vacuum present; rises toward atmospheric at wide-open throttle." formula="byte A × 0.14504 (kilopascal to psi)" range="Parameter 010B · Idle: 6–9 psi · Wide-open throttle: ~14.7 psi" />}
        />
        <DenseMetricTile
          label="Fuel level"
          value={fmt('012F', usePID('012F'))}
          barPercent={usePIDNum('012F')}
          barColor={usePIDNum('012F') < 10 ? 'var(--sr)' : usePIDNum('012F') < 20 ? 'var(--sa)' : 'var(--sg)'}
          subtext={usePIDNum('012F') > 0 ? `≈ ${((usePIDNum('012F') / 100) * 26).toFixed(1)} gal remaining` : ''}
          tooltip={<TipContent name="Fuel Tank Level Remaining" description="Fuel level sensor signal from the sender float in the fuel tank." formula="(byte A ÷ 255) × 100" range="Parameter 012F" />}
        />
        <DenseMetricTile
          label="Fuel rate"
          value={fmt('015E', usePID('015E'))}
          subtext="From injector duty cycle"
          tooltip={<TipContent name="Engine Fuel Consumption Rate" description="Instantaneous fuel flow rate calculated from injector duty cycle." formula="((byte A × 256) + byte B) ÷ 20" range="Parameter 015E · Idle: 0.3–0.5 L/h · Highway: 8–12 L/h" />}
        />
      </Grid>

      {/* ── Electrical & Battery ─────────────────────────────────────── */}
      <SectionHeader>Electrical &amp; battery</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="Battery (adapter)"
          value={fmt('ATRV', usePID('ATRV'))}
          accentBorder="#9B8AFF"
          valueColor={usePIDNum('ATRV') < 12.0 ? 'var(--sr)' : '#9B8AFF'}
          barPercent={((usePIDNum('ATRV') - 11.8) / (12.7 - 11.8)) * 100}
          barColor={usePIDNum('ATRV') < 12.0 ? 'var(--sr)' : '#9B8AFF'}
          subtext="Primary parasitic draw signal"
          tooltip={<TipContent name="Battery Terminal Voltage — Adapter Direct Reading" description="Measured directly at the OBD-II port by the ELM327 adapter. More accurate than the Engine Control Module voltage reading because it bypasses internal wiring resistance. This is the primary parasitic draw monitoring signal." range="Fully charged: 12.6 V · 50% charge: 12.2 V · Dead: below 11.8 V" />}
        />
        <DenseMetricTile
          label="ECM supply"
          value={fmt('0142', usePID('0142'))}
          valueColor="var(--sg)"
          subtext="At ECM pin"
          tooltip={<TipContent name="Engine Control Module Supply Rail Voltage" description="Battery voltage as measured at the Engine Control Module's voltage reference pin. Compare to the adapter reading to check wiring resistance drop." formula="((byte A × 256) + byte B) ÷ 1000" range="Parameter 0142 · Should be within 0.3 V of adapter reading" />}
        />
        <DenseMetricTile
          label="Barometric"
          value={fmt('0133', usePID('0133'))}
          subtext="Altitude correction"
          tooltip={<TipContent name="Barometric Pressure" description="Atmospheric pressure used to compensate Mass Air Flow and altitude-sensitive fuel calculations." formula="byte A × 0.29530 (kilopascal to inches of mercury)" range="Parameter 0133 · Sea level: 29.9 inHg" />}
        />
        <DenseMetricTile
          label="Abs load"
          value={fmt('0143', usePID('0143'))}
          subtext="Speed-independent"
          tooltip={<TipContent name="Absolute Throttle Body Air Intake Load" description="Absolute percentage of maximum possible air intake at current conditions, independent of engine speed." formula="((byte A × 256) + byte B) ÷ 2.55" range="Parameter 0143" />}
        />
      </Grid>

      {/* ── Oxygen Sensors ──────────────────────────────────────────── */}
      <SectionHeader>Oxygen sensors</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="O2 B1 upstream"
          value={fmt('0114', usePID('0114'))}
          valueColor="var(--sg)"
          subtext="Sweeping 0.1–0.9 V"
          tooltip={<TipContent name="Oxygen Sensor — Bank 1, Upstream" description="The upstream oxygen sensor on Bank 1, before the catalytic converter. Should oscillate rapidly between 0.1–0.9 V in closed-loop fuel control." formula="byte A ÷ 200" range="Parameter 0114 · Rich: above 0.45 V · Lean: below 0.45 V" />}
        />
        <DenseMetricTile
          label="O2 B1 downstream"
          value={fmt('0115', usePID('0115'))}
          valueColor="var(--sg)"
          subtext="Cat healthy · steady"
          tooltip={<TipContent name="Oxygen Sensor — Bank 1, Downstream" description="The downstream catalytic converter monitor sensor on Bank 1. A steady reading around 0.65 V indicates a healthy catalytic converter." formula="byte A ÷ 200" range="Parameter 0115 · Catalyst OK: steady ~0.6–0.7 V" />}
        />
        <DenseMetricTile
          label="O2 B2 upstream"
          value={fmt('0118', usePID('0118'))}
          valueColor="var(--sg)"
          subtext="Sweeping 0.1–0.9 V"
          tooltip={<TipContent name="Oxygen Sensor — Bank 2, Upstream" description="The upstream oxygen sensor on Bank 2 (driver side on this V8). Should oscillate rapidly in closed-loop fuel control." formula="byte A ÷ 200" range="Parameter 0118" />}
        />
        <DenseMetricTile
          label="O2 B2 downstream"
          value={fmt('0119', usePID('0119'))}
          valueColor="var(--sg)"
          subtext="Cat healthy · steady"
          tooltip={<TipContent name="Oxygen Sensor — Bank 2, Downstream" description="Post-catalytic converter sensor on Bank 2. Steady reading indicates catalyst is functioning correctly." formula="byte A ÷ 200" range="Parameter 0119" />}
        />
      </Grid>

      {/* ── Emissions Control ───────────────────────────────────────── */}
      <SectionHeader>Emissions control</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="EGR commanded"
          value={fmt('012C', usePID('012C'))}
          subtext="0% at idle — normal"
          tooltip={<TipContent name="Exhaust Gas Recirculation Valve — Commanded Position" description="The Exhaust Gas Recirculation valve position commanded by the Engine Control Module to reduce nitrogen oxide emissions. Should be 0% at idle." formula="(byte A ÷ 255) × 100" range="Parameter 012C · Idle: 0% · Cruise: 10–25%" />}
        />
        <DenseMetricTile
          label="EGR error"
          value={fmt('012D', usePID('012D'))}
          valueColor={Math.abs(usePIDNum('012D')) > 15 ? 'var(--sa)' : 'var(--tw)'}
          subtext="Actual vs commanded"
          tooltip={<TipContent name="Exhaust Gas Recirculation Error" description="Deviation between the commanded and actual Exhaust Gas Recirculation valve position. A high error suggests a stuck or leaking valve." formula="((byte A − 128) ÷ 128) × 100" range="Parameter 012D · Normal: ±5% · Fault: ±15% or more" />}
        />
        <DenseMetricTile
          label="EVAP purge"
          value={fmt('012E', usePID('012E'))}
          subtext="0% at idle — normal"
          tooltip={<TipContent name="Evaporative Emission Control Purge Valve Duty Cycle" description="The canister purge valve duty cycle. If stuck open at idle it introduces excess fuel vapour and causes a lean condition." formula="(byte A ÷ 255) × 100" range="Parameter 012E · Idle: 0% · Cruise: up to 100%" />}
        />
        <DenseMetricTile
          label="Fuel status"
          value={typeof usePID('012A') === 'string' ? usePID('012A') as string : 'Closed loop'}
          valueColor="var(--sg)"
          subtext="O2 feedback active"
          tooltip={<TipContent name="Fuel System Status — Bank 1" description="Whether the Engine Control Module is using oxygen sensor feedback (closed loop = normal) or a fixed fuel map (open loop = startup or fault)." formula="Bit-coded status byte" range="Parameter 012A" />}
        />
      </Grid>

      {/* ── Transmission & Drivetrain ────────────────────────────────── */}
      <SectionHeader>Transmission &amp; drivetrain</SectionHeader>
      <Grid cols={4}>
        <DenseMetricTile
          label="Vehicle speed"
          value={fmt('010D', usePID('010D'))}
          accentBorder="var(--gb)"
          subtext="From VSS output"
          tooltip={<TipContent name="Vehicle Road Speed" description="Wheel speed from the Vehicle Speed Sensor on the transmission output shaft." formula="byte A (km/h direct)" range="Parameter 010D" />}
        />
        <DenseMetricTile
          label="Selected gear"
          value={usePID('01A4') as string}
          subtext="4L60-E · Class II"
          tooltip={<TipContent name="Transmission Actual Gear" description="Current gear as reported by the Transmission Control Module via the GM Class II bus. Requires OBDLink MX+ SW-CAN passthrough." formula="Enumerated byte via GM Class II bus" range="Parameter 01A4 · Park / Reverse / Neutral / 1st–4th" />}
        />
        <DenseMetricTile
          label="Fuel rail"
          value={fmt('0123', usePID('0123'))}
          valueColor="var(--sg)"
          subtext="Spec 55–60 psi"
          tooltip={<TipContent name="Fuel Rail Gauge Pressure" description="Fuel rail pressure above atmospheric. Many engines use a returnless fuel rail controlled by the Engine Control Module." formula="((byte A × 256) + byte B) × 10 kPa → × 0.14504 for psi" range="Parameter 0123 · Spec: 55–60 psi" />}
        />
        <DenseMetricTile
          label="Injection timing"
          value={fmt('015D', usePID('015D'))}
          subtext="Advance angle · BTDC"
          tooltip={<TipContent name="Fuel Injection Timing — Commanded Angle" description="The angle at which fuel injection begins relative to top dead center. Advanced at higher engine load." formula="((byte A × 256) + byte B) ÷ 128 − 210" range="Parameter 015D" />}
        />
      </Grid>

    </ScrollPane>
  );
}
