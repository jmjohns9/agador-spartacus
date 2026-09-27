import React from 'react';
import { TYPE, WEIGHT, RADIUS } from '../../theme/theme';

interface CardProps {
  children: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
  /** @deprecated ignored — status is shown on values/badges now. Removed in Task 13. */
  accentColor?: string;
}
export function Card({ children, padding = 16, style }: CardProps): React.ReactElement {
  return (
    <div style={{
      background: 'var(--grouped)', border: '1px solid var(--separator)',
      borderRadius: RADIUS.card, padding, overflow: 'hidden', flexShrink: 0, ...style,
    }}>
      {children}
    </div>
  );
}

export function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
      <h2 style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, color: 'var(--label-2)', margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

export function Grid({ cols = 4, gap = 12, children }: { cols?: 2 | 3 | 4; gap?: number; children: React.ReactNode }): React.ReactElement {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>{children}</div>;
}

export function ScrollPane({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {children}
    </div>
  );
}

export function Divider(): React.ReactElement {
  return <div role="separator" style={{ height: 1, background: 'var(--separator)', margin: '4px 0' }} />;
}
