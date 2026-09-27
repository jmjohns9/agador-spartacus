import React from 'react';
import { Thresholds, statusFor, STATUS_FILL, TYPE, WEIGHT, NUMERIC, RADIUS, MOTION } from '../../theme/theme';
import { describeArc, gaugeFraction, GAUGE_START, GAUGE_END } from './gaugeGeometry';
import { isMissing } from './logic';
import { useStaleness } from './Metric';

export type GaugeProps = Thresholds & {
  label: string;
  value: number;
  min?: number;
  max: number;
  unit?: string;
  size?: 'regular' | 'compact';
  staleAt?: number;
  staleAfterMs?: number;
};

const VB = 120, CX = 60, CY = 62, R = 48, STROKE = 8;

export function Gauge({
  label, value, min = 0, max, unit, size = 'regular',
  warnLow, warnHigh, critLow, critHigh, staleAt, staleAfterMs = 3000,
}: GaugeProps): React.ReactElement {
  const stale = useStaleness(staleAt, staleAfterMs);
  const missing = isMissing(value);
  const tone = statusFor(value, { warnLow, warnHigh, critLow, critHigh });
  const fraction = gaugeFraction(value, min, max);
  const end = GAUGE_START + (GAUGE_END - GAUGE_START) * fraction;
  const compact = size === 'compact';
  const valueType = compact ? TYPE.title3 : TYPE.title1;

  return (
    <div className="metric" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: compact ? '8px 12px' : '12px 16px', height: '100%',
      background: 'var(--grouped)', border: '1px solid var(--separator)', borderRadius: RADIUS.card,
    }}>
      <div style={{ ...TYPE.caption, fontWeight: WEIGHT.medium, color: 'var(--label-2)', alignSelf: 'stretch', textAlign: 'center' }}>{label}</div>
      <div style={{ position: 'relative', width: '100%', maxWidth: compact ? 110 : 170 }}>
        <svg viewBox={`0 0 ${VB} ${VB - 14}`} style={{ width: '100%', display: 'block', opacity: stale ? 0.45 : 1, transition: `opacity ${MOTION.base}` }} aria-hidden>
          <path d={describeArc(CX, CY, R, GAUGE_START, GAUGE_END)} fill="none" stroke="var(--fill-strong)" strokeWidth={STROKE} strokeLinecap="round" />
          {!missing && fraction > 0.005 && (
            <path d={describeArc(CX, CY, R, GAUGE_START, end)} fill="none" stroke={STATUS_FILL[tone]} strokeWidth={STROKE} strokeLinecap="round" />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: compact ? 4 : 8 }}>
          <span style={{ ...valueType, ...NUMERIC, color: missing ? 'var(--label-3)' : 'var(--label)' }}>
            {missing ? '—' : value.toLocaleString()}
          </span>
          {unit && <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{unit}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignSelf: 'stretch', padding: '0 8px', ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)' }}>
        <span>{min.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
