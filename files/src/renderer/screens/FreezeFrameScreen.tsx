import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { FreezeFrame } from '../../shared/types';

const COMPARE_PIDS = ['ATRV','010C','0104','0105','0110','010B','0111','0106','0107','0108','0109','012F'];
const PID_LABELS: Record<string, string> = {
  ATRV: 'Battery Voltage', '010C': 'Engine RPM', '0104': 'Engine Load',
  '0105': 'Coolant Temp',  '0110': 'MAF',         '010B': 'MAP',
  '0111': 'Throttle Pos',  '0106': 'STFT Bank 1', '0107': 'LTFT Bank 1',
  '0108': 'STFT Bank 2',   '0109': 'LTFT Bank 2', '012F': 'Fuel Level',
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function FreezeFrameScreen(): React.ReactElement {
  const liveData             = useAppStore(s => s.liveData);
  const freezeFrameFilter    = useAppStore(s => s.freezeFrameFilter);
  const setFreezeFrameFilter = useAppStore(s => s.setFreezeFrameFilter);

  const [frames,   setFrames]   = useState<FreezeFrame[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all = await window.electronAPI.storage.getFreezeFrames() as FreezeFrame[];
    setFrames(all);
    if (freezeFrameFilter) {
      const match = all.find(f => f.dtcCode === freezeFrameFilter);
      if (match) setSelected(match.id);
      setFreezeFrameFilter(null);
    } else if (all.length > 0 && !selected) {
      setSelected(all[0].id);
    }
  }, [freezeFrameFilter, selected, setFreezeFrameFilter]);

  useEffect(() => { load(); }, []);

  const frame = frames.find(f => f.id === selected) ?? null;

  const deleteFrame = async (id: string) => {
    await window.electronAPI.storage.deleteFreezeFrame(id);
    if (selected === id) setSelected(null);
    load();
  };

  const exportCSV = (f: FreezeFrame) => {
    const rows = Object.entries(f.liveData).map(([pid, r]) => `${pid},${r.value}`);
    const csv  = ['pid,value_at_fault', ...rows].join('\n');
    window.electronAPI.exportCSV(csv, `freeze-frame-${f.dtcCode}-${new Date(f.capturedAt).toISOString().split('T')[0]}.csv`);
  };

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {frames.length === 0 ? (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)', padding: '32px 24px', textAlign: 'center' }}>
          <i className="ti ti-camera" style={{ fontSize: 28, color: 'var(--tm)', display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto' }}>
            No freeze frames captured yet. When a DTC is detected, a snapshot of all live PID values is saved automatically.
          </div>
        </div>
      ) : (
        <>
          {/* Frame list */}
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)' }}>
            {frames.map(f => (
              <div
                key={f.id}
                onClick={() => setSelected(f.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', cursor: 'pointer', background: f.id === selected ? 'rgba(255,87,34,0.08)' : 'transparent', borderBottom: '1px solid var(--bg4)', borderLeft: `2px solid ${f.id === selected ? 'var(--pp)' : 'transparent'}` }}
              >
                <i className="ti ti-camera" style={{ fontSize: 12, color: f.id === selected ? 'var(--pp)' : 'var(--tm)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: f.id === selected ? 'var(--tw)' : 'var(--tm)', fontWeight: 600, fontFamily: 'monospace' }}>{f.dtcCode}</div>
                  <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: 'monospace' }}>{fmtDate(f.capturedAt)} · {f.vehicleName}</div>
                </div>
              </div>
            ))}
          </div>

          {frame && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '6px 0 2px' }}>
                PID values at fault — {frame.dtcCode}
              </div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--br)' }}>
                {/* Battery voltage hero row */}
                {frame.liveData['ATRV'] && (
                  <div style={{ display: 'flex', padding: '8px 12px', borderBottom: '2px solid var(--br)', background: 'var(--bg4)' }}>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--tw)', fontWeight: 600 }}>Battery Voltage</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--gb)', fontWeight: 700 }}>{frame.liveData['ATRV'].value} V</span>
                    <span style={{ width: 20 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--pp)' }}>
                      {typeof liveData['ATRV']?.value === 'number' ? `${(liveData['ATRV'].value as number).toFixed(3)} V` : '—'}
                    </span>
                  </div>
                )}
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', padding: '4px 12px', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--tm)', background: 'var(--bg4)', borderBottom: '1px solid var(--br)' }}>
                  <span>Parameter</span>
                  <span style={{ textAlign: 'right', color: 'var(--gb)' }}>At Fault</span>
                  <span style={{ textAlign: 'right', color: 'var(--pp)' }}>Live Now</span>
                  <span style={{ textAlign: 'right' }}>Δ</span>
                </div>
                {COMPARE_PIDS.filter(p => p !== 'ATRV').map(pid => {
                  const fv = frame.liveData[pid]?.value;
                  const lv = liveData[pid]?.value;
                  const fn = typeof fv === 'number' ? fv : NaN;
                  const ln = typeof lv === 'number' ? lv : NaN;
                  const delta = !isNaN(fn) && !isNaN(ln) ? ln - fn : NaN;
                  return (
                    <div key={pid} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', padding: '5px 12px', borderBottom: '1px solid var(--bg4)', fontSize: 11 }}>
                      <span style={{ color: 'var(--tm)', fontFamily: 'sans-serif' }}>{PID_LABELS[pid] ?? pid}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--gb)' }}>{fv !== undefined ? String(fv) : '—'}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--pp)' }}>{lv !== undefined ? String(lv) : '—'}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'monospace', color: isNaN(delta) ? 'var(--tm)' : Math.abs(delta) < 0.05 ? 'var(--tm)' : delta > 0 ? 'var(--sg)' : 'var(--sa)' }}>
                        {isNaN(delta) ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => exportCSV(frame)} style={{ padding: '4px 10px', background: 'var(--bg4)', border: '1px solid var(--br)', color: 'var(--tm)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-file-spreadsheet" style={{ fontSize: 12 }} />Export CSV
                </button>
                <button onClick={() => deleteFrame(frame.id)} style={{ padding: '4px 10px', background: 'var(--bg4)', border: '1px solid var(--br)', color: 'var(--tm)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-trash" style={{ fontSize: 12 }} />Delete
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
