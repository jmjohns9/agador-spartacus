import React, { useRef } from 'react';
import { TYPE, WEIGHT, RADIUS } from '../../theme/theme';
import { nextIndex } from './logic';

type Variant = 'primary' | 'secondary' | 'plain' | 'destructive';

const VARIANT: Record<Variant, React.CSSProperties> = {
  primary:     { background: 'var(--accent)', color: 'var(--on-accent)' },
  secondary:   { background: 'var(--fill)', color: 'var(--label)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' },
  plain:       { background: 'transparent', color: 'var(--accent-text)' },
  destructive: { background: 'var(--crit-tint)', color: 'var(--crit-text)' },
};

const SIZE = {
  sm: { height: 22, padding: '0 8px',  ...TYPE.caption, iconSize: 13 },
  md: { height: 28, padding: '0 12px', ...TYPE.body,    iconSize: 15 },
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: string;
  children?: React.ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, children, style, disabled, className, ...rest }: ButtonProps): React.ReactElement {
  const { iconSize, ...sz } = SIZE[size];
  return (
    <button
      className={`ui-button no-drag ${className ?? ''}`}
      disabled={disabled}
      style={{
        ...VARIANT[variant], ...sz,
        fontWeight: WEIGHT.medium,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: 'none', borderRadius: RADIUS.control, whiteSpace: 'nowrap',
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
      {...rest}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: iconSize }} aria-hidden />}
      {children}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string; icon?: string }>;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = 'md', ariaLabel, disabled = false }: SegmentedProps<T>): React.ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex(o => o.value === value));
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const i = nextIndex(current, e.key, options.length);
    if (i === null) return;
    e.preventDefault();
    onChange(options[i].value);
    refs.current[i]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-disabled={disabled || undefined} onKeyDown={onKeyDown} className="no-drag"
      style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--fill)', borderRadius: RADIUS.control + 1, opacity: disabled ? 0.5 : 1 }}>
      {options.map((o, i) => {
        const selected = i === current;
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el; }}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              ...(size === 'sm' ? TYPE.caption : TYPE.body),
              fontWeight: selected ? WEIGHT.semibold : WEIGHT.regular,
              height: size === 'sm' ? 18 : 24, padding: '0 10px',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              border: 'none', borderRadius: RADIUS.control - 1,
              background: selected ? 'var(--elevated)' : 'transparent',
              boxShadow: selected ? '0 1px 2px var(--shadow)' : 'none',
              color: 'var(--label)',
            }}
          >
            {o.icon && <i className={`ti ${o.icon}`} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
