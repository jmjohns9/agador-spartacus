import React, { useEffect, useState } from 'react';
import { useAppStore, selectBatteryVoltage, selectActiveDTCCount, vehicleDisplayName } from '../../store/appStore';
import { TYPE, WEIGHT, NUMERIC, RADIUS, STATUS_TEXT } from '../../theme/theme';
import { Button } from '../layout/UIComponents';
import { ConnectionItem } from './ConnectionPopover';
import { batteryStatus, formatSessionTime } from './shellLogic';

interface ToolbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenDTC: () => void;
  onOpenConnection: () => void;
}

export function Toolbar({ sidebarOpen, onToggleSidebar, onOpenDTC, onOpenConnection }: ToolbarProps): React.ReactElement {
  const vehicle = useAppStore(s => s.vehicle);
  const sessionStartMs = useAppStore(s => s.sessionStartMs);
  const battery = useAppStore(selectBatteryVoltage);
  const dtcCount = useAppStore(selectActiveDTCCount);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sessionStartMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessionStartMs]);

  const subtitle = [vehicle.vin, vehicle.engine, vehicle.nickname].filter(Boolean).join(' · ') || 'Project Agador Spartacus';
  const bStatus = batteryStatus(battery);

  return (
    <header className="drag" style={{
      height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
      padding: `0 12px 0 ${sidebarOpen ? 12 : 84}px`,
      background: 'var(--content)', borderBottom: '1px solid var(--separator)',
    }}>
      <Button variant="plain" icon="ti-layout-sidebar" aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        title="Toggle sidebar (⌃⌘S)" onClick={onToggleSidebar} style={{ color: 'var(--label-2)', padding: '0 6px' }} />

      <div style={{ minWidth: 0, flex: 1, paddingLeft: 4 }}>
        <div style={{ ...TYPE.headline, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {vehicleDisplayName(vehicle)}
        </div>
        <div className="selectable" style={{ ...TYPE.caption, color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
      </div>

      <ConnectionItem onOpenConnection={onOpenConnection} />

      <div title="Battery voltage measured by the adapter at the OBD port" style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: RADIUS.control,
      }}>
        <i className="ti ti-battery-automotive" aria-hidden style={{ fontSize: 16, color: 'var(--label-2)' }} />
        <span style={{ ...TYPE.body, ...NUMERIC, fontWeight: WEIGHT.medium, color: bStatus === 'none' ? 'var(--label-3)' : STATUS_TEXT[bStatus] }}>
          {bStatus === 'none' ? '— V' : `${battery.toFixed(2)} V`}
        </span>
      </div>

      {dtcCount > 0 && (
        <button className="toolbar-item no-drag" onClick={onOpenDTC}
          title={`${dtcCount} active diagnostic code${dtcCount > 1 ? 's' : ''} — open fault codes`}
          style={{ ...TYPE.body, display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', border: 'none', borderRadius: RADIUS.control, background: 'var(--crit-tint)', color: 'var(--crit-text)', fontWeight: WEIGHT.medium }}>
          <i className="ti ti-engine" aria-hidden style={{ fontSize: 16 }} />
          <span style={NUMERIC}>{dtcCount}</span> {dtcCount > 1 ? 'codes' : 'code'}
        </button>
      )}

      <span title="Session time" style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label-2)', padding: '0 4px', minWidth: 64, textAlign: 'right' }}>
        {sessionStartMs ? formatSessionTime(now - sessionStartMs) : '—'}
      </span>
    </header>
  );
}
