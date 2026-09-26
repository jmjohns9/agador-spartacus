// ─── Project Agador Spartacus — macOS-native design tokens ───────────────────
// Apple system colours, SF type scale, 4pt spacing. Light/dark switch purely via
// prefers-color-scheme; the main process drives it with nativeTheme.themeSource.

import type { CSSProperties } from 'react';

export type Status = 'neutral' | 'ok' | 'warn' | 'crit';

export interface Thresholds {
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
}

// ─── Colour ──────────────────────────────────────────────────────────────────
// *-text variants are contrast-checked for body text (see theme.test.ts);
// the plain status colours are for fills, strokes and dots.

export const LIGHT = {
  window:        '#F5F5F7',
  content:       '#F5F5F7',
  grouped:       '#FFFFFF',
  elevated:      '#FFFFFF',
  fill:          'rgba(118,118,128,0.12)',
  'fill-strong': 'rgba(118,118,128,0.20)',
  label:         'rgba(0,0,0,0.85)',
  'label-2':     'rgba(0,0,0,0.55)',
  'label-3':     'rgba(0,0,0,0.40)',
  'label-4':     'rgba(0,0,0,0.10)',
  separator:     'rgba(0,0,0,0.10)',
  shadow:        'rgba(0,0,0,0.12)',
  accent:        '#007AFF',
  'accent-text': '#0066CC',
  'on-accent':   '#FFFFFF',
  ok:            '#34C759',
  'ok-text':     '#1F7A35',
  warn:          '#FF9500',
  'warn-text':   '#C93400',
  crit:          '#FF3B30',
  'crit-text':   '#D70015',
  teal:          '#30B0C7',
  indigo:        '#5856D6',
  purple:        '#AF52DE',
  pink:          '#FF2D55',
} as const;

export const DARK: Record<keyof typeof LIGHT, string> = {
  window:        '#1C1C1E',
  content:       '#1C1C1E',
  grouped:       '#2C2C2E',
  elevated:      '#3A3A3C',
  fill:          'rgba(118,118,128,0.24)',
  'fill-strong': 'rgba(118,118,128,0.36)',
  label:         'rgba(255,255,255,0.85)',
  'label-2':     'rgba(255,255,255,0.55)',
  'label-3':     'rgba(255,255,255,0.40)',
  'label-4':     'rgba(255,255,255,0.10)',
  separator:     'rgba(255,255,255,0.10)',
  shadow:        'rgba(0,0,0,0.40)',
  accent:        '#0A84FF',
  'accent-text': '#409CFF',
  'on-accent':   '#FFFFFF',
  ok:            '#30D158',
  'ok-text':     '#30D158',
  warn:          '#FF9F0A',
  'warn-text':   '#FF9F0A',
  crit:          '#FF453A',
  'crit-text':   '#FF6961',
  teal:          '#40CBE0',
  indigo:        '#5E5CE6',
  purple:        '#BF5AF2',
  pink:          '#FF375F',
};

/** Tints derived from the active palette — resolve per appearance automatically. */
export const DERIVED: Readonly<Record<string, string>> = {
  'accent-tint': 'color-mix(in srgb, var(--accent) 16%, transparent)',
  'ok-tint':     'color-mix(in srgb, var(--ok) 16%, transparent)',
  'warn-tint':   'color-mix(in srgb, var(--warn) 16%, transparent)',
  'crit-tint':   'color-mix(in srgb, var(--crit) 16%, transparent)',
  selection:     'color-mix(in srgb, var(--accent) 22%, transparent)',
};

/** Old variable names kept alive during the screen sweep. Removed in Task 13. */
export const LEGACY_ALIASES: Readonly<Record<string, string>> = {
  bg:  'var(--window)',
  bg2: 'var(--grouped)',
  bg3: 'var(--fill)',
  bg4: 'var(--fill-strong)',
  br:  'var(--separator)',
  bs:  'var(--label-4)',
  tw:  'var(--label)',
  tm:  'var(--label-2)',
  tp:  'var(--label)',
  pp:  'var(--accent-text)',
  gb:  'var(--teal)',
  sg:  'var(--ok-text)',
  sa:  'var(--warn-text)',
  sr:  'var(--crit-text)',
};

const declare = (vars: Readonly<Record<string, string>>): string =>
  Object.entries(vars).map(([k, v]) => `--${k}: ${v};`).join(' ');

export function buildThemeCSS(): string {
  return [
    `:root { color-scheme: light dark; ${declare(LIGHT)} ${declare(DERIVED)} ${declare(LEGACY_ALIASES)} }`,
    `@media (prefers-color-scheme: dark) { :root { ${declare(DARK)} } }`,
  ].join('\n');
}

export const STATUS_TEXT: Record<Status, string> = {
  neutral: 'var(--label)',
  ok:      'var(--ok-text)',
  warn:    'var(--warn-text)',
  crit:    'var(--crit-text)',
};

export const STATUS_FILL: Record<Status, string> = {
  neutral: 'var(--accent)',
  ok:      'var(--ok)',
  warn:    'var(--warn)',
  crit:    'var(--crit)',
};

export function statusFor(value: number, t: Thresholds): Status {
  if (!Number.isFinite(value)) return 'neutral';
  if ((t.critLow !== undefined && value < t.critLow) || (t.critHigh !== undefined && value > t.critHigh)) return 'crit';
  if ((t.warnLow !== undefined && value < t.warnLow) || (t.warnHigh !== undefined && value > t.warnHigh)) return 'warn';
  return 'neutral';
}

// ─── Typography ──────────────────────────────────────────────────────────────

const UI_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

export const FONTS = {
  ui:      UI_FONT,
  mono:    "ui-monospace, 'SF Mono', Menlo, monospace",
  /** @deprecated legacy alias — removed in Task 13 */
  body:    UI_FONT,
  /** @deprecated legacy alias — removed in Task 13 */
  display: UI_FONT,
} as const;

export const WEIGHT = { regular: 400, medium: 510, semibold: 590, bold: 700 } as const;

export const TYPE = {
  caption:  { fontSize: 11, lineHeight: '14px', fontWeight: WEIGHT.regular },
  body:     { fontSize: 13, lineHeight: '18px', fontWeight: WEIGHT.regular },
  headline: { fontSize: 15, lineHeight: '20px', fontWeight: WEIGHT.semibold },
  title3:   { fontSize: 17, lineHeight: '22px', fontWeight: WEIGHT.semibold },
  title2:   { fontSize: 22, lineHeight: '28px', fontWeight: WEIGHT.bold },
  title1:   { fontSize: 28, lineHeight: '34px', fontWeight: WEIGHT.bold },
  display:  { fontSize: 34, lineHeight: '40px', fontWeight: WEIGHT.bold },
} satisfies Record<string, CSSProperties>;

/** Spread onto any element showing a number, VIN, hex byte or PID id. */
export const NUMERIC: CSSProperties = { fontFamily: FONTS.mono, fontVariantNumeric: 'tabular-nums' };

// ─── Space, shape, motion ────────────────────────────────────────────────────

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const RADIUS = { control: 6, card: 10, panel: 12 } as const;
export const MOTION = { fast: '150ms ease-out', base: '200ms ease-out', slow: '250ms ease-out' } as const;
