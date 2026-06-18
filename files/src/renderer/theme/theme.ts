// ─── Project Agador Spartacus — Dark Navy Professional Theme ─────────────────
// Deep navy/slate backgrounds, electric blue accent, GitHub-dark-inspired.
// Professional diagnostic software feel: precise, readable, no visual noise.

export const COLORS = {
  // Accent colors
  primary:   '#2188FF',   // Electric blue — active states, primary CTA
  secondary: '#3FB950',   // GitHub green — OK/connected status

  // Light-mode accent variants (WCAG AA on white)
  primaryLight:   '#0366D6',
  secondaryLight: '#2EA043',

  // Dark mode — deep navy layering
  dark: {
    bg:      '#0D1117',
    bg2:     '#161B22',
    bg3:     '#1C2128',
    bg4:     '#22272E',
    border:  '#30363D',
    subtle:  '#3D444D',
    text:    '#F0F6FC',
    muted:   '#8B949E',
  },

  // Light mode — cool slate
  light: {
    bg:      '#F6F8FA',
    bg2:     '#FFFFFF',
    bg3:     '#EAEEF2',
    bg4:     '#DDE1E6',
    border:  '#C5CBD2',
    subtle:  '#9198A1',
    text:    '#1F2328',
    muted:   '#636C76',
  },

  // Semantic status colors
  ok:     '#3FB950',
  warn:   '#D29922',
  crit:   '#F85149',
  info:   '#58A6FF',

  // Dark mode semantic
  darkOk:   '#3FB950',
  darkWarn: '#D29922',
  darkCrit: '#F85149',

  // Light mode semantic
  lightOk:   '#2EA043',
  lightWarn: '#9A6700',
  lightCrit: '#CF222E',
} as const;

export const FONTS = {
  display:  "'Inter', 'Roboto', system-ui, -apple-system, sans-serif",
  body:     "'Inter', 'Roboto', system-ui, -apple-system, sans-serif",
  mono:     "'JetBrains Mono', 'Roboto Mono', monospace",
} as const;

export const FONT_SIZES = {
  xs:   10,
  sm:   11,
  base: 13,
  md:   14,
  lg:   18,
  xl:   22,
  xxl:  28,
  hero: 36,
} as const;

export const SPACING = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

export const BORDER_RADIUS = 0;

export const BORDER_WIDTH = 2;

export const EASING = {
  spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ─── CSS Custom Properties injected into :root ──────────────────────────────

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
    --pp:     ${dark ? COLORS.primary : COLORS.primaryLight};
    --gb:     ${dark ? COLORS.secondary : COLORS.secondaryLight};
    --sg:     ${ok};
    --sa:     ${warn};
    --sr:     ${crit};
  `;
}

// ─── Gauge arc geometry helpers ───────────────────────────────────────────────

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
  const dashOffset = -circumference * ((360 - sweep) / 2 / 360);
  return {
    dashArray: `${filled.toFixed(1)} ${gap.toFixed(1)}`,
    dashOffset,
  };
}

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
