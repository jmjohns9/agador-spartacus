import React from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Grid, Card, Metric, Gauge, Badge, DataRow, Divider,
} from '../components/layout/UIComponents';
import { TYPE, WEIGHT, NUMERIC, RADIUS } from '../theme/theme';
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

function usePIDTimestamp(pid: string): number | undefined {
  return useAppStore(s => s.liveData[pid]?.timestamp);
}

function fmt(pid: string, v: number | string): string {
  if (v === '—') return '—';
  const def = PID_MAP.get(pid);
  if (!def || typeof v !== 'number') return String(v);
  return def.format(v);
}

// ─── Gear indicator ──────────────────────────────────────────────────────────
// Read-only state display, styled like SegmentedControl but not interactive.
// PID 01A4 reports the forward gear number; 0 means not in a forward gear
// (park, reverse or neutral are not told apart).

const GEARS = [0, 1, 2, 3, 4];

function GearIndicator({ gear }: { gear: number | null }): React.ReactElement {
  return (
    <div role="group" aria-label="Current gear" style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--fill)', borderRadius: RADIUS.control + 1 }}>
      {GEARS.map(g => {
        const active = gear === g;
        return (
          <span key={g} aria-current={active || undefined} style={{
            width: 24, height: 24, borderRadius: RADIUS.control - 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...TYPE.body, fontWeight: WEIGHT.semibold,
            background: active ? 'var(--accent)' : 'var(--fill)',
            color: active ? 'var(--on-accent)' : 'var(--label-2)',
          }}>
            {g === 0 ? 'N' : g}
          </span>
        );
      })}
    </div>
  );
}

// 4L60-E ratios. Engine rpm at 60 mph assumes a 3.73 axle and 31.6-inch
// tyres: 638 wheel rpm × 3.73 = 2,380 rpm in direct (3rd).
const RPM_AT_60_DIRECT = 2380;
const RATIOS = [
  { gear: '1st',    n: 1, ratio: 3.06, notes: 'Launch; 60 mph is past redline' },
  { gear: '2nd',    n: 2, ratio: 1.63, notes: 'Second gear' },
  { gear: '3rd',    n: 3, ratio: 1.00, notes: 'Direct drive' },
  { gear: '4th/OD', n: 4, ratio: 0.70, notes: 'Overdrive — TCC locks above ~45 mph' },
];

// ─── TransmissionScreen ───────────────────────────────────────────────────────

export function TransmissionScreen(): React.ReactElement {
  const speed   = usePIDNum('010D');
  const rpm     = usePIDNum('010C');
  const gearRaw = usePID('01A4');
  const gear    = typeof gearRaw === 'number' && Number.isFinite(gearRaw) ? gearRaw : null;
  const isGMT800 = useAppStore(s => s.platform.id === 'gmt800');

  // TCC slip: engine rpm above what a locked converter would turn in
  // overdrive at this road speed. Only meaningful in 4th on a known driveline.
  const speedMph = speed * 0.621371;
  const lockedRpm = (speedMph / 60) * RPM_AT_60_DIRECT * 0.70;
  const tccSlip: number | null = isGMT800 && gear === 4 && speedMph > 40 && rpm > 0
    ? Math.max(0, rpm - lockedRpm)
    : null;
  const tccWhy = !isGMT800 ? 'Needs a known transmission'
    : gear === null ? 'Gear not reported'
    : gear !== 4 ? 'Only estimated in 4th'
    : 'Needs more than 40 mph';

  return (
    <ScrollPane>

      {/* ── Hero row — speed and RPM lead the screen ───────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8 }}>
        <Metric
          size="hero"
          label="Vehicle speed"
          value={speedMph > 0 ? speedMph.toFixed(0) : '—'}
          unit="mph"
          subtext={`Raw: ${fmt('010D', usePID('010D'))} · VSS output shaft`}
          spark={{ pid: '010D', color: 'var(--teal)' }}
          staleAt={usePIDTimestamp('010D')}
        />
        <Metric
          size="hero"
          label="Engine RPM"
          value={rpm > 0 ? rpm.toLocaleString() : '—'}
          unit="rpm"
          subtext={rpm === 0 ? 'Engine off' : rpm < 900 ? 'Idle' : 'Running'}
          status={rpm > 5500 ? 'warn' : 'neutral'}
          spark={{ pid: '010C', color: 'var(--accent)' }}
          staleAt={usePIDTimestamp('010C')}
        />
        <Metric
          size="hero"
          label="Engine load"
          value={fmt('0104', usePID('0104'))}
          subtext="TCC lock-up demand"
          spark={{ pid: '0104', color: 'var(--teal)' }}
          staleAt={usePIDTimestamp('0104')}
        />
      </div>

      {/* ── Primary gauges ─────────────────────────────────────────────── */}
      <SectionHeader>{isGMT800 ? '4L60-E transmission — live data' : 'Transmission — live data'}</SectionHeader>
      <Grid cols={4}>
        <Gauge size="compact" label="Speed" value={Math.round(speedMph)} max={120} unit="mph" />
        <Gauge size="compact" label="RPM" value={rpm} max={6000} unit="/ 6,000" />
        <Metric
          size="compact"
          label="Road speed (raw)"
          value={fmt('010D', usePID('010D'))}
          subtext={`${speedMph.toFixed(0)} mph · VSS`}
        />
        <Metric
          size="compact"
          label="Engine load"
          value={fmt('0104', usePID('0104'))}
          subtext="TCC lock-up demand"
        />
      </Grid>

      {/* ── Gear selector ──────────────────────────────────────────────── */}
      <SectionHeader>Gear</SectionHeader>
      <Grid cols={2}>
        <Card>
          <SectionHeader>Current gear — reported by the TCM</SectionHeader>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <GearIndicator gear={gear} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 8, ...TYPE.title3, ...NUMERIC, color: 'var(--accent-text)' }}>
            {fmt('01A4', gearRaw)}
          </div>
          <div style={{ textAlign: 'center', ...TYPE.caption, color: 'var(--label-2)', marginTop: 4 }}>
            {gear === null ? 'Not reported — many pre-2010 vehicles do not support PID A4' : 'N = not in a forward gear (park, reverse or neutral)'}
          </div>
        </Card>

        <Card>
          <SectionHeader>Torque converter clutch</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <Metric
              size="compact"
              label="TCC slip est"
              value={tccSlip === null ? '—' : `~${Math.round(tccSlip)} rpm`}
              subtext={tccSlip === null ? tccWhy : tccSlip > 200 ? 'High slip — TCC may be unlocked' : 'Converter locked or near'}
              status={tccSlip !== null && tccSlip > 200 ? 'warn' : 'neutral'}
            />
          </div>
        </Card>
      </Grid>

      {isGMT800 && (
        <>
      {/* ── 4L60-E reference ───────────────────────────────────────────── */}
      <SectionHeader>4L60-E gear ratios · rpm at 60 mph with 3.73 axle, 31.6″ tyres</SectionHeader>
      <Card padding={0}>
        {[
          ...RATIOS.map(r => ({ ...r, ratioText: `${r.ratio.toFixed(2)}:1`, rpm_at_60: `~${Math.round(RPM_AT_60_DIRECT * r.ratio).toLocaleString()}` })),
          { gear: 'Reverse', n: -1, ratio: 2.29, ratioText: '2.29:1', rpm_at_60: 'N/A', notes: 'Reverse' },
        ].map(({ gear: g, n, ratioText, rpm_at_60, notes }, i, arr) => (
          <React.Fragment key={g}>
            <div style={{
              display: 'grid', gridTemplateColumns: '60px 70px 80px 1fr',
              gap: 8, padding: '8px 12px',
              background: gear === n ? 'var(--accent-tint)' : 'transparent',
            }}>
              <span style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, color: 'var(--label)' }}>{g}</span>
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>{ratioText}</span>
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>{rpm_at_60}</span>
              <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{notes}</span>
            </div>
            {i < arr.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </Card>

      {/* ── Common transmission DTCs ───────────────────────────────────── */}
      <SectionHeader>Common 4L60-E fault codes</SectionHeader>
      <Card padding={0}>
        {[
          { code: 'P0700', desc: 'Transmission Control System fault — check TCM', severity: 'warn' as const },
          { code: 'P0711', desc: 'TFT sensor circuit range/performance — TFT sensor', severity: 'warn' as const },
          { code: 'P0742', desc: 'TCC circuit stuck on — TCC solenoid or clutch pack', severity: 'crit' as const },
          { code: 'P0751', desc: '1-2 shift solenoid stuck off — solenoid failure', severity: 'warn' as const },
          { code: 'P0753', desc: '1-2 shift solenoid electrical — wiring or solenoid', severity: 'warn' as const },
          { code: 'P1860', desc: 'TCC PWM solenoid circuit electrical — GM specific', severity: 'warn' as const },
        ].map(({ code, desc, severity }) => (
          <DataRow
            key={code}
            pid={code}
            name={desc}
            value=""
            badge={<Badge label={severity === 'crit' ? 'Critical' : 'Warning'} variant={severity} />}
          />
        ))}
      </Card>

        </>
      )}

    </ScrollPane>
  );
}
