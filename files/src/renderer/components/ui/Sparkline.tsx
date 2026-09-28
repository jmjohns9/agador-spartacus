import React, { useMemo, useId } from 'react';
import { useAppStore } from '../../store/appStore';
import { sparkPath } from './gaugeGeometry';

const W = 200;

export function Sparkline({ pid, color = 'var(--accent)', height = 40 }: { pid: string; color?: string; height?: number }): React.ReactElement | null {
  const history = useAppStore(s => s.history[pid]);
  const gradientId = useId();
  const path = useMemo(() => {
    if (!history) return null;
    return sparkPath(history.map(r => (typeof r.value === 'number' ? r.value : Number.NaN)), W, height);
  }, [history, height]);
  if (!path) return null;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradientId})`} />
      <path d={path.line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
