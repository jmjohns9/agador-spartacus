import React from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Grid, DenseMetricTile, CompactArcGauge,
  HeroCard, Card, Badge,
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

function usePIDTimestamp(pid: string): number | undefined {
  return useAppStore(s => s.liveData[pid]?.timestamp);
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

  return (
    <ScrollPane>

      {/* ── Hero row — coolant temperature leads the screen ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <HeroCard
          label="Coolant — heater source"
          value={coolantF > 0 ? coolantF.toFixed(0) : '—'}
          unit="°F"
          valueColor={coolantF > 230 ? 'var(--sr)' : coolantF > 215 ? 'var(--sa)' : coolantF > 180 ? 'var(--sg)' : coolantF > 0 ? 'var(--gb)' : 'var(--tm)'}
          accentBorder={coolantF > 230 ? 'var(--sr)' : 'var(--sg)'}
          subtext={
            coolantF <= 0 ? 'No reading' :
            coolantF > 230 ? 'OVERHEATING — stop and investigate' :
            coolantF > 215 ? 'High — monitor closely' :
            coolantF > 180 ? 'Normal operating range' :
            coolantF > 100 ? 'Warming up — heater still cool' :
            'Cold start'
          }
          pid="0105"
          sparkColor="var(--sg)"
          staleAt={coolantAt}
        />
        <HeroCard
          label="Ambient outside"
          value={ambientF > 0 ? `${ambientF.toFixed(0)}` : '—'}
          unit="°F"
          subtext={engineOn ? 'Bumper sensor' : 'May be biased by engine heat'}
          pid="0146"
          sparkColor="var(--gb)"
          staleAt={ambientAt}
        />
        <HeroCard
          label="Heater effectiveness"
          value={heaterDelta > 0 ? `+${heaterDelta.toFixed(0)}` : '—'}
          unit="°F delta"
          subtext={heaterDelta > 100 ? 'Strong heat available' : heaterDelta > 50 ? 'Moderate — still warming' : heaterDelta > 0 ? 'Low — coolant cold' : 'Coolant − ambient delta'}
          valueColor={heaterDelta > 100 ? 'var(--sg)' : heaterDelta > 50 ? 'var(--sa)' : 'var(--tm)'}
          pid="0105"
          sparkColor="var(--sa)"
        />
      </div>

      {/* ── Detailed sensors ────────────────────────────────────────── */}
      <SectionHeader>Temperature sensors</SectionHeader>
      <Grid cols={4}>
        <CompactArcGauge
          label="Coolant"
          value={coolantF}
          max={240}
          unit="°F"
          color={coolantF < 140 ? 'var(--gb)' : coolantF > 220 ? 'var(--sr)' : 'var(--sg)'}
        />
        <CompactArcGauge
          label="Ambient"
          value={ambientF}
          max={120}
          unit="°F"
          color="var(--gb)"
        />
        <DenseMetricTile
          label="Intake air temp"
          value={fmt('010F', usePID('010F'))}
          subtext="At MAF housing · blower heat"
        />
        <DenseMetricTile
          label="Heater delta"
          value={heaterDelta > 0 ? `+${heaterDelta.toFixed(0)} °F` : '—'}
          subtext="Coolant − ambient · higher = better"
          valueColor={heaterDelta > 100 ? 'var(--sg)' : heaterDelta > 50 ? 'var(--sa)' : 'var(--tm)'}
        />
      </Grid>

      {/* ── HVAC system status ─────────────────────────────────────────── */}
      <SectionHeader>HVAC system{isGMT800 ? ' (GMT800 — via BCM Class II)' : ''}</SectionHeader>
      <Grid cols={3}>
        <Card>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Heater core
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--tm)' }}>Coolant supply</span>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 13, color: coolantF > 160 ? 'var(--sg)' : 'var(--sa)' }}>
                {coolantF > 0 ? `${coolantF} °F` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--tm)' }}>Min for heat</span>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tm)' }}>140 °F</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--tm)' }}>Status</span>
              <Badge
                label={coolantF > 160 ? 'Heating available' : coolantF > 0 ? 'Warming up' : 'No data'}
                variant={coolantF > 160 ? 'ok' : 'warn'}
              />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            A/C compressor
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--tm)' }}>Engine</span>
              <Badge label={engineOn ? 'Running' : 'Off'} variant={engineOn ? 'ok' : 'muted'} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--tm)' }}>Compressor state</span>
              <Badge label="SW-CAN required" variant="info" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--tm)', lineHeight: 1.5 }}>
              A/C state requires BCM data via OBDLink MX+ SW-CAN passthrough (STPX command)
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Blower motor
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--tm)', lineHeight: 1.5 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '4px 2px' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--tw)', fontWeight: 500, marginBottom: 6 }}>
                  Known parasitic draw contributor
                </div>
                <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.6, marginBottom: 8 }}>
                  The HVAC blend door actuator on the GMT800 platform is a known parasitic draw source.
                  A faulty actuator motor continuously hunts for its calibrated position, drawing
                  ~0.1 A even with the engine off if the HVAC module is kept awake by the BCM.
                </div>
                <div style={{ fontSize: 11, color: 'var(--sa)', lineHeight: 1.5 }}>
                  If voltage is dropping with no IPC/BCM fault codes, inspect the HVAC blend door actuator
                  (located under the dash on the passenger side) for continuous clicking/movement after ignition-off.
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                  Diagnostic steps
                </div>
                {[
                  'Wait 10 min after engine-off',
                  'Listen for clicking near HVAC box (under dash, passenger side)',
                  'If clicking persists: pull HVAC fuse in IPFB',
                  'Observe voltage stabilization on battery timeline',
                  'Replace blend door actuator if confirmed',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 5 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--bg4)', border: '2px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--tm)', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--tm)', lineHeight: 1.5 }}>{step}</span>
                  </div>
                ))}
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
            <div key={dtc.code} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderBottom: i < hvacDTCs.length - 1 ? '1px solid var(--bg3)' : 'none',
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--sr)', width: 50 }}>{dtc.code}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--tw)' }}>{dtc.description}</span>
              <Badge label={dtc.status} variant={dtc.status === 'active' ? 'crit' : 'warn'} />
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--sg)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <i className="ti ti-circle-check" style={{ fontSize: 16 }} />
            No HVAC-related fault codes stored
          </div>
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
          <div key={code} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderBottom: i < arr.length - 1 ? '1px solid var(--bg3)' : 'none',
          }}>
            <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tm)', width: 44 }}>{code}</span>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--tw)' }}>{desc}</span>
            <Badge label={circuit} variant="info" />
          </div>
        ))}
      </Card>

    </ScrollPane>
  );
}
