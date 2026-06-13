import React, { useState } from 'react';
import { gaugeArc, valueColor } from '../theme/theme';

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
      fontSize: 10, letterSpacing: 2, color: 'var(--tm)', textTransform: 'uppercase',
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
}
export function MetricTile({
  label, value, unit, subtext,
  barPercent, barColor = 'var(--pp)',
  valueColor: vc = 'var(--tw)',
  accentColor,
  tooltip,
}: MetricTileProps): React.ReactElement {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${accentColor ?? 'var(--br)'}`,
      borderRadius: 3, padding: '9px 11px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {label}
        </span>
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 500, color: vc, lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 11, color: 'var(--tm)' }}>{unit}</span>}
      </div>
      {subtext && <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 3 }}>{subtext}</div>}
      {barPercent !== undefined && (
        <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, barPercent))}%`, background: barColor, borderRadius: 2 }} />
        </div>
      )}
    </div>
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
  color?: string;
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
  isDark?: boolean;
}
export function ArcGauge({
  value, min, max, label, unit, size = 80,
  color, warnLow, warnHigh, critLow, critHigh, isDark = true,
}: ArcGaugeProps): React.ReactElement {
  const radius = (size / 2) - 8;
  const { dashArray, dashOffset } = gaugeArc(value, min, max, radius);
  const vc = color ?? valueColor(value, warnLow, warnHigh, critLow, critHigh, isDark);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 3, padding: 10 }}>
      <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--br)" strokeWidth="6"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={vc} strokeWidth="6"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-225 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2} y={size / 2 + 5}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace"
          fontSize={radius > 25 ? 13 : 10}
          fontWeight={500}
          fill={vc}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </text>
      </svg>
      <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 2 }}>{unit}</div>
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
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '6px 12px', borderBottom: '1px solid var(--bg3)', cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg3)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
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
    </div>
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
