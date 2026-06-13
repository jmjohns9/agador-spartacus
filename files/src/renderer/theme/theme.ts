// ─── Project Agador Spartacus — McLaren Technology Centre Theme ──────────────
// Color palette, typography, and spacing constants.
// Components import from here rather than hard-coding values.

export const COLORS = {
  // McLaren signature colors
  papaya:   '#FF8000',
  gulfBlue: '#0090D0',

  // Light-mode text variants — full papaya/gulf on white fail WCAG AA
  // (#FF8000 on #FFF ≈ 2.5:1). These keep the hue at readable contrast.
  papayaLight:   '#B45A00',
  gulfBlueLight: '#006B9E',

  // Dark mode backgrounds (carbon layering)
  dark: {
    bg:      '#07080A',
    bg2:     '#0D0F12',
    bg3:     '#111418',
    bg4:     '#181C22',
    border:  '#1C2128',
    subtle:  '#252B34',
    text:    '#EEF1F5',
    muted:   '#7A8496',
  },

  // Light mode (aluminum / glass aesthetic from MTC exterior)
  light: {
    bg:      '#F2F4F7',
    bg2:     '#FFFFFF',
    bg3:     '#ECEEF2',
    bg4:     '#E2E5EA',
    border:  '#C8CDD8',
    subtle:  '#9EA5B4',
    text:    '#111827',
    muted:   '#5C6679',
  },

  // Semantic status colors
  ok:     '#00C96E',
  warn:   '#FFB300',
  crit:   '#FF2440',
  info:   '#0090D0',

  // Dark mode semantic (slightly brighter for contrast)
  darkOk:   '#00C96E',
  darkWarn: '#FFB300',
  darkCrit: '#FF2440',

  // Light mode semantic (darker for readability on white)
  lightOk:   '#047A44',
  lightWarn: '#92600A',
  lightCrit: '#C8112A',
} as const;

export const FONTS = {
  display:  "'Barlow Condensed', sans-serif",
  body:     "'Barlow', sans-serif",
  mono:     "'JetBrains Mono', monospace",
} as const;

export const FONT_SIZES = {
  xs:   11,
  sm:   12,
  base: 13,
  md:   15,
  lg:   18,
  xl:   22,
  xxl:  28,
  hero: 36,
} as const;

export const SPACING = {
  xs: 4,
  sm: 7,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const BORDER_RADIUS = 3;  // Sharp corners — MTC precision aesthetic

// ─── CSS Custom Properties injected into :root ──────────────────────────────
// The renderer/App.tsx injects these based on isDarkMode.

export function buildCSSVars(dark: boolean): string {
  const c = dark ? COLORS.dark : COLORS.light;
  const ok   = dark ? COLORS.darkOk   : COLORS.lightOk;
  const warn = dark ? COLORS.darkWarn : COLORS.lightWarn;
  const crit = dark ? COLORS.darkCrit : COLORS.lightCrit;

  return `
    --bg:     ${c.bg};
    --bg2:    ${c.bg2};
    --bg3:    ${c.bg3};
    --bg4:    ${c.bg4};
    --br:     ${c.border};
    --bs:     ${c.subtle};
    --tw:     ${c.text};
    --tm:     ${c.muted};
    --pp:     ${dark ? COLORS.papaya : COLORS.papayaLight};
    --gb:     ${dark ? COLORS.gulfBlue : COLORS.gulfBlueLight};
    --sg:     ${ok};
    --sa:     ${warn};
    --sr:     ${crit};
  `;
}

// ─── Gauge arc geometry helpers ───────────────────────────────────────────────

/**
 * Compute SVG stroke-dasharray values for a circular arc gauge.
 * @param value   Current value
 * @param min     Minimum value
 * @param max     Maximum value
 * @param radius  Circle radius in SVG units
 * @param sweep   Arc sweep in degrees (default 270 — three-quarter circle)
 */
export function gaugeArc(
  value: number,
  min: number,
  max: number,
  radius: number,
  sweep = 270
): { dashArray: string; dashOffset: number } {
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const arcLength = (sweep / 360) * circumference;
  const filled = fraction * arcLength;
  const gap = circumference - filled;
  // Offset rotates start point to bottom-left (225° from top)
  const dashOffset = -circumference * ((360 - sweep) / 2 / 360);
  return {
    dashArray: `${filled.toFixed(1)} ${gap.toFixed(1)}`,
    dashOffset,
  };
}

/**
 * Return the semantic color for a value given optional warn/crit thresholds.
 */
export function valueColor(
  value: number,
  warnLow?: number,
  warnHigh?: number,
  critLow?: number,
  critHigh?: number,
  dark = true
): string {
  const ok   = dark ? COLORS.darkOk   : COLORS.lightOk;
  const warn = dark ? COLORS.darkWarn : COLORS.lightWarn;
  const crit = dark ? COLORS.darkCrit : COLORS.lightCrit;

  if ((critLow  !== undefined && value < critLow)  ||
      (critHigh !== undefined && value > critHigh)) return crit;
  if ((warnLow  !== undefined && value < warnLow)  ||
      (warnHigh !== undefined && value > warnHigh)) return warn;
  return ok;
}
