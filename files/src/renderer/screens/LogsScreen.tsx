import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { LogLevel } from '../../shared/types';
import { Badge, Button, ScrollPane, SectionHeader, Card } from '../components/layout/UIComponents';

// ─── Level metadata ───────────────────────────────────────────────────────────

const LEVEL_VARIANT: Record<LogLevel, 'ok' | 'info' | 'warn' | 'crit' | 'muted'> = {
  ok:   'ok',
  info: 'info',
  warn: 'warn',
  error:'crit',
  otel: 'muted',
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  ok:    'var(--sg)',
  info:  'var(--gb)',
  warn:  'var(--sa)',
  error: 'var(--sr)',
  otel:  'var(--tm)',
};

// ─── LogsScreen ───────────────────────────────────────────────────────────────

export function LogsScreen(): React.ReactElement {
  const log       = useAppStore(s => s.log);
  const addMarker = useAppStore(s => s.addMarker);
  const exportLog = useAppStore(s => s.exportLog);

  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [searchText,  setSearchText]  = useState('');
  const [markerText,  setMarkerText]  = useState('');
  const [autoScroll,  setAutoScroll]  = useState(true);
  const [showStats,   setShowStats]   = useState(false);
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

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

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
    if (window.electronAPI?.exportLog) {
      try { await window.electronAPI.exportLog(filename); return; } catch { /* fallback */ }
    }
    const text = exportLog();
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
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
        background: 'var(--bg2)', borderBottom: '2px solid var(--br)', flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value as LogLevel | 'ALL')}
          style={{
            padding: '4px 6px', fontSize: 11, height: 28,
            background: 'var(--bg3)', border: '2px solid var(--br)', borderRadius: 0,
            color: 'var(--tw)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
            letterSpacing: 0.4, textTransform: 'uppercase',
          }}
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
          style={{
            padding: '4px 8px', fontSize: 11, width: 160, height: 28,
            background: 'var(--bg3)', border: '2px solid var(--br)', borderRadius: 0,
            color: 'var(--tw)', fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
          }}
        />

        <div style={{ flex: 1 }} />

        <input
          type="text"
          placeholder="Add marker…"
          value={markerText}
          onChange={e => setMarkerText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddMarker(); }}
          style={{
            padding: '4px 8px', fontSize: 11, width: 150, height: 28,
            background: 'var(--bg3)', border: '2px solid var(--br)', borderRadius: 0,
            color: 'var(--tw)', fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
          }}
        />
        <Button size="sm" icon="ti-flag" onClick={handleAddMarker} disabled={!markerText.trim()}>
          Mark
        </Button>

        <div style={{ width: 1, height: 20, background: 'var(--br)' }} />

        <Button size="sm" icon="ti-download" onClick={handleExportTxt} disabled={log.length === 0}>
          TXT
        </Button>
        <Button size="sm" icon="ti-file-spreadsheet" onClick={handleExportCSV} disabled={filtered.length === 0}>
          CSV
        </Button>

        <div style={{ width: 1, height: 20, background: 'var(--br)' }} />

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          title={autoScroll ? 'Auto-scroll ON — click to pause' : 'Auto-scroll OFF — click to resume'}
          style={{
            padding: '3px 8px', fontSize: 10, height: 28,
            background: autoScroll ? 'rgba(255,87,34,0.08)' : 'var(--bg3)',
            border: `1px solid ${autoScroll ? 'var(--pp)' : 'var(--br)'}`,
            borderRadius: 0, color: autoScroll ? 'var(--pp)' : 'var(--tm)',
            cursor: 'pointer', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
            fontWeight: 600, letterSpacing: 0.5,
          }}
        >
          <i className={`ti ${autoScroll ? 'ti-arrow-bar-to-down' : 'ti-player-pause'}`} style={{ fontSize: 12, marginRight: 4 }} />
          {autoScroll ? 'TAIL' : 'PAUSED'}
        </button>

        <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 10, color: 'var(--tm)' }}>
          {filtered.length}{filtered.length !== log.length ? `/${log.length}` : ''} entries
        </span>
      </div>

      {/* Level summary strip */}
      {counts.error > 0 && (
        <div style={{
          display: 'flex', gap: 12, padding: '4px 12px',
          background: 'rgba(255,59,80,0.04)', borderBottom: '2px solid var(--br)',
          fontSize: 10, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", flexShrink: 0,
        }}>
          {counts.error > 0 && <span style={{ color: 'var(--sr)' }}>{counts.error} errors</span>}
          {counts.warn > 0 && <span style={{ color: 'var(--sa)' }}>{counts.warn} warnings</span>}
          <span style={{ color: 'var(--tm)' }}>Session: {log.length > 0 ? `${((log[log.length - 1].timestamp - log[0].timestamp) / 60000).toFixed(1)} min` : '—'}</span>
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '130px 52px 1fr',
        gap: 10, padding: '5px 12px',
        background: 'var(--bg3)', borderBottom: '2px solid var(--br)',
        flexShrink: 0,
      }}>
        {['Timestamp', 'Level', 'Message'].map(h => (
          <span key={h} style={{
            fontSize: 9, color: 'var(--tm)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
            letterSpacing: 1.2, textTransform: 'uppercase',
          }}>
            {h}
          </span>
        ))}
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto',
          fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 12, color: 'var(--tm)' }}>
            {log.length === 0 ? 'No log entries — connect the adapter to start recording.' : 'No entries match the current filter.'}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '130px 52px 1fr',
              gap: 10, padding: '4px 12px', alignItems: 'flex-start',
              borderBottom: '1px solid var(--bg3)',
              background: entry.level === 'error' ? 'rgba(255,36,64,0.03)' : entry.level === 'warn' ? 'rgba(255,179,0,0.02)' : 'transparent',
            }}>
              <span style={{ color: 'var(--tm)', fontSize: 10, paddingTop: 1, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace" }}>
                {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                <span style={{ color: 'var(--bs)', fontSize: 10 }}>
                  .{String(entry.timestamp % 1000).padStart(3, '0')}
                </span>
              </span>
              <Badge label={entry.level.toUpperCase()} variant={LEVEL_VARIANT[entry.level]} />
              <span style={{ color: 'var(--tw)', lineHeight: 1.5, wordBreak: 'break-word', fontSize: 11 }}>
                {entry.message}
                {entry.pid   && <span style={{ color: 'var(--tm)' }}> [{entry.pid}]</span>}
                {entry.value !== undefined && <span style={{ color: 'var(--pp)' }}> = {String(entry.value)}</span>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
