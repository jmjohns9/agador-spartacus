import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore, vehicleDisplayName } from '../store/appStore';
import { SessionSnapshot } from '../../shared/types';
import {
  ScrollPane, SectionHeader, Card, Grid, Badge, AlertBanner, Button, Divider, EmptyState,
} from '../components/layout/UIComponents';
import { TYPE, WEIGHT, NUMERIC, STATUS_TEXT, Status } from '../theme/theme';

const COMPARE_PIDS: Array<{ pid: string; label: string; unit: string; decimals: number; isFuelTrim?: boolean }> = [
  { pid: 'ATRV', label: 'Battery Voltage', unit: 'V',   decimals: 3 },
  { pid: '010C', label: 'Engine RPM',       unit: 'rpm', decimals: 0 },
  { pid: '0104', label: 'Engine Load',      unit: '%',   decimals: 1 },
  { pid: '0105', label: 'Coolant Temp',     unit: '°F',  decimals: 1 },
  { pid: '0110', label: 'MAF',              unit: 'g/s', decimals: 2 },
  { pid: '010B', label: 'MAP',              unit: 'psi', decimals: 1 },
  { pid: '0111', label: 'Throttle Pos',     unit: '%',   decimals: 1 },
  { pid: '0106', label: 'STFT Bank 1',      unit: '%',   decimals: 1, isFuelTrim: true },
  { pid: '0107', label: 'LTFT Bank 1',      unit: '%',   decimals: 1, isFuelTrim: true },
  { pid: '0108', label: 'STFT Bank 2',      unit: '%',   decimals: 1, isFuelTrim: true },
  { pid: '0109', label: 'LTFT Bank 2',      unit: '%',   decimals: 1, isFuelTrim: true },
  { pid: '012F', label: 'Fuel Level',       unit: '%',   decimals: 1 },
];

const MAX_SNAPS = 10;

function fmtVal(v: number | string | undefined, d: number, unit: string): string {
  if (v === undefined || v === null) return '—';
  return typeof v === 'number' ? `${v.toFixed(d)} ${unit}` : String(v);
}

function deltaColor(delta: number, isFuelTrim: boolean): string {
  if (Math.abs(delta) < 0.05) return 'var(--label-2)';
  if (isFuelTrim) return Math.abs(delta) > 5 ? 'var(--crit-text)' : Math.abs(delta) > 2 ? 'var(--warn-text)' : 'var(--ok-text)';
  return delta > 0 ? 'var(--ok-text)' : 'var(--warn-text)';
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function VoltageOverlay({ live, snap }: { live: number[]; snap: number[] }): React.ReactElement {
  const W = 500; const H = 100;
  const V_MIN = 11.4; const V_MAX = 13.2;
  const yOf = (v: number) => H - ((v - V_MIN) / (V_MAX - V_MIN)) * H;
  const toPoints = (arr: number[]) =>
    arr.length < 2 ? '' : arr.map((v, i) => `${(i / (arr.length - 1)) * W},${yOf(v)}`).join(' ');

  const lastLive = live[live.length - 1] ?? 0;
  const lastSnap = snap[snap.length - 1] ?? 0;
  const liveColor = lastLive < 12.0 ? 'var(--crit)' : lastLive < 12.4 ? 'var(--warn)' : 'var(--accent)';
  const snapColor = lastSnap < 12.0 ? 'var(--crit)' : lastSnap < 12.4 ? 'var(--warn)' : 'var(--teal)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg width="100%" viewBox={`-40 -8 ${W + 80} ${H + 20}`} style={{ overflow: 'visible' }}>
        {[{ v: 12.6, s: 'ok' as Status }, { v: 12.4, s: 'warn' as Status }, { v: 12.0, s: 'crit' as Status }].map(({ v, s }) => (
          <g key={v}>
            <line x1={0} y1={yOf(v)} x2={W} y2={yOf(v)} stroke={`var(--${s})`} strokeWidth="0.6" strokeDasharray="3,3" />
            <text x={W + 4} y={yOf(v) + 4} style={{ ...TYPE.caption, ...NUMERIC, fill: STATUS_TEXT[s] }}>{v}V</text>
          </g>
        ))}
        {snap.length > 1 && (
          <polyline points={toPoints(snap)} fill="none" stroke={snapColor} strokeWidth="1.4" strokeDasharray="5,3" opacity={0.7} />
        )}
        {live.length > 1 && (
          <polyline points={toPoints(live)} fill="none" stroke={liveColor} strokeWidth="1.8" />
        )}
        {live.length > 0 && (
          <circle cx={W} cy={yOf(lastLive)} r="3.5" fill={liveColor} stroke="var(--grouped)" strokeWidth="1.5" />
        )}
      </svg>
      <div style={{ display: 'flex', gap: 16, ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, height: 2, background: 'var(--accent)' }} />
          Live {lastLive ? `${lastLive.toFixed(3)} V` : '—'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, height: 2, backgroundImage: 'repeating-linear-gradient(to right, var(--teal) 0 4px, transparent 4px 7px)' }} />
          Snapshot {lastSnap ? `${lastSnap.toFixed(3)} V` : '—'}
        </span>
      </div>
    </div>
  );
}

function PIDTable({ snap, live }: {
  snap: SessionSnapshot;
  live: Record<string, { value: number | string; timestamp: number }>;
}): React.ReactElement {
  const cols = '1.3fr 90px 90px 90px';
  return (
    <Card padding={0}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '6px 12px', background: 'var(--fill)' }}>
        {['Parameter', 'Snapshot', 'Live', 'Δ'].map((h, i) => (
          <span key={h} style={{ ...TYPE.caption, color: 'var(--label-3)', textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>
        ))}
      </div>
      <Divider />
      {COMPARE_PIDS.map(({ pid, label, unit, decimals, isFuelTrim }, i, arr) => {
        const sv = snap.liveData[pid]?.value;
        const lv = live[pid]?.value;
        const sn = typeof sv === 'number' ? sv : NaN;
        const ln = typeof lv === 'number' ? lv : NaN;
        const delta = !isNaN(sn) && !isNaN(ln) ? ln - sn : NaN;
        return (
          <React.Fragment key={pid}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '6px 12px', alignItems: 'center' }}>
              <span style={{ ...TYPE.body, color: 'var(--label-2)' }}>{label}</span>
              <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--teal)', textAlign: 'right' }}>{fmtVal(sv, decimals, unit)}</span>
              <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--accent-text)', textAlign: 'right' }}>{fmtVal(lv, decimals, unit)}</span>
              <span style={{ ...TYPE.body, ...NUMERIC, color: isNaN(delta) ? 'var(--label-2)' : deltaColor(delta, !!isFuelTrim), textAlign: 'right' }}>
                {isNaN(delta) ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(decimals)} ${unit}`}
              </span>
            </div>
            {i < arr.length - 1 && <Divider />}
          </React.Fragment>
        );
      })}
    </Card>
  );
}

function DTCDiff({ snap, live }: {
  snap: SessionSnapshot;
  live: Array<{ code: string; description: string; status: string; module: string }>;
}): React.ReactElement {
  const snapCodes = new Set(snap.dtcs.map(d => d.code));
  const liveCodes = new Set(live.map(d => d.code));
  const resolved  = snap.dtcs.filter(d => !liveCodes.has(d.code));
  const newCodes  = live.filter(d => !snapCodes.has(d.code));
  const unchanged = live.filter(d =>  snapCodes.has(d.code));

  const dtcRow = (code: string, desc: string, mod: string, status: Status, icon: string) => (
    <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
      <i className={`ti ${icon}`} style={{ color: STATUS_TEXT[status], fontSize: 14, flexShrink: 0 }} aria-hidden />
      <span style={{ ...TYPE.caption, ...NUMERIC, color: STATUS_TEXT[status], flexShrink: 0, minWidth: 60 }}>{code}</span>
      <span style={{ ...TYPE.caption, color: 'var(--label-2)', flex: 1 }}>{desc}</span>
      <span style={{ ...TYPE.caption, color: 'var(--label-3)', flexShrink: 0 }}>{mod}</span>
    </div>
  );

  const section = (label: string, items: Array<{ code: string; description: string; module: string }>, status: Status, icon: string) =>
    items.length === 0 ? null : (
      <div key={label}>
        <div style={{ padding: '6px 12px', ...TYPE.caption, fontWeight: WEIGHT.semibold, color: STATUS_TEXT[status], background: 'var(--fill)' }}>
          {label} ({items.length})
        </div>
        {items.map(d => dtcRow(d.code, d.description, d.module, status, icon))}
      </div>
    );

  if (!resolved.length && !newCodes.length && !unchanged.length) {
    return (
      <Card>
        <EmptyState icon="ti-circle-check" title="No DTC changes" message="No DTCs in snapshot or live session." />
      </Card>
    );
  }

  return (
    <Card padding={0}>
      {section('New since snapshot', newCodes.map(d => ({ code: d.code, description: d.description, module: d.module })), 'crit', 'ti-plus')}
      {section('Resolved since snapshot', resolved, 'ok', 'ti-check')}
      {section('Present in both', unchanged.map(d => ({ code: d.code, description: d.description, module: d.module })), 'neutral', 'ti-minus')}
    </Card>
  );
}

export function CompareScreen(): React.ReactElement {
  const liveData   = useAppStore(s => s.liveData);
  const history    = useAppStore(s => s.history);
  const dtcs       = useAppStore(s => s.dtcs);
  const vehicle    = useAppStore(s => s.vehicle);
  const sessionMs  = useAppStore(s => s.sessionStartMs);
  const connStatus = useAppStore(s => s.connectionStatus);

  const [snapshots,  setSnapshots]  = useState<SessionSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapName,   setSnapName]   = useState('');
  const [saved,      setSaved]      = useState(false);
  const [warnFull,   setWarnFull]   = useState(false);

  const loadSnaps = useCallback(async () => {
    const snaps = await (window.electronAPI.storage.getSnapshots() as Promise<SessionSnapshot[]>);
    setSnapshots(snaps);
    if (!selectedId && snaps.length > 0) setSelectedId(snaps[0].id);
  }, [selectedId]);

  useEffect(() => { loadSnaps(); }, []);

  const selected = useMemo(() => snapshots.find(s => s.id === selectedId) ?? null, [snapshots, selectedId]);

  const liveVolt = useMemo(
    () => (history['ATRV'] ?? []).slice(-120).map(r => typeof r.value === 'number' ? r.value as number : 12.6),
    [history],
  );

  const hasLive = Object.keys(liveData).length > 0;

  const saveSnapshot = async () => {
    if (snapshots.length >= MAX_SNAPS) setWarnFull(true);
    const snap: SessionSnapshot = {
      id:             `snap_${Date.now()}`,
      name:           snapName.trim() || `Snapshot ${new Date().toLocaleTimeString()}`,
      savedAt:        Date.now(),
      vehicleName:    vehicleDisplayName(vehicle),
      liveData:       Object.fromEntries(
        Object.entries(liveData).map(([k, v]) => [k, { value: v.value, timestamp: v.timestamp }])
      ),
      voltageHistory: liveVolt,
      dtcs:           dtcs.map(d => ({ code: d.code, description: d.description, status: d.status, module: d.module })),
      sessionStartMs: sessionMs,
    };
    await window.electronAPI.storage.saveSnapshot(snap);
    setSnapName('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    loadSnaps();
  };

  const deleteSnapshot = async (id: string) => {
    await window.electronAPI.storage.deleteSnapshot(id);
    if (selectedId === id) setSelectedId(null);
    loadSnaps();
  };

  return (
    <ScrollPane>
      {warnFull && (
        <AlertBanner
          message={`Cap reached (${MAX_SNAPS}). Oldest snapshot replaced.`}
          variant="warn"
          action="Dismiss"
          onAction={() => setWarnFull(false)}
        />
      )}

      {/* Save toolbar */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <i className="ti ti-camera" style={{ fontSize: 16, color: 'var(--label-2)', flexShrink: 0 }} aria-hidden />
          <input
            value={snapName}
            onChange={e => setSnapName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && hasLive) saveSnapshot(); }}
            placeholder="Label (e.g. Before fuse pull, After repair…)"
            style={{ flex: 1, minWidth: 180 }}
          />
          <Button variant="primary" icon="ti-camera" disabled={!hasLive} onClick={saveSnapshot}>
            {saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
        {!hasLive && (
          <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>Connect to the vehicle to capture a snapshot.</span>
        )}
      </Card>

      {snapshots.length === 0 ? (
        <Card>
          <EmptyState
            icon="ti-chart-arrows-vertical"
            title="No snapshots yet"
            message="Save one before and after a repair to compare voltage, fuel trims, and DTCs side-by-side."
          />
        </Card>
      ) : (
        <>
          {/* Snapshot list */}
          <SectionHeader>{`Saved snapshots — ${snapshots.length} / ${MAX_SNAPS}`}</SectionHeader>
          <Card padding={0}>
            {snapshots.map((s, i) => (
              <React.Fragment key={s.id}>
                <div
                  className="row-hover"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(s.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(s.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer',
                    background: s.id === selectedId ? 'var(--accent-tint)' : 'transparent',
                    boxShadow: s.id === selectedId ? 'inset 2px 0 0 var(--accent)' : 'none',
                  }}
                >
                  <i className="ti ti-camera" style={{ fontSize: 14, color: s.id === selectedId ? 'var(--accent-text)' : 'var(--label-3)', flexShrink: 0 }} aria-hidden />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TYPE.body, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
                      {fmtDate(s.savedAt)} · {s.vehicleName} · {s.dtcs.length} DTC{s.dtcs.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <Button
                    size="sm" variant="plain" icon="ti-trash" aria-label="Delete snapshot"
                    onClick={e => { e.stopPropagation(); deleteSnapshot(s.id); }}
                  />
                </div>
                {i < snapshots.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Card>

          {selected && (
            <>
              {/* Session header cards */}
              <Grid cols={2} gap={12}>
                <Card style={{ boxShadow: 'inset 2px 0 0 var(--teal)' }}>
                  <div style={{ ...TYPE.caption, fontWeight: WEIGHT.semibold, color: 'var(--teal)', marginBottom: 6 }}>
                    Snapshot · {selected.name}
                  </div>
                  <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)', lineHeight: '18px' }}>
                    <div>{fmtDate(selected.savedAt)}</div>
                    <div>{selected.vehicleName}</div>
                    <div>{Object.keys(selected.liveData).length} PIDs · {selected.dtcs.length} DTCs</div>
                  </div>
                </Card>
                <Card style={{ boxShadow: 'inset 2px 0 0 var(--accent)' }}>
                  <div style={{ ...TYPE.caption, fontWeight: WEIGHT.semibold, color: 'var(--accent-text)', marginBottom: 6 }}>
                    Live · {vehicleDisplayName(vehicle)}
                  </div>
                  <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)', lineHeight: '18px' }}>
                    <div style={{ color: connStatus === 'connected' ? 'var(--ok-text)' : 'var(--label-2)' }}>{connStatus}</div>
                    <div>{Object.keys(liveData).length} PIDs · {dtcs.length} DTCs</div>
                    {sessionMs && <div>Session: {Math.round((Date.now() - sessionMs) / 60000)} min</div>}
                  </div>
                </Card>
              </Grid>

              {/* Voltage overlay */}
              <SectionHeader>Voltage overlay</SectionHeader>
              <Card>
                <VoltageOverlay live={liveVolt} snap={selected.voltageHistory} />
              </Card>

              {/* PID comparison */}
              <SectionHeader>PID comparison</SectionHeader>
              <PIDTable snap={selected} live={liveData} />

              {/* DTC changes */}
              <SectionHeader>DTC changes</SectionHeader>
              <DTCDiff snap={selected} live={dtcs} />
            </>
          )}
        </>
      )}
    </ScrollPane>
  );
}
