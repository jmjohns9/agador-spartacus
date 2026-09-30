import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { voltageSeries, windowMinutes } from '../../logic/verdicts';
import { TYPE, NUMERIC, STATUS_TEXT, STATUS_FILL } from '../../theme/theme';
import type { Status } from '../../theme/theme';
import { EmptyState } from './feedback';

// Resting-voltage reference lines (state of charge for a lead-acid battery)
const REFS: Array<{ v: number; label: string; status: Status; dim?: boolean }> = [
  { v: 12.6, label: '12.6 Full', status: 'ok' },
  { v: 12.4, label: '12.4 ~75%', status: 'warn' },
  { v: 12.0, label: '12.0 Low',  status: 'crit' },
  { v: 11.8, label: '11.8 Dead', status: 'crit', dim: true },
];
const TICKS = [11.6, 11.8, 12.0, 12.2, 12.4, 12.6, 12.8, 13.0];
const V_MIN = 11.6, V_MAX = 13.0;
const H = 140, PAD_L = 40, PAD_R = 76, PAD_Y = 8;
const EMPTY: never[] = [];

/**
 * Battery voltage over time. The SVG is drawn in pixels (viewBox = measured
 * size), so labels stay at caption size whatever the window width; a scaled
 * viewBox used to blow 11 px text up to ~20 px. x is time, not sample index,
 * because history only records value changes.
 */
export function VoltageTimeline(): React.ReactElement {
  const history = useAppStore(s => s.history['ATRV'] ?? EMPTY);
  const current = useAppStore(s => s.liveData['ATRV']);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = voltageSeries(history, current);
  if (pts.length < 2) {
    return <EmptyState icon="ti-chart-dots" title="Collecting voltage history" message="Gathering battery voltage samples — check back in a moment." />;
  }

  const plotW = Math.max(width - PAD_L - PAD_R, 1);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const xOf = (t: number) => PAD_L + (t1 > t0 ? ((t - t0) / (t1 - t0)) * plotW : plotW);
  const clamp = (v: number) => Math.min(V_MAX, Math.max(V_MIN, v));
  const yOf = (v: number) => PAD_Y + (1 - (clamp(v) - V_MIN) / (V_MAX - V_MIN)) * (H - 2 * PAD_Y);
  // Step line: a value holds until the next change
  const line = pts.map((p, i) => (i === 0 ? `M${xOf(p.t)},${yOf(p.v)}` : `H${xOf(p.t)}V${yOf(p.v)}`)).join('');

  const lastV = pts[pts.length - 1].v;
  const drift = lastV - pts[0].v;
  const lineColor = lastV < 12.0 ? STATUS_FILL.crit : lastV < 12.4 ? STATUS_FILL.warn : 'var(--purple)';
  const caption = { ...TYPE.caption, ...NUMERIC };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div ref={ref} style={{ width: '100%', height: H }}>
        {width > 0 && (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`Battery voltage over ${windowMinutes(pts)} minutes, now ${lastV.toFixed(2)} V`}>
            {TICKS.map(v => (
              <text key={v} x={PAD_L - 6} y={yOf(v) + 4} textAnchor="end" style={{ ...caption, fill: 'var(--label-3)' }}>{v.toFixed(1)}</text>
            ))}
            {REFS.map(({ v, label, status, dim }) => (
              <g key={v} opacity={dim ? 0.6 : 1}>
                <line x1={PAD_L} y1={yOf(v)} x2={PAD_L + plotW} y2={yOf(v)} stroke={STATUS_FILL[status]} strokeOpacity={0.7} strokeWidth={1} strokeDasharray="4,3" />
                <text x={PAD_L + plotW + 6} y={yOf(v) + 4} style={{ ...caption, fill: STATUS_TEXT[status] }}>{label}</text>
              </g>
            ))}
            <path d={line} fill="none" stroke={lineColor} strokeWidth={1.8} strokeLinejoin="round" />
            <circle cx={xOf(t1)} cy={yOf(lastV)} r={4} fill={lineColor} stroke="var(--grouped)" strokeWidth={1.5} />
          </svg>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>
          {pts.length} readings · {windowMinutes(pts)} min window
        </span>
        <span style={{ ...caption, color: 'var(--label-2)' }}>
          Change: {drift >= 0 ? '+' : ''}{drift.toFixed(2)} V
        </span>
        <span style={{ ...caption, color: 'var(--label-2)' }}>Now: {lastV.toFixed(2)} V</span>
      </div>
    </div>
  );
}
