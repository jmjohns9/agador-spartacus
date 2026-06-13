import React, { useState } from 'react';
import { useAppStore } from './appStore';
import { LogLevel } from '../shared/types';
import { Badge } from './UIComponents';

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

  const handleExport = () => {
    const csv = exportLog();
    const blob = new Blob([csv], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `silverado-dx-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg3)', borderBottom: '1px solid var(--br)', flexShrink: 0 }}>
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value as LogLevel | 'ALL')}
          style={{ padding: '4px 6px', fontSize: 12, height: 28 }}
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
          style={{ padding: '4px 8px', fontSize: 12, width: 200, height: 28 }}
        />
        <button
          onClick={handleAddMarker}
          disabled={!markerText.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg4)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 10px', height: 28, cursor: markerText.trim() ? 'pointer' : 'not-allowed', color: markerText.trim() ? 'var(--tw)' : 'var(--tm)', fontSize: 12 }}
        >
          <i className="ti ti-flag" style={{ fontSize: 13 }} />
          Mark
        </button>

        <button
          onClick={handleExport}
          disabled={log.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg4)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 10px', height: 28, cursor: log.length > 0 ? 'pointer' : 'not-allowed', color: log.length > 0 ? 'var(--tw)' : 'var(--tm)', fontSize: 12 }}
        >
          <i className="ti ti-download" style={{ fontSize: 13 }} />
          Export
        </button>

        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tm)' }}>
          {filtered.length} entries
        </span>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
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
              <span style={{ color: 'var(--tm)', fontSize: 10, paddingTop: 1 }}>
                {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                <span style={{ color: 'var(--bs)', fontSize: 9 }}>
                  .{String(entry.timestamp % 1000).padStart(3, '0')}
                </span>
              </span>
              <span style={{ color: LEVEL_COLOR[entry.level], fontWeight: 500, fontSize: 10 }}>
                {entry.level.toUpperCase().padEnd(5)}
              </span>
              <span style={{ color: 'var(--tw)', lineHeight: 1.5, wordBreak: 'break-word' }}>
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
