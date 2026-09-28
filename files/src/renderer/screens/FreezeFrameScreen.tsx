import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { FreezeFrame } from '../../shared/types';
import {
  ScrollPane, SectionHeader, Card, Button, Divider, EmptyState,
} from '../components/layout/UIComponents';
import { TYPE, WEIGHT, NUMERIC } from '../theme/theme';

const COMPARE_PIDS = ['ATRV','010C','0104','0105','0110','010B','0111','0106','0107','0108','0109','012F'];
const PID_LABELS: Record<string, string> = {
  ATRV: 'Battery Voltage', '010C': 'Engine RPM', '0104': 'Engine Load',
  '0105': 'Coolant Temp',  '0110': 'MAF',         '010B': 'MAP',
  '0111': 'Throttle Pos',  '0106': 'STFT Bank 1', '0107': 'LTFT Bank 1',
  '0108': 'STFT Bank 2',   '0109': 'LTFT Bank 2', '012F': 'Fuel Level',
};

const COLS = '1.3fr 90px 90px 70px';

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
    <ScrollPane>
      {frames.length === 0 ? (
        <Card>
          <EmptyState
            icon="ti-camera"
            title="No freeze frames"
            message="Frames are captured automatically when a new fault code appears."
          />
        </Card>
      ) : (
        <>
          {/* Frame list */}
          <SectionHeader>{`Freeze frames — ${frames.length}`}</SectionHeader>
          <Card padding={0}>
            {frames.map((f, i) => (
              <React.Fragment key={f.id}>
                <div
                  className="row-hover"
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(f.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelected(f.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer',
                    background: f.id === selected ? 'var(--accent-tint)' : 'transparent',
                    boxShadow: f.id === selected ? 'inset 2px 0 0 var(--accent)' : 'none',
                  }}
                >
                  <i className="ti ti-camera" style={{ fontSize: 14, color: f.id === selected ? 'var(--accent-text)' : 'var(--label-3)', flexShrink: 0 }} aria-hidden />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TYPE.body, ...NUMERIC, fontWeight: WEIGHT.semibold, color: 'var(--label)' }}>{f.dtcCode}</div>
                    <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>{fmtDate(f.capturedAt)} · {f.vehicleName}</div>
                  </div>
                </div>
                {i < frames.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </Card>

          {frame && (
            <>
              <SectionHeader>{`PID values at fault — ${frame.dtcCode}`}</SectionHeader>
              <Card padding={0}>
                {/* Battery voltage hero row */}
                {frame.liveData['ATRV'] && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, padding: '8px 12px', alignItems: 'center', background: 'var(--fill)' }}>
                      <span style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, color: 'var(--label)' }}>Battery voltage</span>
                      <span style={{ ...TYPE.body, ...NUMERIC, fontWeight: WEIGHT.semibold, color: 'var(--teal)', textAlign: 'right' }}>{frame.liveData['ATRV'].value} V</span>
                      <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--accent-text)', textAlign: 'right' }}>
                        {typeof liveData['ATRV']?.value === 'number' ? `${(liveData['ATRV'].value as number).toFixed(3)} V` : '—'}
                      </span>
                      <span />
                    </div>
                    <Divider />
                  </>
                )}
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, padding: '4px 12px', background: 'var(--fill)' }}>
                  <span style={{ ...TYPE.caption, color: 'var(--label-3)' }}>Parameter</span>
                  <span style={{ ...TYPE.caption, color: 'var(--teal)', textAlign: 'right' }}>At fault</span>
                  <span style={{ ...TYPE.caption, color: 'var(--accent-text)', textAlign: 'right' }}>Live now</span>
                  <span style={{ ...TYPE.caption, color: 'var(--label-3)', textAlign: 'right' }}>Δ</span>
                </div>
                <Divider />
                {COMPARE_PIDS.filter(p => p !== 'ATRV').map((pid, i, arr) => {
                  const fv = frame.liveData[pid]?.value;
                  const lv = liveData[pid]?.value;
                  const fn = typeof fv === 'number' ? fv : NaN;
                  const ln = typeof lv === 'number' ? lv : NaN;
                  const delta = !isNaN(fn) && !isNaN(ln) ? ln - fn : NaN;
                  return (
                    <React.Fragment key={pid}>
                      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8, padding: '4px 12px', alignItems: 'center' }}>
                        <span style={{ ...TYPE.body, color: 'var(--label-2)' }}>{PID_LABELS[pid] ?? pid}</span>
                        <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--teal)', textAlign: 'right' }}>{fv !== undefined ? String(fv) : '—'}</span>
                        <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--accent-text)', textAlign: 'right' }}>{lv !== undefined ? String(lv) : '—'}</span>
                        <span style={{
                          ...TYPE.body, ...NUMERIC, textAlign: 'right',
                          color: isNaN(delta) || Math.abs(delta) < 0.05 ? 'var(--label-2)' : delta > 0 ? 'var(--ok-text)' : 'var(--warn-text)',
                        }}>
                          {isNaN(delta) ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}
                        </span>
                      </div>
                      {i < arr.length - 1 && <Divider />}
                    </React.Fragment>
                  );
                })}
              </Card>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" icon="ti-file-spreadsheet" onClick={() => exportCSV(frame)}>Export CSV</Button>
                <Button variant="destructive" icon="ti-trash" aria-label="Delete freeze frame" onClick={() => deleteFrame(frame.id)}>Delete</Button>
              </div>
            </>
          )}
        </>
      )}
    </ScrollPane>
  );
}
