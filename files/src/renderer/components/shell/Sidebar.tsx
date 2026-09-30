import React from 'react';
import type { ScreenId } from '../../store/appStore';
import { TYPE, WEIGHT, NUMERIC, RADIUS } from '../../theme/theme';
import { NAV_GROUPS, SETTINGS_ITEM, NavItem } from './navItems';

interface SidebarProps {
  active: ScreenId;
  onSelect: (id: ScreenId) => void;
  dtcCount: number;
  connectionAlert: boolean;
}

function Row({ item, active, onSelect, badge, alert }: {
  item: NavItem; active: boolean; onSelect: (id: ScreenId) => void; badge?: number; alert?: boolean;
}): React.ReactElement {
  return (
    <button
      className="sidebar-row no-drag"
      data-screen={item.id}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
      style={{
        ...TYPE.body, color: 'var(--label)',
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', height: 28, padding: '0 8px',
        border: 'none', borderRadius: RADIUS.control, textAlign: 'left',
        background: active ? 'var(--selection)' : 'transparent',
      }}
    >
      <i className={`ti ${item.icon}`} aria-hidden
        style={{ fontSize: 16, width: 18, textAlign: 'center', color: alert ? 'var(--crit-text)' : 'var(--accent-text)' }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
      {badge ? (
        <span aria-label={`${badge} active codes`} style={{
          ...TYPE.caption, ...NUMERIC, fontWeight: WEIGHT.semibold,
          minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--crit)', color: 'var(--on-accent)',
        }}>{badge}</span>
      ) : null}
    </button>
  );
}

export const Sidebar = React.memo(function Sidebar({ active, onSelect, dtcCount, connectionAlert }: SidebarProps): React.ReactElement {
  return (
    <nav aria-label="Sections" style={{
      width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'transparent', borderRight: '1px solid var(--separator)',
    }}>
      <div className="drag" style={{ height: 52, flexShrink: 0 }} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title ?? gi} style={{ marginBottom: 12 }}>
            {group.title && (
              <div style={{ ...TYPE.caption, fontWeight: WEIGHT.semibold, color: 'var(--label-3)', padding: '6px 8px 4px' }}>
                {group.title}
              </div>
            )}
            {group.items.map(item => (
              <Row key={item.id} item={item} active={active === item.id} onSelect={onSelect}
                badge={item.id === 'dtc' ? dtcCount : undefined}
                alert={item.id === 'connect' && connectionAlert} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: 8, borderTop: '1px solid var(--separator)' }}>
        <Row item={SETTINGS_ITEM} active={active === 'settings'} onSelect={onSelect} />
      </div>
    </nav>
  );
});
