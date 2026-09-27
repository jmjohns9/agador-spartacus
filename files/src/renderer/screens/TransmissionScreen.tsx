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

function GearIndicator({ gear }: { gear: string | number }): React.ReactElement {
  const label = String(gear);
  const gears = ['P', 'R', 'N', 'D', '3', '2', '1'];
  return (
    <div role="group" aria-label="Current gear" style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--fill)', borderRadius: RADIUS.control + 1 }}>
      {gears.map(g => {
        const active = label === g;
        return (
          <span key={g} style={{
            width: 24, height: 24, borderRadius: RADIUS.control - 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...TYPE.body, fontWeight: WEIGHT.semibold,
            background: active ? 'var(--accent)' : 'var(--fill)',
            color: active ? 'var(--on-accent)' : 'var(--label-2)',
          }}>
            {g}
          </span>
        );
      })}
    </div>
  );
}

// ─── TransmissionScreen ───────────────────────────────────────────────────────

export function TransmissionScreen(): React.ReactElement {
  const speed   = usePIDNum('010D');
  const rpm     = usePIDNum('010C');
  const gear    = usePID('01A4');
  const load    = usePIDNum('0104');

  // Estimated TCC (Torque Converter Clutch) slip — crude estimate from speed vs RPM
  // At highway speed in 4th, RPM/MPH ratio ≈ 30:1 for 4L60-E with 3.73 gears
  const speedMph = speed * 0.621371;
  const tccSlip  = speedMph > 30 && rpm > 0
    ? Math.max(0, rpm - speedMph * 30)
    : 0;

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
      <SectionHeader>4L60-E transmission — live data</SectionHeader>
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
      <SectionHeader>Gear selection (GM Class II enhanced)</SectionHeader>
      <Grid cols={2}>
        <Card>
          <SectionHeader>Current gear — TCM via Class II bus</SectionHeader>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <GearIndicator gear={gear} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 8, ...TYPE.title3, ...NUMERIC, color: 'var(--accent-text)' }}>
            {String(gear) !== '—' ? String(gear) : '—'}
          </div>
          <div style={{ textAlign: 'center', ...TYPE.caption, color: 'var(--label-2)', marginTop: 4 }}>
            4L60-E 4-speed automatic · TCM address 0x60
          </div>
        </Card>

        <Card>
          <SectionHeader>Torque converter clutch</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <Metric
              size="compact"
              label="TCC slip est"
              value={tccSlip > 0 ? `~${Math.round(tccSlip)} rpm` : '—'}
              subtext={tccSlip > 200 ? 'High slip — TCC may be unlocked' : tccSlip > 0 ? 'Normal converter slip' : 'Requires hwy speed'}
              status={tccSlip > 200 ? 'warn' : 'neutral'}
            />
          </div>
        </Card>
      </Grid>

      {/* ── 4L60-E reference ───────────────────────────────────────────── */}
      <SectionHeader>4L60-E gear ratio reference</SectionHeader>
      <Card padding={0}>
        {[
          { gear: '1st',     ratio: '3.06:1', rpm_at_60: '~2800', notes: 'First gear, manual range or low speed' },
          { gear: '2nd',     ratio: '1.63:1', rpm_at_60: '~1500', notes: 'Second gear' },
          { gear: '3rd',     ratio: '1.00:1', rpm_at_60: '~900',  notes: 'Third gear (direct drive)' },
          { gear: '4th/OD',  ratio: '0.70:1', rpm_at_60: '~650',  notes: 'Overdrive — TCC locks above ~45 mph' },
          { gear: 'Reverse', ratio: '2.29:1', rpm_at_60: 'N/A',   notes: 'Reverse — do not exceed 35 mph' },
        ].map(({ gear: g, ratio, rpm_at_60, notes }, i, arr) => (
          <React.Fragment key={g}>
            <div style={{
              display: 'grid', gridTemplateColumns: '60px 70px 80px 1fr',
              gap: 8, padding: '8px 12px',
              background: String(gear) === g.split('/')[0] ? 'var(--accent-tint)' : 'transparent',
            }}>
              <span style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, color: 'var(--label)' }}>{g}</span>
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>{ratio}</span>
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

    </ScrollPane>
  );
}
