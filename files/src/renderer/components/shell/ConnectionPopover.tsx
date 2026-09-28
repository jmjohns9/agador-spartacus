import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { TYPE, WEIGHT, NUMERIC, RADIUS, STATUS_FILL } from '../../theme/theme';
import { Button } from '../layout/UIComponents';
import { computeRate, connectionLabel, connectionTone, ConnectionStatusLike } from './shellLogic';

export function ConnectionItem({ onOpenConnection }: { onOpenConnection: () => void }): React.ReactElement {
  const status = useAppStore(s => s.connectionStatus) as ConnectionStatusLike;
  const protocol = useAppStore(s => s.protocol);
  const adapterInfo = useAppStore(s => s.adapterInfo);
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState({ livePIDs: 0, perSec: '0.0' });
  const ref = useRef<HTMLDivElement>(null);

  // Rate is only computed while the popover is open (cheap when closed).
  useEffect(() => {
    if (!open) return;
    const tick = () => setRate(computeRate(useAppStore.getState().liveData, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const connected = status === 'connected';
  const inProgress = status === 'connecting' || status === 'initializing';
  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '3px 0' }}>
      <span style={{ color: 'var(--label-2)' }}>{label}</span>
      <span style={{ ...NUMERIC, color: 'var(--label)' }}>{value}</span>
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }} className="no-drag">
      <button
        className="toolbar-item"
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{ ...TYPE.body, display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', border: 'none', borderRadius: RADIUS.control, background: 'transparent', color: 'var(--label)' }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 4, background: status === 'disconnected' ? 'var(--label-3)' : STATUS_FILL[connectionTone(status)] }} />
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{connectionLabel(status, adapterInfo)}</span>
        {protocol && <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{protocol}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Connection details" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 300, width: 260,
          padding: 12, borderRadius: RADIUS.panel,
          background: 'var(--elevated)', border: '0.5px solid var(--separator)',
          boxShadow: '0 12px 32px var(--shadow)', backdropFilter: 'blur(20px)',
          ...TYPE.caption,
        }}>
          <div style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, marginBottom: 8 }}>{connectionLabel(status, adapterInfo)}</div>
          {row('Protocol', protocol || '—')}
          {row('Live PIDs', connected ? String(rate.livePIDs) : '—')}
          {row('Read rate', connected ? `${rate.perSec}/s` : '—')}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            {connected
              ? <Button size="sm" variant="destructive" onClick={() => { setOpen(false); void window.electronAPI.disconnect(); }}>Disconnect</Button>
              : inProgress
              ? <Button size="sm" onClick={() => { setOpen(false); void window.electronAPI.disconnect(); }}>Cancel</Button>
              : <Button size="sm" variant="primary" onClick={() => { setOpen(false); onOpenConnection(); }}>Open connection</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
