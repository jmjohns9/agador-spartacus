import React, { useState, useEffect } from 'react';
import { gaugeArc, valueColor } from '../../theme/theme';

// ─── Layout helpers ───────────────────────────────────────────────────────────

interface GridProps {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
  gap?: number;
}
export function Grid({ cols = 4, children, gap = 7 }: GridProps): React.ReactElement {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap,
    }}>
      {children}
    </div>
  );
}

// ─── ScrollPane ───────────────────────────────────────────────────────────────

export function ScrollPane({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
      scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent',
    }}>
      {children}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
      fontSize: 11, letterSpacing: 1.6, color: 'var(--tm)', textTransform: 'uppercase',
      display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0',
    }}>
      <span style={{ color: 'var(--pp)' }}>▪</span>
      {children}
      <div style={{ flex: 1, height: 1, background: 'var(--br)' }} />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  padding?: number;
  accentColor?: string;
  style?: React.CSSProperties;
}
export function Card({ children, padding = 10, accentColor, style }: CardProps): React.ReactElement {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${accentColor ?? 'var(--br)'}`,
      borderRadius: 3,
      padding,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── MetricTile ───────────────────────────────────────────────────────────────

interface MetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  barPercent?: number;
  barColor?: string;
  valueColor?: string;
  accentColor?: string;
  tooltip?: React.ReactNode;
  /** Timestamp of the underlying reading. When older than staleAfterMs, the value fades. */
  staleAt?: number;
  staleAfterMs?: number;
  /** 'hero' = promoted display (bigger value, spans 2 cols by default). */
  prominence?: 'normal' | 'hero';
}
export function MetricTile({
  label, value, unit, subtext,
  barPercent, barColor = 'var(--pp)',
  valueColor: vc = 'var(--tw)',
  accentColor,
  tooltip,
  staleAt, staleAfterMs = 3000,
  prominence = 'normal',
}: MetricTileProps): React.ReactElement {
  const stale = useStaleness(staleAt, staleAfterMs);
  const isHero = prominence === 'hero';
  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${accentColor ?? (isHero ? 'rgba(255,128,0,0.35)' : 'var(--br)')}`,
      borderLeft: isHero ? '3px solid var(--pp)' : undefined,
      borderRadius: 3, padding: isHero ? '14px 18px' : '11px 13px',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      gridColumn: isHero ? 'span 2' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isHero ? 6 : 4 }}>
        <span style={{
          fontSize: isHero ? 12 : 11,
          color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif",
          letterSpacing: isHero ? 1.2 : 0.6, textTransform: 'uppercase',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {label}
          <FreshnessDot staleAt={staleAt} stale={stale} />
        </span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: isHero ? 6 : 3 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: isHero ? 38 : 18, fontWeight: 500,
          color: vc, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          opacity: stale ? 0.4 : 1,
          transition: 'opacity 200ms',
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: isHero ? 14 : 12, color: 'var(--tm)' }}>{unit}</span>}
      </div>
      {subtext && <div style={{ fontSize: isHero ? 12 : 11, color: 'var(--tm)', marginTop: 3 }}>{subtext}</div>}
      {barPercent !== undefined && (
        <div style={{ height: isHero ? 4 : 3, background: 'var(--bg4)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, barPercent))}%`, background: barColor, borderRadius: 2 }} />
        </div>
      )}
    </div>
  );
}

// ─── Freshness — shared staleness primitive for live readings ────────────────

/** Returns true when `staleAt` is older than `staleAfterMs`. Ticks every 500 ms while a reading is being watched. */
function useStaleness(staleAt: number | undefined, staleAfterMs: number): boolean {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (staleAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [staleAt]);
  return staleAt !== undefined && now - staleAt > staleAfterMs;
}

/** Tiny live/stale indicator dot. Renders nothing when no timestamp is being tracked. */
function FreshnessDot({ staleAt, stale }: { staleAt?: number; stale: boolean }): React.ReactElement | null {
  if (staleAt === undefined) return null;
  return (
    <span
      title={stale ? 'Reading is stale — no update in the last few seconds' : 'Live'}
      aria-label={stale ? 'stale reading' : 'live reading'}
      style={{
        width: 6, height: 6, borderRadius: '50%',
        background: stale ? 'var(--tm)' : 'var(--sg)',
        boxShadow: stale ? 'none' : '0 0 0 2px rgba(0,201,110,0.12)',
        flexShrink: 0,
      }}
    />
  );
}

// ─── ArcGauge ─────────────────────────────────────────────────────────────────

interface ArcGaugeProps {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  /** Hard pixel size. Overrides auto-fill. */
  size?: number;
  /** Cap when auto-filling the cell (default 180). */
  maxSize?: number;
  color?: string;
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
  isDark?: boolean;
  /** Timestamp of the underlying reading. When older than staleAfterMs, the value fades. */
  staleAt?: number;
  staleAfterMs?: number;
}
// Internal SVG geometry is fixed; the outer wrapper scales it with width:100%.
const ARC_VIEWBOX = 120;

export function ArcGauge({
  value, min, max, label, unit, size, maxSize = 180,
  color, warnLow, warnHigh, critLow, critHigh, isDark = true,
  staleAt, staleAfterMs = 3000,
}: ArcGaugeProps): React.ReactElement {
  const radius = (ARC_VIEWBOX / 2) - 10;
  const { dashArray, dashOffset } = gaugeArc(value, min, max, radius);
  const vc = color ?? valueColor(value, warnLow, warnHigh, critLow, critHigh, isDark);
  const stale = useStaleness(staleAt, staleAfterMs);

  // If size is explicit, lock the SVG width; otherwise fill the cell, capped at maxSize.
  const svgStyle: React.CSSProperties = size != null
    ? { width: size, height: size }
    : { width: '100%', maxWidth: maxSize, height: 'auto', aspectRatio: '1 / 1' };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 3, padding: 12, height: '100%',
    }}>
      <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, textAlign: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        {label}
        <FreshnessDot staleAt={staleAt} stale={stale} />
      </div>
      <svg viewBox={`0 0 ${ARC_VIEWBOX} ${ARC_VIEWBOX}`} style={{ ...svgStyle, opacity: stale ? 0.4 : 1, transition: 'opacity 200ms' }} preserveAspectRatio="xMidYMid meet">
        <circle
          cx={ARC_VIEWBOX / 2} cy={ARC_VIEWBOX / 2} r={radius}
          fill="none" stroke="var(--br)" strokeWidth="6"
        />
        <circle
          cx={ARC_VIEWBOX / 2} cy={ARC_VIEWBOX / 2} r={radius}
          fill="none" stroke={vc} strokeWidth="6"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-225 ${ARC_VIEWBOX / 2} ${ARC_VIEWBOX / 2})`}
        />
        <text
          x={ARC_VIEWBOX / 2} y={ARC_VIEWBOX / 2 + 5}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize={16}
          fontWeight={500}
          fill={vc}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </text>
      </svg>
      <div style={{ fontSize: 12, color: 'var(--tm)', marginTop: 6 }}>{unit}</div>
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipProps {
  content: React.ReactNode;
}
export function Tooltip({ content }: TooltipProps): React.ReactElement {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <i
        className="ti ti-info-circle"
        style={{ fontSize: 12, color: 'var(--tm)', cursor: 'help' }}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      />
      {visible && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
          background: 'var(--bg4)', border: '1px solid var(--br)',
          borderRadius: 4, padding: '10px 12px', width: 260, zIndex: 200,
          fontSize: 11, lineHeight: 1.6, color: 'var(--tw)',
          pointerEvents: 'none',
        }}>
          {content}
        </div>
      )}
    </div>
  );
}

// ─── TooltipContent convenience ────────────────────────────────────────────────

interface TipProps {
  name: string;
  description: string;
  formula?: string;
  range?: string;
}
export function TipContent({ name, description, formula, range }: TipProps): React.ReactElement {
  return (
    <>
      <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 5 }}>{name}</div>
      <div style={{ color: 'var(--tm)', fontSize: 11 }}>{description}</div>
      {formula && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--pp)', marginTop: 6, background: 'var(--bg3)', padding: '4px 6px', borderRadius: 2 }}>
          {formula}
        </div>
      )}
      {range && (
        <div style={{ fontSize: 10, color: 'var(--gb)', marginTop: 4 }}>
          {range}
        </div>
      )}
    </>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'ok' | 'warn' | 'crit' | 'info' | 'muted';

const BADGE_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  ok:   { background: 'rgba(0,201,110,0.1)',  color: 'var(--sg)', border: '1px solid rgba(0,201,110,0.3)' },
  warn: { background: 'rgba(255,179,0,0.1)',  color: 'var(--sa)', border: '1px solid rgba(255,179,0,0.3)' },
  crit: { background: 'rgba(255,36,64,0.1)',  color: 'var(--sr)', border: '1px solid rgba(255,36,64,0.3)' },
  info: { background: 'rgba(0,144,208,0.1)',  color: 'var(--gb)', border: '1px solid rgba(0,144,208,0.3)' },
  muted:{ background: 'rgba(122,132,150,0.1)',color: 'var(--tm)', border: '1px solid rgba(122,132,150,0.3)' },
};

interface BadgeProps { label: string; variant: BadgeVariant; }
export function Badge({ label, variant }: BadgeProps): React.ReactElement {
  return (
    <span style={{
      ...BADGE_STYLES[variant],
      fontSize: 10, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
      letterSpacing: 0.3, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─── AlertBanner ──────────────────────────────────────────────────────────────

export function AlertBanner({ message, variant = 'crit' }: { message: string; variant?: BadgeVariant }): React.ReactElement {
  const s = BADGE_STYLES[variant];
  return (
    <div style={{ ...s, borderRadius: 3, padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
      <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} />
      {message}
    </div>
  );
}

// ─── DataRow ──────────────────────────────────────────────────────────────────

interface DataRowProps {
  pid?: string;
  name: string;
  value: string | number;
  subtext?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}
export function DataRow({ pid, name, value, subtext, badge, onClick }: DataRowProps): React.ReactElement {
  // Clickable rows render as real <button>s so they're keyboard/screen-reader accessible
  const Tag = (onClick ? 'button' : 'div') as 'button';
  return (
    <Tag
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
        padding: '6px 12px', borderBottom: '1px solid var(--bg3)', cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <div>
        {pid && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--tm)', marginBottom: 2 }}>{pid}</div>}
        <div style={{ fontSize: 12, color: 'var(--tw)', fontWeight: 500 }}>{name}</div>
        {subtext && <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2, lineHeight: 1.4 }}>{subtext}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
        {badge}
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--tw)', whiteSpace: 'nowrap' }}>
          {value}
        </span>
      </div>
    </Tag>
  );
}

// ─── Button — the one true button ──────────────────────────────────────────────
// Use this instead of ad-hoc inline-styled <button>s so sizing, radius, and
// variants stay consistent app-wide.

type ButtonVariant = 'primary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: 'rgba(255,128,0,0.1)',  border: '1px solid var(--pp)', color: 'var(--pp)' },
  ghost:   { background: 'var(--bg4)',           border: '1px solid var(--br)', color: 'var(--tw)' },
  danger:  { background: 'rgba(255,36,64,0.07)', border: '1px solid rgba(255,36,64,0.35)', color: 'var(--sr)' },
};

type ButtonSize = 'sm' | 'md';

const BUTTON_SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '5px 10px', fontSize: 11 },
  md: { padding: '8px 14px', fontSize: 12 },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;          // tabler icon class, e.g. 'ti-refresh'
  children: React.ReactNode;
}

export function Button({ variant = 'ghost', size = 'md', icon, children, style, disabled, ...rest }: ButtonProps): React.ReactElement {
  return (
    <button
      disabled={disabled}
      style={{
        ...BUTTON_STYLES[variant],
        ...BUTTON_SIZES[size],
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: 3,
        fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
        letterSpacing: 0.5, textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      {...rest}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: size === 'sm' ? 13 : 14 }} />}
      {children}
    </button>
  );
}

// ─── WaveBar — animated bus activity indicator ─────────────────────────────────

export function WaveBar({ color = 'var(--pp)', active = true }: { color?: string; active?: boolean }): React.ReactElement {
  if (!active) return <div style={{ height: 14 }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 14 }}>
      {[0, 0.15, 0.3, 0.45].map((delay, i) => (
        <div key={i} style={{
          width: 2, borderRadius: 1, background: color,
          animation: `waveAnim 1.5s infinite ease-in-out`,
          animationDelay: `${delay}s`,
          height: 8,
        }} />
      ))}
    </div>
  );
}
