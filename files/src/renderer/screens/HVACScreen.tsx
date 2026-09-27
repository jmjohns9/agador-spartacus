import React from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Grid, Card, Metric, Gauge, Badge, DataRow, EmptyState, Divider,
} from '../components/layout/UIComponents';
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

// ─── HVACScreen ───────────────────────────────────────────────────────────────

export function HVACScreen(): React.ReactElement {
  const dtcs     = useAppStore(s => s.dtcs);
  const platform = useAppStore(s => s.platform);
  const isGMT800 = platform.id === 'gmt800';
  const rpm      = usePIDNum('010C');

  const ambientF = usePIDNum('0146', 0);
  const coolantF = usePIDNum('0105', 0);

  // Timestamps lifted to top of component (hook rules)
  const coolantAt = useAppStore(s => s.liveData['0105']?.timestamp);
  const ambientAt = useAppStore(s => s.liveData['0146']?.timestamp);

  // Infer A/C compressor state from engine load jump (crude heuristic)
  // A real implementation would use BCM data via SW-CAN
  const engineOn  = rpm > 200;

  // HVAC-related DTCs
  const hvacDTCs = dtcs.filter(d =>
    d.code.startsWith('B') || d.description.toLowerCase().includes('hvac') ||
    d.description.toLowerCase().includes('blend') || d.description.toLowerCase().includes('heat')
  );

  // Delta between ambient and coolant — shows heater effectiveness
  const heaterDelta = coolantF > 0 && ambientF > 0 ? coolantF - ambientF : 0;
  const coolantStatus: Status = coolantF > 230 ? 'crit' : coolantF > 215 ? 'warn' : 'neutral';
  // "Good" (delta > 100) is neutral, not colored — only the warn band stands out.
  const heaterDeltaStatus: Status = heaterDelta > 50 && heaterDelta <= 100 ? 'warn' : 'neutral';

  return (
    <ScrollPane>

      {/* ── Hero row — coolant temperature leads the screen ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8 }}>
        <Metric
          size="hero"
          label="Coolant — heater source"
          value={coolantF > 0 ? coolantF.toFixed(0) : '—'}
          unit="°F"
          status={coolantStatus}
          subtext={
            coolantF <= 0 ? 'No reading' :
            coolantF > 230 ? 'Overheating — stop and investigate' :
            coolantF > 215 ? 'High — monitor closely' :
            coolantF > 180 ? 'Normal operating range' :
            coolantF > 100 ? 'Warming up — heater still cool' :
            'Cold start'
          }
          spark={{ pid: '0105', color: 'var(--ok)' }}
          staleAt={coolantAt}
        />
        <Metric
          size="hero"
          label="Ambient outside"
          value={ambientF > 0 ? `${ambientF.toFixed(0)}` : '—'}
          unit="°F"
          subtext={engineOn ? 'Bumper sensor' : 'May be biased by engine heat'}
          spark={{ pid: '0146', color: 'var(--teal)' }}
          staleAt={ambientAt}
        />
        <Metric
          size="hero"
          label="Heater effectiveness"
          value={heaterDelta > 0 ? `+${heaterDelta.toFixed(0)}` : '—'}
          unit="°F delta"
          subtext={heaterDelta > 100 ? 'Strong heat available' : heaterDelta > 50 ? 'Moderate — still warming' : heaterDelta > 0 ? 'Low — coolant cold' : 'Coolant − ambient delta'}
          status={heaterDeltaStatus}
          spark={{ pid: '0105', color: 'var(--warn)' }}
        />
      </div>

      {/* ── Detailed sensors ────────────────────────────────────────── */}
      <SectionHeader>Temperature sensors</SectionHeader>
      <Grid cols={4}>
        <Gauge size="compact" label="Coolant" value={coolantF} max={240} unit="°F" />
        <Gauge size="compact" label="Ambient" value={ambientF} max={120} unit="°F" />
        <Metric
          size="compact"
          label="Intake air temp"
          value={fmt('010F', usePID('010F'))}
          subtext="At MAF housing · blower heat"
        />
        <Metric
          size="compact"
          label="Heater delta"
          value={heaterDelta > 0 ? `+${heaterDelta.toFixed(0)} °F` : '—'}
          subtext="Coolant − ambient · higher = better"
          status={heaterDeltaStatus}
        />
      </Grid>

      {/* ── HVAC system status ─────────────────────────────────────────── */}
      <SectionHeader>HVAC system{isGMT800 ? ' (GMT800 — via BCM Class II)' : ''}</SectionHeader>
      <Grid cols={3}>
        <Card>
          <SectionHeader>Heater core</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Coolant supply</span>
              <span style={{ ...TYPE.body, ...NUMERIC, color: coolantF > 160 ? 'var(--label)' : STATUS_TEXT.warn }}>
                {coolantF > 0 ? `${coolantF} °F` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Min for heat</span>
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>140 °F</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Status</span>
              <Badge
                label={coolantF > 160 ? 'Heating available' : coolantF > 0 ? 'Warming up' : 'No data'}
                variant={coolantF > 160 ? 'ok' : 'warn'}
              />
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader>A/C compressor</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Engine</span>
              <Badge label={engineOn ? 'Running' : 'Off'} variant={engineOn ? 'ok' : 'muted'} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Compressor state</span>
              <Badge label="SW-CAN required" variant="info" />
            </div>
            <div style={{ ...TYPE.caption, color: 'var(--label-2)' }}>
              A/C state requires BCM data via OBDLink MX+ SW-CAN passthrough (STPX command)
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader>Blower motor</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ ...TYPE.caption, color: 'var(--label-2)' }}>
              Blower speed is controlled by the BCM on Class II bus. Direct readout requires GM enhanced diagnostics via SW-CAN passthrough.
            </div>
            <Badge label="Requires GM enhanced" variant="info" />
          </div>
        </Card>
      </Grid>

      {/* ── Blend door actuator — GMT800 only ──────────────────────────── */}
      {isGMT800 && (
        <>
          <SectionHeader>Blend door actuator — known issue</SectionHeader>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ ...TYPE.body, color: 'var(--label)', marginBottom: 8 }}>
                  Known parasitic draw contributor
                </div>
                <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginBottom: 8 }}>
                  The HVAC blend door actuator on the GMT800 platform is a known parasitic draw source.
                  A faulty actuator motor continuously hunts for its calibrated position, drawing
                  ~0.1 A even with the engine off if the HVAC module is kept awake by the BCM.
                </div>
                <div style={{ ...TYPE.caption, color: STATUS_TEXT.warn }}>
                  If voltage is dropping with no IPC/BCM fault codes, inspect the HVAC blend door actuator
                  (located under the dash on the passenger side) for continuous clicking/movement after ignition-off.
                </div>
              </div>
              <div>
                <SectionHeader>Diagnostic steps</SectionHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {[
                    'Wait 10 min after engine-off',
                    'Listen for clicking near HVAC box (under dash, passenger side)',
                    'If clicking persists: pull HVAC fuse in IPFB',
                    'Observe voltage stabilization on battery timeline',
                    'Replace blend door actuator if confirmed',
                  ].map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 8, flexShrink: 0,
                        background: 'var(--fill)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        ...TYPE.caption, color: 'var(--label-2)',
                      }}>
                        {i + 1}
                      </div>
                      <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ── HVAC fault codes ────────────────────────────────────────────── */}
      <SectionHeader>HVAC-related fault codes</SectionHeader>
      {hvacDTCs.length > 0 ? (
        <Card padding={0}>
          {hvacDTCs.map((dtc, i) => (
            <React.Fragment key={dtc.code}>
              <DataRow
                pid={dtc.code}
                name={dtc.description}
                value=""
                badge={<Badge label={dtc.status} variant={dtc.status === 'active' ? 'crit' : 'warn'} />}
              />
              {i < hvacDTCs.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState icon="ti-circle-check" title="No HVAC-related fault codes stored" />
        </Card>
      )}

      {/* ── Common HVAC codes reference ─────────────────────────────────── */}
      <SectionHeader>Common HVAC codes{isGMT800 ? ' — GMT800 reference' : ''}</SectionHeader>
      <Card padding={0}>
        {[
          { code: 'B0260', desc: 'A/C refrigerant pressure sensor circuit fault', circuit: 'A/C' },
          { code: 'B0475', desc: 'Rear HVAC blend door actuator circuit fault', circuit: 'HVAC' },
          { code: 'B0480', desc: 'Rear HVAC mode door actuator circuit fault', circuit: 'HVAC' },
          { code: 'B3703', desc: 'HVAC blend door — calibration required after replacement', circuit: 'HVAC' },
          { code: 'P0480', desc: 'Cooling fan 1 control circuit — condenser fan relay', circuit: 'A/C' },
        ].map(({ code, desc, circuit }, i, arr) => (
          <React.Fragment key={code}>
            <DataRow pid={code} name={desc} value="" badge={<Badge label={circuit} variant="info" />} />
            {i < arr.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </Card>

    </ScrollPane>
  );
}
