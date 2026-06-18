import React, { useState, useEffect, useMemo } from 'react';
import { gaugeArc, valueColor, FONTS } from '../../theme/theme';
import { useAppStore } from '../../store/appStore';

// ─── Layout helpers ───────────────────────────────────────────────────────────

interface GridProps {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
  gap?: number;
}
export function Grid({ cols = 4, children, gap = 6 }: GridProps): React.ReactElement {
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
      fontFamily: FONTS.body, fontWeight: 700,
      fontSize: 9, letterSpacing: 2.2, color: 'var(--tm)', textTransform: 'uppercase',
      display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0',
    }}>
      <div style={{ width: 12, height: 1, background: 'var(--pp)', flexShrink: 0 }} />
      {children}
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(48,54,61,0.8) 0%, transparent 100%)' }} />
    </div>
  );
}

// ─── Card — Double-Bezel / Doppelrand architecture ───────────────────────────
// Outer shell (machined frame) wraps inner core (polished surface) for haptic depth.

interface CardProps {
  children: React.ReactNode;
  padding?: number;
  accentColor?: string;
  style?: React.CSSProperties;
}
export function Card({ children, padding = 10, accentColor, style }: CardProps): React.ReactElement {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
      padding: 1,
      ...style,
    }}>
      <div className="card-lift" style={{
        background: 'var(--bg2)',
        border: `1px solid ${accentColor ? `${accentColor}40` : 'rgba(255,255,255,0.04)'}`,
        boxShadow: accentColor
          ? `inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.2), inset 2px 0 0 ${accentColor}`
          : 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.2)',
        padding,
        overflow: 'hidden',
      }}>
        {children}
      </div>
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
  staleAt?: number;
  staleAfterMs?: number;
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
    <div className="card-lift" style={{
      background: 'var(--bg2)',
      border: `1px solid ${accentColor ? `${accentColor}30` : 'rgba(255,255,255,0.05)'}`,
      borderLeft: isHero ? `2px solid var(--pp)` : undefined,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.15)',
      padding: isHero ? '12px 16px' : '10px 12px',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      gridColumn: isHero ? 'span 2' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isHero ? 5 : 3 }}>
        <span style={{
          fontSize: isHero ? 11 : 10,
          color: 'var(--tm)', fontFamily: FONTS.body,
          letterSpacing: isHero ? 1.4 : 1, textTransform: 'uppercase',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontWeight: 700,
        }}>
          {label}
          <FreshnessDot staleAt={staleAt} stale={stale} />
        </span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: isHero ? 5 : 3 }}>
        <span style={{
          fontFamily: FONTS.mono,
          fontSize: isHero ? 36 : 18, fontWeight: 600,
          color: vc, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          opacity: stale ? 0.4 : 1,
          transition: 'opacity 200ms',
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: isHero ? 13 : 11, color: 'var(--tm)', fontFamily: FONTS.mono }}>{unit}</span>}
      </div>
      {subtext && <div style={{ fontSize: isHero ? 11 : 10, color: 'var(--tm)', marginTop: 3, fontFamily: FONTS.mono }}>{subtext}</div>}
      {barPercent !== undefined && (
        <div style={{ height: isHero ? 4 : 3, background: 'var(--bg4)', marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, barPercent))}%`, background: barColor }} />
        </div>
      )}
    </div>
  );
}

// ─── Freshness — shared staleness primitive for live readings ────────────────

function useStaleness(staleAt: number | undefined, staleAfterMs: number): boolean {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (staleAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [staleAt]);
  return staleAt !== undefined && now - staleAt > staleAfterMs;
}

function FreshnessDot({ staleAt, stale }: { staleAt?: number; stale: boolean }): React.ReactElement | null {
  if (staleAt === undefined) return null;
  return (
    <span
      title={stale ? 'Reading is stale — no update in the last few seconds' : 'Live'}
      aria-label={stale ? 'stale reading' : 'live reading'}
      style={{
        width: 6, height: 6,
        background: stale ? 'var(--tm)' : 'var(--sg)',
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
  size?: number;
  maxSize?: number;
  color?: string;
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
  isDark?: boolean;
  staleAt?: number;
  staleAfterMs?: number;
}
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

  const svgStyle: React.CSSProperties = size != null
    ? { width: size, height: size }
    : { width: '100%', maxWidth: maxSize, height: 'auto', aspectRatio: '1 / 1' };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      background: 'var(--bg2)',
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.15)',
      padding: 10, height: '100%',
    }}>
      <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: FONTS.body, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
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
          strokeLinecap="butt"
          transform={`rotate(-225 ${ARC_VIEWBOX / 2} ${ARC_VIEWBOX / 2})`}
        />
        {/* Min/max markers */}
        <text x="18" y={ARC_VIEWBOX - 6} textAnchor="middle" fontFamily={FONTS.mono} fontSize={8} fill="var(--tm)">{min}</text>
        <text x={ARC_VIEWBOX - 18} y={ARC_VIEWBOX - 6} textAnchor="middle" fontFamily={FONTS.mono} fontSize={8} fill="var(--tm)">{max}</text>
        <text
          x={ARC_VIEWBOX / 2} y={ARC_VIEWBOX / 2 + 5}
          textAnchor="middle"
          fontFamily={FONTS.mono}
          fontSize={16}
          fontWeight={600}
          fill={vc}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </text>
      </svg>
      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 4, fontFamily: FONTS.mono }}>{unit}</div>
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipProps {
  content: React.ReactNode;
}
export function Tooltip({ content }: TooltipProps): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const iconRef = React.useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: string; left: number }>({ left: 0, bottom: 'calc(100% + 8px)' });

  const handleEnter = () => {
    setVisible(true);
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const tipW = 260, tipH = 180;
      let left = 0;
      if (rect.left + tipW > window.innerWidth - 8) left = -(rect.left + tipW - window.innerWidth + 16);
      if (rect.left + left < 8) left = -rect.left + 8;
      if (rect.top - tipH - 8 < 0) {
        setPos({ top: rect.height + 8, left });
      } else {
        setPos({ bottom: 'calc(100% + 8px)', left });
      }
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <i
        ref={iconRef}
        className="ti ti-info-circle"
        style={{ fontSize: 12, color: 'var(--tm)', cursor: 'help' }}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setVisible(false)}
      />
      {visible && (
        <div style={{
          position: 'absolute', ...pos,
          background: 'var(--bg4)', border: '2px solid var(--br)',
          padding: '8px 10px', width: 260, zIndex: 200,
          fontSize: 11, lineHeight: 1.5, color: 'var(--tw)',
          fontFamily: FONTS.body,
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
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, fontFamily: FONTS.body }}>{name}</div>
      <div style={{ color: 'var(--tm)', fontSize: 11 }}>{description}</div>
      {formula && (
        <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'var(--pp)', marginTop: 5, background: 'var(--bg3)', padding: '3px 6px', border: '1px solid var(--br)' }}>
          {formula}
        </div>
      )}
      {range && (
        <div style={{ fontSize: 10, color: 'var(--gb)', marginTop: 3, fontFamily: FONTS.mono }}>
          {range}
        </div>
      )}
    </>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'ok' | 'warn' | 'crit' | 'info' | 'muted';

const BADGE_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  ok:   { background: 'rgba(63,185,80,0.09)',   color: 'var(--sg)', border: '1px solid rgba(63,185,80,0.22)' },
  warn: { background: 'rgba(210,153,34,0.09)',  color: 'var(--sa)', border: '1px solid rgba(210,153,34,0.22)' },
  crit: { background: 'rgba(248,81,73,0.09)',   color: 'var(--sr)', border: '1px solid rgba(248,81,73,0.22)' },
  info: { background: 'rgba(33,136,255,0.09)',  color: 'var(--pp)', border: '1px solid rgba(33,136,255,0.22)' },
  muted:{ background: 'rgba(139,148,158,0.06)', color: 'var(--tm)', border: '1px solid rgba(139,148,158,0.15)' },
};

interface BadgeProps { label: string; variant: BadgeVariant; }
export function Badge({ label, variant }: BadgeProps): React.ReactElement {
  return (
    <span style={{
      ...BADGE_STYLES[variant],
      fontSize: 9, fontFamily: FONTS.body, fontWeight: 700,
      letterSpacing: 0.8, textTransform: 'uppercase', padding: '2px 7px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─── AlertBanner ──────────────────────────────────────────────────────────────

export function AlertBanner({ message, variant = 'crit', action, onAction }: { message: string; variant?: BadgeVariant; action?: string; onAction?: () => void }): React.ReactElement {
  const s = BADGE_STYLES[variant];
  const accentColor = variant === 'crit' ? 'var(--sr)' : variant === 'warn' ? 'var(--sa)' : variant === 'ok' ? 'var(--sg)' : 'var(--pp)';
  return (
    <div style={{
      ...s,
      padding: '7px 12px', fontSize: 11,
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: FONTS.body,
      boxShadow: `inset 2px 0 0 ${accentColor}`,
    }}>
      <i className="ti ti-alert-triangle" style={{ fontSize: 13, flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.5 }}>{message}</span>
      {action && onAction && (
        <button
          className="btn"
          onClick={onAction}
          style={{
            padding: '3px 10px', fontSize: 10, fontWeight: 700,
            background: 'rgba(33,136,255,0.1)', border: '1px solid rgba(33,136,255,0.3)',
            color: 'var(--pp)', cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
            fontFamily: FONTS.mono, letterSpacing: 0.5, textTransform: 'uppercase',
          }}
        >
          {action}
        </button>
      )}
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
  const Tag = (onClick ? 'button' : 'div') as 'button';
  return (
    <Tag
      className={onClick ? 'data-row' : undefined}
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
        padding: '5px 12px', borderBottom: '1px solid var(--bg3)', cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div>
        {pid && <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'var(--tm)', marginBottom: 1 }}>{pid}</div>}
        <div style={{ fontSize: 12, color: 'var(--tw)', fontWeight: 500, fontFamily: FONTS.body }}>{name}</div>
        {subtext && <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 1, lineHeight: 1.4, fontFamily: FONTS.body }}>{subtext}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
        {badge}
        <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: 'var(--tw)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
      </div>
    </Tag>
  );
}

// ─── Button — Button-in-Button icon architecture ──────────────────────────────

type ButtonVariant = 'primary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'rgba(33,136,255,0.1)',
    border: '1px solid rgba(33,136,255,0.35)',
    color: 'var(--pp)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  },
  ghost: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--tw)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  danger: {
    background: 'rgba(248,81,73,0.06)',
    border: '1px solid rgba(248,81,73,0.28)',
    color: 'var(--sr)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
};

const ICON_BG: Record<ButtonVariant, string> = {
  primary: 'rgba(33,136,255,0.2)',
  ghost:   'rgba(255,255,255,0.07)',
  danger:  'rgba(248,81,73,0.15)',
};

type ButtonSize = 'sm' | 'md';

const BUTTON_SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: 10 },
  md: { padding: '6px 13px', fontSize: 11 },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  children: React.ReactNode;
}

export function Button({ variant = 'ghost', size = 'md', icon, children, style, disabled, className, ...rest }: ButtonProps): React.ReactElement {
  const iconSize = size === 'sm' ? 10 : 12;
  const iconWrap = size === 'sm' ? 16 : 20;
  return (
    <button
      className={`btn ${className ?? ''}`}
      disabled={disabled}
      style={{
        ...BUTTON_STYLES[variant],
        ...BUTTON_SIZES[size],
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontFamily: FONTS.body, fontWeight: 700,
        letterSpacing: 0.6, textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
      {...rest}
    >
      {icon && (
        <span style={{
          width: iconWrap, height: iconWrap,
          background: ICON_BG[variant],
          borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
        }}>
          <i className={`ti ${icon}`} style={{ fontSize: iconSize }} />
        </span>
      )}
      {children}
    </button>
  );
}

// ─── WaveBar ──────────────────────────────────────────────────────────────────

export function WaveBar({ color = 'var(--pp)', active = true }: { color?: string; active?: boolean }): React.ReactElement {
  if (!active) return <div style={{ height: 14 }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 14 }}>
      {[0, 0.15, 0.3, 0.45].map((delay, i) => (
        <div key={i} style={{
          width: 2, background: color,
          animation: `waveAnim 1.5s infinite ease-in-out`,
          animationDelay: `${delay}s`,
          height: 8,
        }} />
      ))}
    </div>
  );
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

interface SparklineProps {
  pid: string;
  color: string;
  height?: number;
}

export function Sparkline({ pid, color, height = 36 }: SparklineProps): React.ReactElement | null {
  const history = useAppStore(s => s.history[pid]);
  const points = useMemo(() => {
    if (!history || history.length < 2) return null;
    const nums = history
      .map(r => (typeof r.value === 'number' ? r.value : null))
      .filter((v): v is number => v !== null);
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const range = max - min || 1;
    const pad = range * 0.05;
    const yMin = min - pad;
    const yRange = range + pad * 2;
    return nums.map((v, i) => {
      const x = (i / (nums.length - 1)) * 200;
      const y = height - ((v - yMin) / yRange) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [history, height]);

  if (!points) return null;

  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height, opacity: 0.3 }}>
      <svg viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      </svg>
    </div>
  );
}

// ─── HeroCard ───────────────────────────────────────────────────────────────

interface HeroCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  valueColor?: string;
  accentBorder?: string;
  pid: string;
  sparkColor: string;
  staleAt?: number;
}

export function HeroCard({
  label, value, unit, subtext,
  valueColor: vc = 'var(--tw)',
  accentBorder,
  pid, sparkColor,
  staleAt,
}: HeroCardProps): React.ReactElement {
  const stale = useStaleness(staleAt, 3000);
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderLeft: accentBorder ? `2px solid ${accentBorder}` : undefined,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.18)',
      padding: '10px 12px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        fontFamily: FONTS.body, fontSize: 10,
        letterSpacing: 1.6, textTransform: 'uppercase' as const,
        color: 'var(--tm)', marginBottom: 3, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <FreshnessDot staleAt={staleAt} stale={stale} />
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontFamily: FONTS.mono,
          fontSize: 30, fontWeight: 700, lineHeight: 1.1,
          letterSpacing: -0.5, color: vc,
          fontVariantNumeric: 'tabular-nums',
          opacity: stale ? 0.4 : 1,
          transition: 'opacity 200ms',
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 12, color: 'var(--tm)', fontFamily: FONTS.mono }}>{unit}</span>}
      </div>
      {subtext && <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 2, fontFamily: FONTS.mono }}>{subtext}</div>}
      <Sparkline pid={pid} color={sparkColor} />
    </div>
  );
}

// ─── DenseMetricTile ────────────────────────────────────────────────────────

interface DenseMetricTileProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  subtextColor?: string;
  barPercent?: number;
  barColor?: string;
  valueColor?: string;
  accentBorder?: string;
  tooltip?: React.ReactNode;
}

export function DenseMetricTile({
  label, value, unit, subtext, subtextColor,
  barPercent, barColor = 'var(--pp)',
  valueColor: vc = 'var(--tw)',
  accentBorder,
  tooltip,
}: DenseMetricTileProps): React.ReactElement {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderLeft: accentBorder ? `2px solid ${accentBorder}` : undefined,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.15)',
        padding: '7px 10px',
        position: 'relative',
        transition: 'border-color 0.35s cubic-bezier(0.32,0.72,0,1), box-shadow 0.35s cubic-bezier(0.32,0.72,0,1)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'rgba(255,255,255,0.12)';
        el.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.15)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'rgba(255,255,255,0.05)';
        el.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.15)';
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 2,
      }}>
        <span style={{
          fontFamily: FONTS.body, fontSize: 9, fontWeight: 700,
          letterSpacing: 1.4, textTransform: 'uppercase' as const,
          color: 'var(--tm)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{
          fontFamily: FONTS.mono,
          fontSize: 20, fontWeight: 600, lineHeight: 1.2,
          color: vc,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: 'var(--tm)', fontFamily: FONTS.mono }}>{unit}</span>}
      </div>
      {subtext && <div style={{ fontSize: 10, color: subtextColor ?? 'var(--tm)', marginTop: 1, fontFamily: FONTS.mono }}>{subtext}</div>}
      {barPercent !== undefined && (
        <div style={{ height: 3, background: 'var(--bg4)', marginTop: 5, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, barPercent))}%`,
            background: barColor,
            transition: 'width 0.6s',
          }} />
        </div>
      )}
    </div>
  );
}

// ─── CompactArcGauge ────────────────────────────────────────────────────────

interface CompactArcGaugeProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
}

export function CompactArcGauge({ label, value, max, unit, color }: CompactArcGaugeProps): React.ReactElement {
  const fraction = Math.min(1, Math.max(0, value / max));
  const arcEnd = fractionToArcPoint(fraction);
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid rgba(255,255,255,0.05)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.15)',
      padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <div style={{
        fontFamily: FONTS.body, fontSize: 9, fontWeight: 700,
        letterSpacing: 1.4, textTransform: 'uppercase' as const,
        color: 'var(--tm)', marginBottom: 4,
      }}>
        {label}
      </div>
      <svg width="80" height="52" viewBox="0 0 80 52">
        <path d="M 10 48 A 35 35 0 1 1 70 48" fill="none" stroke="var(--bg4)" strokeWidth="5" strokeLinecap="butt" />
        {fraction > 0.001 && (
          <path d={`M 10 48 A 35 35 0 ${fraction > 0.5 ? 1 : 0} 1 ${arcEnd}`}
            fill="none" stroke={color} strokeWidth="5" strokeLinecap="butt" />
        )}
        {/* Min/max labels */}
        <text x="10" y="52" textAnchor="middle" fontFamily={FONTS.mono} fontSize="6" fill="var(--tm)">0</text>
        <text x="70" y="52" textAnchor="middle" fontFamily={FONTS.mono} fontSize="6" fill="var(--tm)">{max}</text>
      </svg>
      <div style={{
        fontFamily: FONTS.mono,
        fontSize: 16, fontWeight: 600, color, marginTop: 2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: FONTS.mono }}>{unit}</div>
    </div>
  );
}

function fractionToArcPoint(fraction: number): string {
  const startAngle = (5 * Math.PI) / 4;
  const endAngle = -Math.PI / 4;
  const totalSweep = startAngle - endAngle;
  const angle = startAngle - fraction * totalSweep;
  const cx = 40, cy = 48, r = 35;
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

// ─── StatusBar ──────────────────────────────────────────────────────────────

export function StatusBar(): React.ReactElement {
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const protocol = useAppStore(s => s.protocol);
  const liveData = useAppStore(s => s.liveData);
  const [rate, setRate] = useState('0.0');

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const recent = Object.values(liveData).filter(r => now - r.timestamp < 2000).length;
      setRate((recent / 2).toFixed(1));
    }, 1000);
    return () => clearInterval(id);
  }, [liveData]);

  const isConnected = connectionStatus === 'connected';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 4px 8px',
      borderBottom: '2px solid var(--br)',
      marginBottom: 10,
    }}>
      <div style={{
        fontFamily: FONTS.mono,
        fontSize: 11, letterSpacing: 1.6,
        textTransform: 'uppercase' as const,
        color: 'var(--tm)', fontWeight: 700,
      }}>
        Agador Spartacus — Live Telemetry
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: FONTS.mono, color: isConnected ? 'var(--sg)' : 'var(--tm)' }}>
          <span style={{
            width: 6, height: 6,
            background: isConnected ? 'var(--sg)' : 'var(--tm)',
            animation: isConnected ? 'statusPulse 2s infinite' : undefined,
          }} />
          {isConnected ? 'CONNECTED' : connectionStatus.toUpperCase()}
        </div>
        {isConnected && (
          <>
            <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'var(--tm)' }}>
              {rate}/s
            </div>
            {protocol && protocol !== 'Unknown' && (
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'var(--tm)' }}>
                {protocol}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes statusPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
