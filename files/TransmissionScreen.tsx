import React from 'react';
import { useAppStore } from './appStore';
import { ScrollPane, SectionHeader, Grid, MetricTile, ArcGauge, Card, Badge } from './UIComponents';
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

// ─── Gear indicator ──────────────────────────────────────────────────────────

function GearIndicator({ gear }: { gear: string | number }): React.ReactElement {
  const label = String(gear);
  const gears = ['P', 'R', 'N', 'D', '3', '2', '1'];
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      {gears.map(g => (
        <div key={g} style={{
          width: 30, height: 30, borderRadius: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: label === g ? 'var(--pp)' : 'var(--bg4)',
          border: `1px solid ${label === g ? 'var(--pp)' : 'var(--br)'}`,
          fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14,
          color: label === g ? '#000' : 'var(--tm)',
          transition: 'all 0.1s',
        }}>
          {g}
        </div>
      ))}
    </div>
  );
}

// ─── TransmissionScreen ───────────────────────────────────────────────────────

export function TransmissionScreen(): React.ReactElement {
  const isDark  = useAppStore(s => s.isDarkMode);
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

      {/* ── Primary gauges ─────────────────────────────────────────────── */}
      <SectionHeader>4L60-E transmission — live data</SectionHeader>
      <Grid cols={4}>
        <ArcGauge
          label="Vehicle speed"
          value={speedMph}
          min={0} max={120} unit="mph"
          isDark={isDark} size={90}
          color="var(--gb)"
        />
        <ArcGauge
          label="Engine RPM"
          value={rpm}
          min={0} max={6000} unit="rpm"
          warnHigh={5500} critHigh={6000}
          isDark={isDark} size={90}
        />
        <MetricTile
          label="Road speed (raw)"
          value={fmt('010D', usePID('010D'))}
          subtext={`${speedMph.toFixed(0)} mph · VSS on output shaft`}
        />
        <MetricTile
          label="Engine load"
          value={fmt('0104', usePID('0104'))}
          subtext="TCC lock-up demand"
        />
      </Grid>

      {/* ── Gear selector ──────────────────────────────────────────────── */}
      <SectionHeader>Gear selection (GM Class II enhanced)</SectionHeader>
      <Grid cols={2}>
        <Card>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Current gear — TCM via Class II bus
          </div>
          <GearIndicator gear={gear} />
          <div style={{ textAlign: 'center', marginTop: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 18, color: 'var(--pp)' }}>
            {String(gear) !== '—' ? String(gear) : '—'}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--tm)', marginTop: 4 }}>
            4L60-E 4-speed automatic · TCM address 0x60
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Torque converter clutch
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <MetricTile
              label="TCC slip estimate"
              value={tccSlip > 0 ? `~${Math.round(tccSlip)} rpm` : '—'}
              subtext={tccSlip > 200 ? 'High slip — TCC may be unlocked or slipping' : tccSlip > 0 ? 'Normal converter slip' : 'Requires highway speed data'}
              valueColor={tccSlip > 200 ? 'var(--sa)' : 'var(--tm)'}
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
          <div key={g} style={{
            display: 'grid', gridTemplateColumns: '60px 70px 80px 1fr',
            gap: 10, padding: '9px 12px',
            borderBottom: i < arr.length - 1 ? '1px solid var(--bg3)' : 'none',
            background: String(gear) === g.split('/')[0] ? 'rgba(255,128,0,0.05)' : 'transparent',
          }}>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--pp)' }}>{g}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--tw)' }}>{ratio}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--tm)' }}>{rpm_at_60}</span>
            <span style={{ fontSize: 11, color: 'var(--tm)' }}>{notes}</span>
          </div>
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
        ].map(({ code, desc, severity }, i, arr) => (
          <div key={code} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderBottom: i < arr.length - 1 ? '1px solid var(--bg3)' : 'none',
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--tm)', width: 44 }}>{code}</span>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--tw)' }}>{desc}</span>
            <Badge label={severity === 'crit' ? 'Critical' : 'Warning'} variant={severity} />
          </div>
        ))}
      </Card>

    </ScrollPane>
  );
}
