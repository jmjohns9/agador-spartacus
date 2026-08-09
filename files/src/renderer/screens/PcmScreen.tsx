import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { ScrollPane, SectionHeader, Card, Badge, AlertBanner, Button } from '../components/layout/UIComponents';
import { FONTS } from '../theme/theme';
import { PcmField, PcmFieldGroup, PcmIdentity } from '../../shared/types';

// ─── PCM diagnostics ──────────────────────────────────────────────────────────
//
// Reads the GM Mode 3C identity blocks off the powertrain control module.
// Read-only by design: the reference implementation (PcmHammer) exists to
// flash PCMs, and none of that belongs behind a diagnostics tab.

const GROUP_ORDER: PcmFieldGroup[] = ['identity', 'calibration', 'level', 'service'];

const GROUP_LABEL: Record<PcmFieldGroup, string> = {
  identity:    'Module identity',
  calibration: 'Calibration IDs',
  level:       'Calibration levels',
  service:     'Service data',
};

const GROUP_HINT: Record<PcmFieldGroup, string> = {
  identity:    'Who this module is — matches against the VIN on the door jamb',
  calibration: 'What software it is running. Needed before any tune or reflash',
  level:       'Revision counters for each calibration segment',
  service:     'Oil life and the manufacturer enable counter',
};

function FieldRow({ field }: { field: PcmField }): React.ReactElement {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--tm)', minWidth: 190, flexShrink: 0 }}>
        {field.label}
      </span>
      {field.supported ? (
        <>
          <span
            onClick={() => field.raw && setShowRaw(v => !v)}
            title={field.raw ? 'Click to toggle raw bytes' : undefined}
            style={{
              fontFamily: FONTS.mono, fontSize: 13, color: 'var(--tp)',
              cursor: field.raw ? 'pointer' : 'default', wordBreak: 'break-all',
            }}
          >
            {showRaw && field.raw ? field.raw : (field.value || '—')}
          </span>
          {showRaw && <Badge label="RAW" variant="info" />}
        </>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--tm)', fontStyle: 'italic' }}>
          not supported by this calibration
        </span>
      )}
    </div>
  );
}

export function PcmScreen(): React.ReactElement {
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const isConnected = connectionStatus === 'connected';

  const [identity, setIdentity] = useState<PcmIdentity | null>(null);
  const [reading,  setReading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => window.electronAPI.onPcmProgress(setProgress), []);

  const handleRead = async () => {
    setReading(true);
    setError(null);
    setProgress(null);
    try {
      const res = await window.electronAPI.readPcmIds();
      if (res.ok) {
        setIdentity(res.identity);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
      setProgress(null);
    }
  };

  const supported = identity?.fields.filter(f => f.supported).length ?? 0;

  return (
    <ScrollPane>
      {!isConnected && (
        <AlertBanner
          variant="warn"
          message="Not connected. The PCM identity read talks directly to the module, so it needs a live adapter connection."
        />
      )}

      <SectionHeader>Powertrain control module</SectionHeader>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            icon="ti-download"
            disabled={!isConnected || reading}
            onClick={handleRead}
          >
            {reading ? 'Reading…' : identity ? 'Re-read identity' : 'Read PCM identity'}
          </Button>

          {reading && progress && (
            <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: 'var(--tm)' }}>
              block {progress.done} / {progress.total}
            </span>
          )}

          {identity && !reading && (
            <>
              <Badge label={`${supported}/${identity.fields.length} SUPPORTED`} variant="ok" />
              <span style={{ fontSize: 11, color: 'var(--tm)' }}>
                {identity.protocol} · read {new Date(identity.readAt).toLocaleTimeString()}
              </span>
            </>
          )}
        </div>

        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--tm)', lineHeight: 1.55 }}>
          Queries GM Mode <span style={{ fontFamily: FONTS.mono }}>3C</span> identity blocks over J1850 VPW.
          PID polling pauses while this runs, because the read reprograms the adapter header and
          turns message headers on. This is read-only — nothing is written to the module.
        </p>
      </Card>

      {error && <AlertBanner variant="crit" message={error} />}

      {identity && GROUP_ORDER.map(group => {
        const fields = identity.fields.filter(f => f.group === group);
        if (!fields.length) return null;
        return (
          <React.Fragment key={group}>
            <SectionHeader>{GROUP_LABEL[group]}</SectionHeader>
            <Card>
              <p style={{ margin: '0 0 6px', fontSize: 10, color: 'var(--tm)' }}>
                {GROUP_HINT[group]}
              </p>
              {fields.map(f => <FieldRow key={f.key} field={f} />)}
            </Card>
          </React.Fragment>
        );
      })}

      {!identity && !error && (
        <Card>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--tm)', lineHeight: 1.6 }}>
            Reads VIN, serial number, hardware ID, operating system ID, every calibration
            segment ID and its revision level, the broadcast code, oil life, and the
            manufacturer enable counter.
            <br /><br />
            Blocks the module does not answer are shown as unsupported rather than hidden —
            which IDs a PCM exposes varies by calibration, and the gaps are themselves
            diagnostic. Click any value to see the raw bytes behind it.
          </p>
        </Card>
      )}
    </ScrollPane>
  );
}
