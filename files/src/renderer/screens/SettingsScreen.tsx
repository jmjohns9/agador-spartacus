import React, { useState, useEffect, useCallback } from 'react';
import { StorageConfig, StorageInfo, BuildInfo } from '../../shared/types';
import {
  ScrollPane, Card, SectionHeader, SegmentedControl, AlertBanner, Button, DataRow,
} from '../components/layout/UIComponents';
import { TYPE } from '../theme/theme';
import { Lockup } from '../components/brand/Brand';

function fmtBytes(b: number): string {
  if (b < 1024)         return `${b} B`;
  if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// "9d91b7a · fix/adapter-link-robustness", flagged when built from uncommitted work
function describeBuild(build: BuildInfo | null): string {
  if (!build) return 'Development build';
  const parts = [build.commit, build.branch].filter(Boolean).join(' · ');
  return build.dirty ? `${parts} · uncommitted changes` : parts;
}

export function SettingsScreen(): React.ReactElement {
  const [config,    setConfigState] = useState<StorageConfig | null>(null);
  const [info,      setInfo]        = useState<StorageInfo | null>(null);
  const [migrating, setMigrating]   = useState(false);
  const [pending,   setPending]     = useState<'local' | 'sqlite' | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  const [appInfo, setAppInfo] = useState<{ version: string; build: BuildInfo | null; electron: string; chrome: string; node: string } | null>(null);
  useEffect(() => { window.electronAPI.getAppInfo().then(setAppInfo).catch(() => {}); }, []);

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
    setMigrateError(null);
    try {
      await window.electronAPI.storage.migrate(pending);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': /, '') : String(err);
      setMigrateError(`Migration failed, nothing was changed: ${msg}`);
    } finally {
      setMigrating(false);
    }
  };

  const infoRow = (label: string, value: string) => <DataRow key={label} name={label} value={value} />;

  return (
    <ScrollPane>
      <SectionHeader>Storage backend</SectionHeader>

      {migrateError && <AlertBanner variant="crit" message={migrateError} />}

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 4px' }}>
          <Lockup height={20} />
          <div style={{ ...TYPE.body, color: 'var(--label-2)' }}>Reads everything. Changes nothing.</div>
        </div>
        <Card padding={0}>
          {infoRow('App', `Tattlestone${appInfo ? ` v${appInfo.version}` : ''}`)}
          {appInfo && infoRow('Build', describeBuild(appInfo.build))}
          {appInfo?.build && infoRow('Built', new Date(appInfo.build.builtAt).toLocaleString())}
          {appInfo && infoRow('Electron', appInfo.electron)}
          {appInfo && infoRow('Chromium', appInfo.chrome)}
          {appInfo && infoRow('Node', appInfo.node)}
        </Card>
      </Card>
    </ScrollPane>
  );
}
