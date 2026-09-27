import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { DataRecording } from '../../shared/types';
import {
  ScrollPane, SectionHeader, Card, Button, SegmentedControl, DataRow, EmptyState, AlertBanner,
} from '../components/layout/UIComponents';
import { TYPE, NUMERIC } from '../theme/theme';

const KEY_PIDS = ['ATRV','010C','0104','0105','0110','010B','0111','0106','0107','0108','0109','012F'];
const INTERVALS = [100, 500, 1000, 5000];
const INTERVAL_OPTIONS = INTERVALS.map(ms => ({ value: String(ms), label: ms < 1000 ? `${ms}ms` : `${ms / 1000}s` }));
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

  return (
    <ScrollPane>

      {warnDropped && (
        <AlertBanner
          message={`Cap (${MAX_RECORDINGS}) reached — oldest recording deleted.`}
          variant="warn"
          action="Dismiss"
          onAction={() => setWarnDropped(false)}
        />
      )}

      {/* ── Recording controls ─────────────────────────────────────────── */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...TYPE.caption, color: 'var(--label-2)', minWidth: 100 }}>Sample interval</span>
          <SegmentedControl
            ariaLabel="Sample interval"
            size="sm"
            options={INTERVAL_OPTIONS}
            value={String(sampleInterval)}
            onChange={v => setSampleInterval(Number(v))}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            variant={isRecording ? 'destructive' : 'primary'}
            icon={isRecording ? 'ti-player-stop' : 'ti-player-record'}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? 'Stop' : 'Record'}
          </Button>
          {isRecording && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...TYPE.caption, ...NUMERIC, color: 'var(--crit-text)' }}>
              <span aria-hidden className="pulse" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--crit)' }} />
              REC · {fmtDuration(elapsedMs)} · {sampleCount.toLocaleString()} samples
              {typeof liveVoltage === 'number' ? ` · ${liveVoltage.toFixed(2)} V` : ''}
            </div>
          )}
        </div>

        {isRecording && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={markerText}
              onChange={e => setMarkerText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMarker(); }}
              placeholder="Add marker (Enter to insert)…"
              style={{ flex: 1 }}
            />
            <Button size="sm" onClick={addMarker} disabled={!markerText.trim()}>Insert</Button>
          </div>
        )}
      </Card>

      {/* ── PID selector ──────────────────────────────────────────────── */}
      <SectionHeader>PIDs to record</SectionHeader>
      <Card style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {KEY_PIDS.map(pid => (
          <Button
            key={pid}
            size="sm"
            variant={selectedPIDs.includes(pid) ? 'primary' : 'secondary'}
            disabled={isRecording}
            onClick={() => togglePID(pid)}
          >
            <span style={NUMERIC}>{pid}</span>
          </Button>
        ))}
      </Card>

      {/* ── Recordings list ──────────────────────────────────────────── */}
      <SectionHeader>{`Saved recordings — ${recordings.length} / ${MAX_RECORDINGS}`}</SectionHeader>
      {recordings.length === 0 ? (
        <Card>
          <EmptyState icon="ti-activity" title="No recordings" message="Choose PIDs and press Record." />
        </Card>
      ) : (
        <Card padding={0}>
          {recordings.map(rec => (
            <DataRow
              key={rec.id}
              name={rec.name}
              subtext={
                `${fmtDuration(rec.durationMs)} · ${rec.sampleCount.toLocaleString()} samples · ${rec.pids.length} PIDs` +
                (rec.markers.length > 0 ? ` · ${rec.markers.length} markers` : '') +
                ` · ${fmtBytes(JSON.stringify(rec).length)}`
              }
              value=""
              badge={
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button size="sm" icon="ti-file-spreadsheet" title="Export CSV" onClick={() => exportCSV(rec)}>CSV</Button>
                  <Button size="sm" icon="ti-file-code" title="Export JSON" onClick={() => exportJSON(rec)}>JSON</Button>
                  <Button size="sm" variant="plain" icon="ti-trash" title="Delete recording" aria-label="Delete recording" onClick={() => deleteRecording(rec.id)} />
                </div>
              }
            />
          ))}
        </Card>
      )}

    </ScrollPane>
  );
}
