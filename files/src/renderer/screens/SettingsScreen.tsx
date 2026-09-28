import React, { useState, useEffect, useCallback } from 'react';
import { StorageConfig, StorageInfo } from '../../shared/types';
import type { Appearance } from '../../shared/types';
import {
  ScrollPane, Card, SectionHeader, SegmentedControl, AlertBanner, Button, DataRow,
} from '../components/layout/UIComponents';
import { TYPE } from '../theme/theme';

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

  const [appearance, setAppearanceState] = useState<Appearance>('system');
  useEffect(() => { window.electronAPI.getAppearance().then(setAppearanceState).catch(() => {}); }, []);
  const changeAppearance = async (a: Appearance) => {
    setAppearanceState(a);
    setAppearanceState(await window.electronAPI.setAppearance(a));
  };

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

  const infoRow = (label: string, value: string) => <DataRow key={label} name={label} value={value} />;

  return (
    <ScrollPane>
      <SectionHeader>Appearance</SectionHeader>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ ...TYPE.body, color: 'var(--label)' }}>Theme</span>
          <SegmentedControl<Appearance>
            ariaLabel="Theme"
            value={appearance}
            onChange={changeAppearance}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light',  label: 'Light' },
              { value: 'dark',   label: 'Dark' },
            ]}
          />
        </div>
      </Card>

      <SectionHeader>Storage backend</SectionHeader>

      {/* Confirmation overlay */}
      {pending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AlertBanner
            variant="warn"
            message={`Migrate existing data to ${pending === 'sqlite' ? 'SQLite' : 'Local JSON'}? Your current data will be copied — the old file is kept as a backup.`}
            action="Migrate"
            onAction={confirmMigrate}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="sm" variant="secondary" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {migrating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...TYPE.caption, color: 'var(--warn-text)' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }} aria-hidden />
            Migrating data…
          </div>
        )}

        {/* Backend selector */}
        <div style={{ pointerEvents: migrating ? 'none' : undefined, opacity: migrating ? 0.5 : 1 }}>
          <SegmentedControl<'local' | 'sqlite'>
            ariaLabel="Storage backend"
            value={config?.backend ?? 'local'}
            onChange={handleToggle}
            options={[
              { value: 'local',  label: 'Local JSON', icon: 'ti-file-text' },
              { value: 'sqlite', label: 'SQLite',      icon: 'ti-database' },
            ]}
          />
        </div>

        {/* Storage info */}
        {info && config && (
          <>
            <Card padding={0}>
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
            </Card>
            <Button variant="secondary" icon="ti-folder-open" onClick={() => window.electronAPI.storage.openDataFolder()} style={{ alignSelf: 'flex-start' }}>
              Open data folder
            </Button>
          </>
        )}
      </Card>

      <SectionHeader>About</SectionHeader>
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card padding={0}>
          {infoRow('App', 'Project Agador Spartacus v1.0.0')}
          {typeof process !== 'undefined' && process.versions?.electron && infoRow('Electron', process.versions.electron)}
          {typeof process !== 'undefined' && process.versions?.node && infoRow('Node', process.versions.node)}
        </Card>
        <Button variant="secondary" disabled style={{ alignSelf: 'flex-start' }}>
          Check for updates
        </Button>
      </Card>
    </ScrollPane>
  );
}
