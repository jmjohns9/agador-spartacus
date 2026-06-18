import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { DataRecording } from '../../shared/types';

const KEY_PIDS = ['ATRV','010C','0104','0105','0110','010B','0111','0106','0107','0108','0109','012F'];
const INTERVALS = [100, 500, 1000, 5000];
const MAX_RECORDINGS = 10;

function fmtDuration(ms: number): string {
  const s  = Math.floor(ms / 1000);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
}

function fmtBytes(b: number): string {
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DataLoggerScreen(): React.ReactElement {
  const liveData    = useAppStore(s => s.liveData);
  const liveVoltage = useAppStore(s => s.liveData['ATRV']?.value);

  const [isRecording,  setIsRecording]  = useState(false);
  const [selectedPIDs, setSelectedPIDs] = useState<string[]>(KEY_PIDS);
  const [sampleInterval, setSampleInterval] = useState(500);
  const [sampleCount,  setSampleCount]  = useState(0);
  const [elapsedMs,    setElapsedMs]    = useState(0);
  const [markerText,   setMarkerText]   = useState('');
  const [recordings,   setRecordings]   = useState<DataRecording[]>([]);
  const [warnDropped,  setWarnDropped]  = useState(false);

  type RecordingBuf = { startedAt: number; samples: DataRecording['samples']; markers: DataRecording['markers'] };
  const recRef     = useRef<RecordingBuf | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRecordings = useCallback(async () => {
    const recs = await window.electronAPI.storage.getRecordings() as DataRecording[];
    setRecordings(recs);
  }, []);

  useEffect(() => { loadRecordings(); }, []);

  const startRecording = () => {
    recRef.current = { startedAt: Date.now(), samples: [], markers: [] };
    setSampleCount(0);
    setElapsedMs(0);
    setIsRecording(true);

    timerRef.current = setInterval(() => {
      if (!recRef.current) return;
      const values: Record<string, number | string> = {};
      for (const pid of selectedPIDs) {
        const r = liveData[pid];
        if (r !== undefined) values[pid] = r.value;
      }
      recRef.current.samples.push({ timestamp: Date.now(), values });
      setSampleCount(c => c + 1);
    }, sampleInterval);

    elapsedRef.current = setInterval(() => {
      if (recRef.current) setElapsedMs(Date.now() - recRef.current.startedAt);
    }, 1000);
  };

  const stopRecording = async () => {
    if (timerRef.current)   clearInterval(timerRef.current);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    setIsRecording(false);

    if (!recRef.current || recRef.current.samples.length === 0) { recRef.current = null; return; }

    const endedAt = Date.now();
    const { startedAt, samples, markers } = recRef.current;
    recRef.current = null;

    const rec: DataRecording = {
      id:              `rec_${startedAt}`,
      name:            `Recording ${fmtDate(startedAt)}`,
      startedAt, endedAt,
      durationMs:      endedAt - startedAt,
      sampleIntervalMs: sampleInterval,
      pids:            selectedPIDs,
      sampleCount:     samples.length,
      markers, samples,
    };

    const existing = await window.electronAPI.storage.getRecordings() as DataRecording[];
    if (existing.length >= MAX_RECORDINGS) {
      const oldest = existing[existing.length - 1];
      await window.electronAPI.storage.deleteRecording(oldest.id);
      setWarnDropped(true);
    }
    await window.electronAPI.storage.saveRecording(rec);
    loadRecordings();
  };

  const addMarker = () => {
    if (!recRef.current || !markerText.trim()) return;
    recRef.current.markers.push({ timestamp: Date.now(), label: markerText.trim() });
    setMarkerText('');
  };

  const exportCSV = (rec: DataRecording) => {
    const header = ['timestamp_ms', ...rec.pids].join(',');
    const rows   = rec.samples.map(s => [s.timestamp, ...rec.pids.map(p => s.values[p] ?? '')].join(','));
    window.electronAPI.exportCSV([header, ...rows].join('\n'), `${rec.name}.csv`);
  };

  const exportJSON = (rec: DataRecording) => {
    const obj = { meta: { id: rec.id, name: rec.name, startedAt: rec.startedAt, endedAt: rec.endedAt, durationMs: rec.durationMs, sampleIntervalMs: rec.sampleIntervalMs }, pids: rec.pids, markers: rec.markers, samples: rec.samples };
    window.electronAPI.exportCSV(JSON.stringify(obj, null, 2), `${rec.name}.json`);
  };

  const deleteRecording = async (id: string) => {
    await window.electronAPI.storage.deleteRecording(id);
    loadRecordings();
  };

  const togglePID = (pid: string) => {
    setSelectedPIDs(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]);
  };

  const recBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 18px', fontSize: 12, fontFamily: "'JetBrains Mono','Roboto Mono',monospace", fontWeight: 700,
    background: isRecording ? 'rgba(248,81,73,0.12)' : 'var(--bg4)',
    border: `2px solid ${isRecording ? 'var(--sr)' : 'var(--br)'}`,
    color: isRecording ? 'var(--sr)' : 'var(--tw)', cursor: 'pointer',
  };

  const intervalBtnStyle = (ms: number): React.CSSProperties => ({
    padding: '5px 10px', fontSize: 10, fontFamily: "'JetBrains Mono','Roboto Mono',monospace",
    background: sampleInterval === ms ? 'rgba(33,136,255,0.12)' : 'var(--bg4)',
    border: `2px solid ${sampleInterval === ms ? 'var(--pp)' : 'var(--br)'}`,
    color: sampleInterval === ms ? 'var(--pp)' : 'var(--tm)',
    cursor: isRecording ? 'not-allowed' : 'pointer',
  });

  const pidBtnStyle = (pid: string): React.CSSProperties => ({
    padding: '5px 10px', fontSize: 10, fontFamily: "'JetBrains Mono','Roboto Mono',monospace",
    background: selectedPIDs.includes(pid) ? 'rgba(33,136,255,0.12)' : 'var(--bg4)',
    border: `2px solid ${selectedPIDs.includes(pid) ? 'var(--pp)' : 'var(--br)'}`,
    color: selectedPIDs.includes(pid) ? 'var(--pp)' : 'var(--tm)',
    cursor: isRecording ? 'not-allowed' : 'pointer',
  });

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {warnDropped && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--sa)', background: 'rgba(210,153,34,0.08)', border: '2px solid var(--sa)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Cap ({MAX_RECORDINGS}) reached — oldest recording deleted.</span>
          <button onClick={() => setWarnDropped(false)} style={{ background: 'none', border: 'none', color: 'var(--tm)', cursor: 'pointer' }}>
            <i className="ti ti-x" style={{ fontSize: 12 }} />
          </button>
        </div>
      )}

      {/* Controls */}
      <div style={{ background: 'var(--bg3)', border: '2px solid var(--br)', padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Interval */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--tm)', minWidth: 100 }}>Sample interval</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {INTERVALS.map(ms => (
              <button key={ms} disabled={isRecording} onClick={() => setSampleInterval(ms)} style={intervalBtnStyle(ms)}>
                {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
              </button>
            ))}
          </div>
        </div>

        {/* Record button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={isRecording ? stopRecording : startRecording} style={recBtnStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: isRecording ? 'var(--sr)' : 'var(--tm)', display: 'inline-block' }} />
            {isRecording ? 'Stop' : 'Record'}
          </button>
          {isRecording && (
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--sr)' }}>
              ● REC &nbsp; {fmtDuration(elapsedMs)} &nbsp; {sampleCount.toLocaleString()} samples
              {typeof liveVoltage === 'number' ? `   ${liveVoltage.toFixed(2)} V` : ''}
            </div>
          )}
        </div>

        {/* Marker */}
        {isRecording && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={markerText}
              onChange={e => setMarkerText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMarker(); }}
              placeholder="Add marker (Enter to insert)…"
              style={{ flex: 1, background: 'var(--bg4)', border: '1px solid var(--br)', color: 'var(--tw)', padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
            />
            <button onClick={addMarker} disabled={!markerText.trim()} style={{ padding: '4px 10px', background: 'var(--bg4)', border: '1px solid var(--br)', color: 'var(--tm)', fontSize: 11, cursor: markerText.trim() ? 'pointer' : 'not-allowed' }}>
              Insert
            </button>
          </div>
        )}
      </div>

      {/* PID selector */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '6px 0 2px' }}>PIDs to record</div>
      <div style={{ background: 'var(--bg3)', border: '2px solid var(--br)', padding: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {KEY_PIDS.map(pid => (
          <button key={pid} disabled={isRecording} onClick={() => togglePID(pid)} style={pidBtnStyle(pid)}>{pid}</button>
        ))}
      </div>

      {/* Recordings list */}
      {recordings.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '6px 0 2px' }}>
            Saved recordings — {recordings.length} / {MAX_RECORDINGS}
          </div>
          {recordings.map(rec => (
            <div key={rec.id} style={{ background: 'var(--bg3)', border: '2px solid var(--br)', padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <i className="ti ti-activity" style={{ fontSize: 14, color: 'var(--gb)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--tw)', fontWeight: 600, marginBottom: 3 }}>{rec.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'JetBrains Mono','Roboto Mono',monospace", lineHeight: 1.6 }}>
                    {fmtDuration(rec.durationMs)} · {rec.sampleCount.toLocaleString()} samples · {rec.pids.length} PIDs
                    {rec.markers.length > 0 ? ` · ${rec.markers.length} markers` : ''} · {fmtBytes(JSON.stringify(rec).length)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => exportCSV(rec)} title="Export CSV" style={{ padding: '5px 10px', background: 'var(--bg4)', border: '2px solid var(--br)', color: 'var(--tm)', fontSize: 10, cursor: 'pointer' }}>
                    <i className="ti ti-file-spreadsheet" style={{ marginRight: 4 }} />CSV
                  </button>
                  <button onClick={() => exportJSON(rec)} title="Export JSON" style={{ padding: '5px 10px', background: 'var(--bg4)', border: '2px solid var(--br)', color: 'var(--tm)', fontSize: 10, cursor: 'pointer' }}>
                    <i className="ti ti-file-code" style={{ marginRight: 4 }} />JSON
                  </button>
                  <button onClick={() => deleteRecording(rec.id)} title="Delete recording" aria-label="Delete recording" style={{ padding: '5px 8px', background: 'none', border: '2px solid transparent', color: 'var(--sr)', cursor: 'pointer', opacity: 0.7 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--sr)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}>
                    <i className="ti ti-trash" style={{ fontSize: 12 }} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
