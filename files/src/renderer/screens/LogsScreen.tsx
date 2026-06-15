import React, { useState } from 'react';
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
  const [markerText,  setMarkerText]  = useState('');

  const filtered = filterLevel === 'ALL' ? log : log.filter(e => e.level === filterLevel);

  const handleAddMarker = () => {
    if (!markerText.trim()) return;
    addMarker(markerText.trim());
    setMarkerText('');
  };

  const vehicle = useAppStore(s => s.vehicle);

  const handleExport = async () => {
    const slug = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join('-')
      .replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'session';
    const filename = `agador-${slug}-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    // Preferred: native macOS save dialog via the main process (works in Electron)
    if (window.electronAPI?.exportLog) {
      try {
        await window.electronAPI.exportLog(filename);
        return;
      } catch {
        // fall through to blob fallback
      }
    }
    // Fallback for non-Electron preview contexts
    const text = exportLog();
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        background: 'var(--bg2)', borderBottom: '1px solid var(--br)', flexShrink: 0,
      }}>
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value as LogLevel | 'ALL')}
          style={{
            padding: '4px 6px', fontSize: 11, height: 28,
            background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 3,
            color: 'var(--tw)', fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: 0.4, textTransform: 'uppercase',
          }}
        >
          <option value="ALL">All levels</option>
          <option value="ok">OK</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
          <option value="otel">OBD telemetry</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Add marker */}
        <input
          type="text"
          placeholder="Add session marker…"
          value={markerText}
          onChange={e => setMarkerText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddMarker(); }}
          style={{
            padding: '4px 8px', fontSize: 11, width: 200, height: 28,
            background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 3,
            color: 'var(--tw)', fontFamily: "'JetBrains Mono', monospace",
          }}
        />
        <Button size="sm" icon="ti-flag" onClick={handleAddMarker} disabled={!markerText.trim()}>
          Mark
        </Button>
        <Button size="sm" icon="ti-download" onClick={handleExport} disabled={log.length === 0}>
          Export
        </Button>

        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--tm)' }}>
          {filtered.length} entries
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '130px 52px 1fr',
        gap: 10, padding: '5px 12px',
        background: 'var(--bg3)', borderBottom: '1px solid var(--br)',
        flexShrink: 0,
      }}>
        {['Timestamp', 'Level', 'Message'].map(h => (
          <span key={h} style={{
            fontSize: 9, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: 1.2, textTransform: 'uppercase',
          }}>
            {h}
          </span>
        ))}
      </div>

      {/* Log entries */}
      <div style={{
        flex: 1, overflowY: 'auto',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent',
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 12, color: 'var(--tm)' }}>
            {log.length === 0 ? 'No log entries — connect the adapter to start recording.' : 'No entries match the selected level filter.'}
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '130px 52px 1fr',
              gap: 10, padding: '4px 12px', alignItems: 'flex-start',
              borderBottom: '1px solid var(--bg3)',
              background: entry.level === 'error' ? 'rgba(255,36,64,0.03)' : entry.level === 'warn' ? 'rgba(255,179,0,0.02)' : 'transparent',
            }}>
              <span style={{ color: 'var(--tm)', fontSize: 10, paddingTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>
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
