import React, { useEffect, useState } from 'react';
import { Status, STATUS_TEXT, STATUS_FILL, TYPE, WEIGHT, NUMERIC, RADIUS, MOTION } from '../../theme/theme';
import { clampPercent, isMissing } from './logic';
import { Sparkline } from './Sparkline';
import { Tooltip } from './feedback';

export function useStaleness(staleAt: number | undefined, afterMs = 3000): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (staleAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [staleAt]);
  return staleAt !== undefined && now - staleAt > afterMs;
}

export interface MetricProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  status?: Status;
  subtextStatus?: Status;
  barPercent?: number;
  barStatus?: Status;
  tooltip?: React.ReactNode;
  staleAt?: number;
  staleAfterMs?: number;
  size?: 'hero' | 'regular' | 'compact';
  span?: 1 | 2;
  spark?: { pid: string; color?: string };
}

const SIZE = {
  hero:    { value: TYPE.display, unit: TYPE.headline, pad: '16px 20px', gap: 8 },
  regular: { value: TYPE.title2,  unit: TYPE.body,     pad: '12px 16px', gap: 4 },
  compact: { value: TYPE.title3,  unit: TYPE.caption,  pad: '8px 12px', gap: 4 },
} as const;

export function Metric({
  label, value, unit, subtext, status = 'neutral', subtextStatus = 'neutral',
  barPercent, barStatus, tooltip, staleAt, staleAfterMs = 3000,
  size = 'regular', span = 1, spark,
}: MetricProps): React.ReactElement {
  const stale = useStaleness(staleAt, staleAfterMs);
  const missing = isMissing(value);
  const s = SIZE[size];
  return (
    <div className="metric" style={{
      position: 'relative', overflow: 'hidden', flexShrink: 0,
      display: 'flex', flexDirection: 'column', gap: s.gap,
      padding: s.pad, height: '100%',
      background: 'var(--grouped)', border: '1px solid var(--separator)', borderRadius: RADIUS.card,
      gridColumn: span === 2 ? 'span 2' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 14 }}>
        <span style={{ ...TYPE.caption, fontWeight: WEIGHT.medium, color: 'var(--label-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {staleAt !== undefined && (
          <span title={stale ? 'No update in the last few seconds' : 'Live'} aria-label={stale ? 'stale reading' : 'live reading'}
            style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: stale ? 'var(--label-3)' : 'var(--ok)' }} />
        )}
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, position: 'relative', zIndex: 1 }}>
        <span style={{
          ...s.value, ...NUMERIC,
          color: missing ? 'var(--label-3)' : STATUS_TEXT[status],
          opacity: stale ? 0.45 : 1, transition: `opacity ${MOTION.base}`,
        }}>
          {missing ? '—' : value}
        </span>
        {unit && !missing && <span style={{ ...s.unit, color: 'var(--label-2)' }}>{unit}</span>}
      </div>
      {subtext && (
        <div style={{ ...TYPE.caption, color: subtextStatus === 'neutral' ? 'var(--label-2)' : STATUS_TEXT[subtextStatus], position: 'relative', zIndex: 1 }}>
          {subtext}
        </div>
      )}
      {barPercent !== undefined && !missing && (
        <div style={{ height: 4, borderRadius: 2, background: 'var(--fill)', marginTop: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${clampPercent(barPercent)}%`,
            background: STATUS_FILL[barStatus ?? status],
            transition: `width ${MOTION.slow}`,
          }} />
        </div>
      )}
      {spark && <Sparkline pid={spark.pid} color={spark.color} />}
    </div>
  );
}
