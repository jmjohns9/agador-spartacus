import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore, vehicleDisplayName } from '../store/appStore';
import { SessionSnapshot } from '../../shared/types';

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
  if (Math.abs(delta) < 0.05) return 'var(--tm)';
  if (isFuelTrim) return Math.abs(delta) > 5 ? 'var(--sr)' : Math.abs(delta) > 2 ? 'var(--sa)' : 'var(--sg)';
  return delta > 0 ? 'var(--sg)' : 'var(--sa)';
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
  const liveColor = lastLive < 12.0 ? 'var(--sr)' : lastLive < 12.4 ? 'var(--sa)' : 'var(--pp)';
  const snapColor = lastSnap < 12.0 ? 'var(--sr)' : lastSnap < 12.4 ? 'var(--sa)' : 'var(--gb)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
      <svg width="100%" viewBox={`-40 -8 ${W + 80} ${H + 20}`} style={{ overflow: 'visible' }}>
        {[{ v: 12.6, c: 'var(--sg)' }, { v: 12.4, c: 'var(--sa)' }, { v: 12.0, c: 'var(--sr)' }].map(({ v, c }) => (
          <g key={v}>
            <line x1={0} y1={yOf(v)} x2={W} y2={yOf(v)} stroke={c} strokeWidth="0.6" strokeDasharray="3,3" />
            <text x={W + 4} y={yOf(v) + 4} fontSize="7.5" fill={c} fontFamily="monospace">{v}V</text>
          </g>
        ))}
        {snap.length > 1 && (
          <polyline points={toPoints(snap)} fill="none" stroke={snapColor} strokeWidth="1.4" strokeDasharray="5,3" opacity={0.7} />
        )}
        {live.length > 1 && (
          <polyline points={toPoints(live)} fill="none" stroke={liveColor} strokeWidth="1.8" />
        )}
        {live.length > 0 && (
          <circle cx={W} cy={yOf(lastLive)} r="3.5" fill={liveColor} stroke="var(--bg3)" strokeWidth="1.5" />
        )}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 10, fontFamily: 'monospace', color: 'var(--tm)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, height: 2, background: 'var(--pp)' }} />
          Live {lastLive ? `${lastLive.toFixed(3)} V` : '—'}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 18, borderTop: '1px dashed var(--gb)' }} />
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
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--br)' }}>
            {['Parameter', 'Snapshot', 'Live', 'Δ'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Parameter' ? 'left' : 'right', color: 'var(--tm)', fontWeight: 600, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_PIDS.map(({ pid, label, unit, decimals, isFuelTrim }) => {
            const sv = snap.liveData[pid]?.value;
            const lv = live[pid]?.value;
            const sn = typeof sv === 'number' ? sv : NaN;
            const ln = typeof lv === 'number' ? lv : NaN;
            const delta = !isNaN(sn) && !isNaN(ln) ? ln - sn : NaN;
            return (
              <tr key={pid} style={{ borderBottom: '1px solid var(--bg4)' }}>
                <td style={{ padding: '5px 8px', color: 'var(--tm)', fontFamily: 'sans-serif', fontSize: 11 }}>{label}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--gb)' }}>{fmtVal(sv, decimals, unit)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--pp)' }}>{fmtVal(lv, decimals, unit)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: isNaN(delta) ? 'var(--tm)' : deltaColor(delta, !!isFuelTrim) }}>
                  {isNaN(delta) ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(decimals)} ${unit}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

  const dtcRow = (code: string, desc: string, mod: string, color: string, icon: string) => (
    <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid var(--bg4)' }}>
      <i className={`ti ${icon}`} style={{ color, fontSize: 12, flexShrink: 0 }} />
      <span style={{ fontFamily: 'monospace', fontSize: 11, color, flexShrink: 0, minWidth: 54 }}>{code}</span>
      <span style={{ fontSize: 11, color: 'var(--tm)', flex: 1 }}>{desc}</span>
      <span style={{ fontSize: 10, color: 'var(--tm)', flexShrink: 0 }}>{mod}</span>
    </div>
  );

  const section = (label: string, items: Array<{ code: string; description: string; module: string }>, color: string, icon: string) =>
    items.length === 0 ? null : (
      <div key={label}>
        <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color, background: 'var(--bg4)' }}>
          {label} ({items.length})
        </div>
        {items.map(d => dtcRow(d.code, d.description, d.module, color, icon))}
      </div>
    );

  if (!resolved.length && !newCodes.length && !unchanged.length) {
    return <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--tm)', textAlign: 'center' }}>No DTCs in snapshot or live session.</div>;
  }

  return (
    <div>
      {section('New since snapshot', newCodes.map(d => ({ code: d.code, description: d.description, module: d.module })), 'var(--sr)', 'ti-plus')}
      {section('Resolved since snapshot', resolved, 'var(--sg)', 'ti-check')}
      {section('Present in both', unchanged.map(d => ({ code: d.code, description: d.description, module: d.module })), 'var(--tm)', 'ti-minus')}
    </div>
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
    <div style={{ overflowY: 'auto', flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {warnFull && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--sa)', background: 'rgba(255,145,0,0.08)', border: '1px solid var(--sa)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Cap reached ({MAX_SNAPS}). Oldest snapshot replaced.</span>
          <button onClick={() => setWarnFull(false)} style={{ background: 'none', border: 'none', color: 'var(--tm)', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
      )}

      {/* Save toolbar */}
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)', padding: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <i className="ti ti-camera" style={{ fontSize: 14, color: 'var(--pp)', flexShrink: 0 }} />
          <input
            value={snapName}
            onChange={e => setSnapName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && hasLive) saveSnapshot(); }}
            placeholder="Label (e.g. Before fuse pull, After repair…)"
            style={{ flex: 1, minWidth: 180, background: 'var(--bg4)', border: '1px solid var(--br)', color: 'var(--tw)', padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
          />
          <button
            disabled={!hasLive}
            onClick={saveSnapshot}
            style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 700,
              background: hasLive ? 'var(--pp)' : 'var(--bg4)',
              border: 'none', color: hasLive ? '#000' : 'var(--tm)', cursor: hasLive ? 'pointer' : 'not-allowed',
            }}
          >
            <i className="ti ti-camera" style={{ marginRight: 5 }} />
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {!hasLive && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--tm)' }}>Connect to the vehicle to capture a snapshot.</div>
        )}
      </div>

      {snapshots.length === 0 ? (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)', padding: '24px', textAlign: 'center' }}>
          <i className="ti ti-chart-arrows-vertical" style={{ fontSize: 28, color: 'var(--tm)', display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto' }}>
            No snapshots yet. Save one before and after a repair to compare voltage, fuel trims, and DTCs side-by-side.
          </div>
        </div>
      ) : (
        <>
          {/* Snapshot list */}
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)' }}>
            <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--tm)', background: 'var(--bg4)', borderBottom: '1px solid var(--br)' }}>
              Saved snapshots — {snapshots.length} / {MAX_SNAPS}
            </div>
            {snapshots.map(s => (
              <div key={s.id} onClick={() => setSelectedId(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', cursor: 'pointer', background: s.id === selectedId ? 'rgba(255,87,34,0.08)' : 'transparent', borderBottom: '1px solid var(--bg4)', borderLeft: `2px solid ${s.id === selectedId ? 'var(--pp)' : 'transparent'}` }}>
                <i className="ti ti-camera" style={{ fontSize: 12, color: s.id === selectedId ? 'var(--pp)' : 'var(--tm)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: s.id === selectedId ? 'var(--tw)' : 'var(--tm)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: 'monospace' }}>{fmtDate(s.savedAt)} · {s.vehicleName} · {s.dtcs.length} DTC{s.dtcs.length !== 1 ? 's' : ''}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteSnapshot(s.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px 4px', flexShrink: 0 }}>
                  <i className="ti ti-trash" style={{ fontSize: 12 }} />
                </button>
              </div>
            ))}
          </div>

          {selected && (
            <>
              {/* Session header cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderLeft: '2px solid var(--gb)', padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--gb)', marginBottom: 6 }}>Snapshot · {selected.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'monospace', lineHeight: 1.6 }}>
                    <div>{fmtDate(selected.savedAt)}</div>
                    <div>{selected.vehicleName}</div>
                    <div>{Object.keys(selected.liveData).length} PIDs · {selected.dtcs.length} DTCs</div>
                  </div>
                </div>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)', borderLeft: '2px solid var(--pp)', padding: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--pp)', marginBottom: 6 }}>Live · {vehicleDisplayName(vehicle)}</div>
                  <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'monospace', lineHeight: 1.6 }}>
                    <div style={{ color: connStatus === 'connected' ? 'var(--sg)' : 'var(--tm)' }}>{connStatus}</div>
                    <div>{Object.keys(liveData).length} PIDs · {dtcs.length} DTCs</div>
                    {sessionMs && <div>Session: {Math.round((Date.now() - sessionMs) / 60000)} min</div>}
                  </div>
                </div>
              </div>

              {/* Voltage overlay */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '6px 0 2px' }}>Voltage overlay</div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)' }}>
                <VoltageOverlay live={liveVolt} snap={selected.voltageHistory} />
              </div>

              {/* PID comparison */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '6px 0 2px' }}>PID comparison</div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)' }}>
                <PIDTable snap={selected} live={liveData} />
              </div>

              {/* DTC changes */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '6px 0 2px' }}>DTC changes</div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)' }}>
                <DTCDiff snap={selected} live={dtcs} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
