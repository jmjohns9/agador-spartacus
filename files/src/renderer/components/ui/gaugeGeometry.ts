// SVG geometry for gauges and sparklines. Angles are degrees clockwise from
// 12 o'clock; the gauge sweeps 240° from -120 to +120.

export const GAUGE_START = -120;
export const GAUGE_END = 120;

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

export function describeArc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function gaugeFraction(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Smoothed polyline (midpoint quadratic curves) plus a closed area path. */
export function sparkPath(values: number[], w: number, h: number): { line: string; area: string } | null {
  const nums = values.filter(Number.isFinite);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const range = Math.max(...nums) - min || 1;
  const pts = nums.map((v, i) => ({
    x: (i / (nums.length - 1)) * w,
    y: h - 2 - ((v - min) / range) * (h - 4),
  }));
  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    const my = (pts[i - 1].y + pts[i].y) / 2;
    line += ` Q ${pts[i - 1].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  line += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  const area = `${line} L ${w.toFixed(1)} ${h} L 0.0 ${h} Z`;
  return { line, area };
}
