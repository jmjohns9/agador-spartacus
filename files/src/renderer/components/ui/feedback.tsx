import React, { useRef, useState } from 'react';
import { TYPE, WEIGHT, NUMERIC, RADIUS } from '../../theme/theme';
import { Button } from './controls';

export type BadgeVariant = 'ok' | 'warn' | 'crit' | 'info' | 'muted';

const TINT: Record<BadgeVariant, { bg: string; fg: string; icon: string }> = {
  ok:    { bg: 'var(--ok-tint)',     fg: 'var(--ok-text)',     icon: 'ti-circle-check' },
  warn:  { bg: 'var(--warn-tint)',   fg: 'var(--warn-text)',   icon: 'ti-alert-triangle' },
  crit:  { bg: 'var(--crit-tint)',   fg: 'var(--crit-text)',   icon: 'ti-alert-triangle' },
  info:  { bg: 'var(--accent-tint)', fg: 'var(--accent-text)', icon: 'ti-info-circle' },
  muted: { bg: 'var(--fill)',        fg: 'var(--label-2)',     icon: 'ti-info-circle' },
};

export function Badge({ label, variant }: { label: string; variant: BadgeVariant }): React.ReactElement {
  const t = TINT[variant];
  return (
    <span style={{
      ...TYPE.caption, fontWeight: WEIGHT.semibold,
      background: t.bg, color: t.fg,
      padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center',
    }}>
      {label}
    </span>
  );
}

export function AlertBanner({ message, variant = 'crit', action, onAction }: {
  message: string; variant?: BadgeVariant; action?: string; onAction?: () => void;
}): React.ReactElement {
  const t = TINT[variant];
  return (
    <div role={variant === 'crit' ? 'alert' : 'status'} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: RADIUS.card, background: t.bg,
    }}>
      <i className={`ti ${t.icon}`} style={{ fontSize: 16, color: t.fg, flexShrink: 0 }} aria-hidden />
      <span style={{ ...TYPE.body, color: 'var(--label)', flex: 1 }}>{message}</span>
      {action && onAction && <Button size="sm" variant="secondary" onClick={onAction}>{action}</Button>}
    </div>
  );
}

export function Tooltip({ content }: { content: React.ReactNode }): React.ReactElement {
  const tipId = React.useId();
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: string; left: number }>({ left: 0, bottom: 'calc(100% + 8px)' });

  const show = () => {
    setVisible(true);
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const tipW = 260, tipH = 180;
    let left = 0;
    if (rect.left + tipW > window.innerWidth - 8) left = -(rect.left + tipW - window.innerWidth + 16);
    if (rect.left + left < 8) left = -rect.left + 8;
    setPos(rect.top - tipH - 8 < 0 ? { top: rect.height + 8, left } : { bottom: 'calc(100% + 8px)', left });
  };
  const hide = () => setVisible(false);

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={ref}
        type="button"
        className="info-trigger"
        aria-label="More information"
        aria-describedby={visible ? tipId : undefined}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onKeyDown={e => { if (e.key === 'Escape') hide(); }}
        style={{ border: 'none', background: 'transparent', padding: 0, display: 'inline-flex', color: 'var(--label-3)' }}
      >
        <i className="ti ti-info-circle" style={{ fontSize: 14 }} aria-hidden />
      </button>
      {visible && (
        <div role="tooltip" id={tipId} style={{
          position: 'absolute', ...pos, zIndex: 200, width: 260, pointerEvents: 'none',
          padding: '8px 12px', borderRadius: 8,
          background: 'var(--elevated)', border: '0.5px solid var(--separator)',
          boxShadow: '0 8px 24px var(--shadow)', backdropFilter: 'blur(20px)',
          ...TYPE.caption, color: 'var(--label)',
        }}>
          {content}
        </div>
      )}
    </span>
  );
}

export function TipContent({ name, description, formula, range }: { name: string; description: string; formula?: string; range?: string }): React.ReactElement {
  return (
    <>
      <div style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, marginBottom: 4 }}>{name}</div>
      <div style={{ color: 'var(--label-2)' }}>{description}</div>
      {formula && (
        <div style={{ ...NUMERIC, marginTop: 6, padding: '3px 6px', borderRadius: 4, background: 'var(--fill)', color: 'var(--accent-text)' }}>
          {formula}
        </div>
      )}
      {range && <div style={{ marginTop: 4, color: 'var(--label-2)' }}>{range}</div>}
    </>
  );
}

export function DataRow({ pid, name, value, subtext, badge, onClick, pressed, expanded }: {
  pid?: string; name: string; value: string | number; subtext?: string; badge?: React.ReactNode; onClick?: () => void;
  /** Selection state of a toggle row, announced as aria-pressed */
  pressed?: boolean;
  /** Open state of a row that reveals details, announced as aria-expanded */
  expanded?: boolean;
}): React.ReactElement {
  const Tag = (onClick ? 'button' : 'div') as 'button';
  return (
    <Tag
      className={onClick ? 'row-hover' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? pressed : undefined}
      aria-expanded={onClick ? expanded : undefined}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        width: '100%', minHeight: 32, padding: '6px 12px', textAlign: 'left',
        background: 'transparent', border: 'none', borderBottom: '1px solid var(--separator)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        {pid && <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)' }}>{pid}</div>}
        <div style={{ ...TYPE.body, color: 'var(--label)' }}>{name}</div>
        {subtext && <div style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{subtext}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {badge}
        <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label)', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </Tag>
  );
}

export function EmptyState({ icon = 'ti-database-off', title, message }: { icon?: string; title: string; message?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24, textAlign: 'center' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 28, color: 'var(--label-3)' }} aria-hidden />
      <div style={{ ...TYPE.headline, color: 'var(--label-2)' }}>{title}</div>
      {message && <div style={{ ...TYPE.caption, color: 'var(--label-3)', maxWidth: 320 }}>{message}</div>}
    </div>
  );
}
