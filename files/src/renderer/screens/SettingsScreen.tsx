import React, { useState, useEffect, useCallback } from 'react';
import { StorageConfig, StorageInfo } from '../../shared/types';

function fmtBytes(b: number): string {
  if (b < 1024)         return `${b} B`;
  if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function SettingsScreen(): React.ReactElement {
  const [config,    setConfigState] = useState<StorageConfig | null>(null);
  const [info,      setInfo]        = useState<StorageInfo | null>(null);
  const [migrating, setMigrating]   = useState(false);
  const [pending,   setPending]     = useState<'local' | 'sqlite' | null>(null);

  const reload = useCallback(async () => {
    const [cfg, inf] = await Promise.all([
      window.electronAPI.storage.getConfig(),
      window.electronAPI.storage.getInfo(),
    ]);
    setConfigState(cfg as StorageConfig);
    setInfo(inf as StorageInfo);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleToggle = (to: 'local' | 'sqlite') => {
    if (to === config?.backend) return;
    setPending(to);
  };

  const confirmMigrate = async () => {
    if (!pending) return;
    setPending(null);
    setMigrating(true);
    try {
      await window.electronAPI.storage.migrate(pending);
      await reload();
    } finally {
      setMigrating(false);
    }
  };

  const infoRow = (label: string, value: string) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bg4)', fontSize: 11 }}>
      <span style={{ color: 'var(--tm)' }}>{label}</span>
      <span style={{ color: 'var(--tw)', fontFamily: "'JetBrains Mono','Roboto Mono',monospace" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '2px 0 6px' }}>
        Storage backend
      </div>

      {/* Confirmation overlay */}
      {pending && (
        <div style={{ padding: 12, border: '2px solid var(--sa)', background: 'rgba(210,153,34,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--tw)' }}>
            Migrate existing data to <strong>{pending === 'sqlite' ? 'SQLite' : 'Local JSON'}</strong>?
            Your current data will be copied. The old file is kept as a backup.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={confirmMigrate} style={{ padding: '5px 12px', background: 'var(--pp)', border: 'none', color: 'var(--bg)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Migrate
            </button>
            <button onClick={() => setPending(null)} style={{ padding: '5px 12px', background: 'var(--bg4)', border: '2px solid var(--br)', color: 'var(--tm)', fontSize: 11, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--bg3)', border: '2px solid var(--br)', padding: 10 }}>
        {migrating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 11, color: 'var(--sa)' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 14 }} />
            Migrating data…
          </div>
        )}

        {/* Backend selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {(['local', 'sqlite'] as const).map(b => (
            <button
              key={b}
              disabled={migrating}
              onClick={() => handleToggle(b)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 11, fontFamily: "'JetBrains Mono','Roboto Mono',monospace",
                fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
                background: config?.backend === b ? 'rgba(33,136,255,0.12)' : 'var(--bg4)',
                border: `2px solid ${config?.backend === b ? 'var(--pp)' : 'var(--br)'}`,
                color: config?.backend === b ? 'var(--pp)' : 'var(--tm)',
                cursor: migrating ? 'not-allowed' : 'pointer',
              }}
            >
              <i className={`ti ${b === 'local' ? 'ti-file-text' : 'ti-database'}`} style={{ marginRight: 6 }} />
              {b === 'local' ? 'Local JSON' : 'SQLite'}
            </button>
          ))}
        </div>

        {/* Storage info */}
        {info && config && (
          <div>
            {config.backend === 'local' && (
              <>
                {infoRow('File', info.localPath.split('/').slice(-3).join('/') || info.localPath)}
                {infoRow('Size', fmtBytes(info.localSizeBytes))}
              </>
            )}
            {config.backend === 'sqlite' && (
              <>
                {infoRow('Database', info.sqlitePath.split('/').slice(-3).join('/') || info.sqlitePath)}
                {infoRow('Size', fmtBytes(info.sqliteSizeBytes))}
                {infoRow('Snapshots', String(info.counts.snapshots))}
                {infoRow('Recordings', String(info.counts.recordings))}
                {infoRow('Freeze frames', String(info.counts.freezeFrames))}
              </>
            )}
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => window.electronAPI.storage.openDataFolder()}
                style={{ padding: '6px 12px', background: 'var(--bg4)', border: '2px solid var(--br)', color: 'var(--tm)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className="ti ti-folder-open" style={{ fontSize: 12 }} />
                Open data folder
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.0, textTransform: 'uppercase', color: 'var(--tm)', padding: '10px 0 6px' }}>
        About
      </div>
      <div style={{ background: 'var(--bg3)', border: '2px solid var(--br)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {infoRow('App', 'Silverado DX v1.0.0')}
        {typeof process !== 'undefined' && process.versions?.electron && infoRow('Electron', process.versions.electron)}
        {typeof process !== 'undefined' && process.versions?.node && infoRow('Node', process.versions.node)}
        <div style={{ marginTop: 8 }}>
          <button
            disabled
            style={{ padding: '6px 12px', background: 'var(--bg4)', border: '2px solid var(--br)', color: 'var(--tm)', fontSize: 11, cursor: 'not-allowed', opacity: 0.5 }}
          >
            Check for updates
          </button>
        </div>
      </div>
    </div>
  );
}
