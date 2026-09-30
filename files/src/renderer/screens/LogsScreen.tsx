import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { LogLevel } from '../../shared/types';
import { Badge, Button } from '../components/layout/UIComponents';
import { TYPE, NUMERIC } from '../theme/theme';

// ─── Level metadata ───────────────────────────────────────────────────────────

const LEVEL_VARIANT: Record<LogLevel, 'ok' | 'info' | 'warn' | 'crit' | 'muted'> = {
  ok:   'ok',
  info: 'info',
  warn: 'warn',
  error:'crit',
  otel: 'muted',
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  ok:    'OK',
  info:  'Info',
  warn:  'Warn',
  error: 'Error',
  otel:  'OBD',
};

// ─── LogsScreen ───────────────────────────────────────────────────────────────

export function LogsScreen(): React.ReactElement {
  const log       = useAppStore(s => s.log);
  const addMarker = useAppStore(s => s.addMarker);

  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [searchText,  setSearchText]  = useState('');
  const [markerText,  setMarkerText]  = useState('');
  const [autoScroll,  setAutoScroll]  = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Level counts
  const counts = useMemo(() => {
    const c = { ok: 0, info: 0, warn: 0, error: 0, otel: 0, total: log.length };
    for (const e of log) c[e.level]++;
    return c;
  }, [log]);

  // Filter by level + search
  const filtered = useMemo(() => {
    let entries = filterLevel === 'ALL' ? log : log.filter(e => e.level === filterLevel);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      entries = entries.filter(e =>
        e.message.toLowerCase().includes(q) ||
        (e.pid && e.pid.toLowerCase().includes(q))
      );
    }
    return entries;
  }, [log, filterLevel, searchText]);

  // The log is newest-first, so tailing keeps the view at the top. Keyed on
  // the newest entry, not the length, which stops changing at the 1000 cap.
  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filtered[0]?.timestamp, autoScroll]);

  const handleAddMarker = () => {
    if (!markerText.trim()) return;
    addMarker(markerText.trim());
    setMarkerText('');
  };

  const vehicle = useAppStore(s => s.vehicle);

  const handleExportTxt = async () => {
    const slug = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join('-')
      .replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'session';
    const filename = `agador-${slug}-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    // What is on screen (filters applied, markers included), oldest first
    const text = [...filtered].reverse().map(e =>
      `${new Date(e.timestamp).toISOString()}\t${e.level.toUpperCase().padEnd(5)}\t${e.message}`).join('\n');
    if (window.electronAPI?.exportLog) {
      try { await window.electronAPI.exportLog(filename, text); return; } catch { /* fallback */ }
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = async () => {
    const slug = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join('-')
      .replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'session';
    const filename = `agador-${slug}-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    const rows = ['Timestamp,Level,PID,Value,Message'];
    for (const e of filtered) {
      const ts = new Date(e.timestamp).toISOString();
      const msg = `"${(e.message ?? '').replace(/"/g, '""')}"`;
      rows.push(`${ts},${e.level},${e.pid ?? ''},${e.value ?? ''},${msg}`);
    }
    const csv = rows.join('\n');
    if (window.electronAPI?.exportCSV) {
      try { await window.electronAPI.exportCSV(csv, filename); return; } catch { /* fallback */ }
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: 'var(--grouped)', boxShadow: 'inset 0 -1px 0 var(--separator)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value as LogLevel | 'ALL')}
          style={{ ...TYPE.caption, height: 24 }}
        >
          <option value="ALL">All ({counts.total})</option>
          <option value="ok">OK ({counts.ok})</option>
          <option value="info">Info ({counts.info})</option>
          <option value="warn">Warn ({counts.warn})</option>
          <option value="error">Error ({counts.error})</option>
          <option value="otel">OBD ({counts.otel})</option>
        </select>

        <input
          type="text"
          placeholder="Search logs…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ ...TYPE.caption, width: 160, height: 24 }}
        />

        <div style={{ flex: 1 }} />

        <input
          type="text"
          placeholder="Add marker…"
          value={markerText}
          onChange={e => setMarkerText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddMarker(); }}
          style={{ ...TYPE.caption, width: 150, height: 24 }}
        />
        <Button size="sm" icon="ti-flag" onClick={handleAddMarker} disabled={!markerText.trim()}>
          Mark
        </Button>

        <div style={{ width: 1, height: 20, background: 'var(--separator)' }} />

        <Button size="sm" icon="ti-download" onClick={handleExportTxt} disabled={log.length === 0}>
          TXT
        </Button>
        <Button size="sm" icon="ti-file-spreadsheet" onClick={handleExportCSV} disabled={filtered.length === 0}>
          CSV
        </Button>

        <div style={{ width: 1, height: 20, background: 'var(--separator)' }} />

        <Button
          size="sm"
          variant={autoScroll ? 'primary' : 'secondary'}
          icon={autoScroll ? 'ti-arrow-bar-to-down' : 'ti-player-pause'}
          onClick={() => setAutoScroll(!autoScroll)}
          title={autoScroll ? 'Auto-scroll on — click to pause' : 'Auto-scroll off — click to resume'}
        >
          {autoScroll ? 'Tail' : 'Paused'}
        </Button>

        <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
          {filtered.length}{filtered.length !== log.length ? `/${log.length}` : ''} entries
        </span>
      </div>

      {/* Level summary strip */}
      {(counts.error > 0 || counts.warn > 0) && (
        <div style={{
          display: 'flex', gap: 12, padding: '4px 12px',
          background: counts.error > 0 ? 'var(--crit-tint)' : 'var(--warn-tint)', boxShadow: 'inset 0 -1px 0 var(--separator)',
          flexShrink: 0,
        }}>
          {counts.error > 0 && <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--crit-text)' }}>{counts.error} errors</span>}
          {counts.warn > 0 && <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--warn-text)' }}>{counts.warn} warnings</span>}
          <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
            Session: {log.length > 0 ? `${((log[0].timestamp - log[log.length - 1].timestamp) / 60000).toFixed(1)} min` : '—'}
          </span>
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '130px 60px 1fr',
        gap: 8, padding: '4px 12px',
        background: 'var(--fill)', boxShadow: 'inset 0 -1px 0 var(--separator)',
        flexShrink: 0,
      }}>
        {['Timestamp', 'Level', 'Message'].map(h => (
          <span key={h} style={{ ...TYPE.caption, color: 'var(--label-3)' }}>{h}</span>
        ))}
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', ...TYPE.body, color: 'var(--label-2)' }}>
            {log.length === 0 ? 'No log entries — connect the adapter to start recording.' : 'No entries match the current filter.'}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div
              key={i}
              className="selectable"
              style={{
                display: 'grid', gridTemplateColumns: '130px 60px 1fr',
                gap: 8, padding: '4px 12px', alignItems: 'flex-start',
                boxShadow: 'inset 0 -1px 0 var(--separator)',
                background: entry.level === 'error' ? 'var(--crit-tint)' : entry.level === 'warn' ? 'var(--warn-tint)' : 'transparent',
              }}
            >
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)', paddingTop: 1 }}>
                {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                <span style={{ color: 'var(--label-3)' }}>
                  .{String(entry.timestamp % 1000).padStart(3, '0')}
                </span>
              </span>
              <Badge label={LEVEL_LABEL[entry.level]} variant={LEVEL_VARIANT[entry.level]} />
              <span style={{ ...TYPE.body, color: 'var(--label)', wordBreak: 'break-word' }}>
                {entry.message}
                {entry.pid   && <span style={{ ...NUMERIC, color: 'var(--label-2)' }}> [{entry.pid}]</span>}
                {entry.value !== undefined && <span style={{ ...NUMERIC, color: 'var(--accent-text)' }}> = {String(entry.value)}</span>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
