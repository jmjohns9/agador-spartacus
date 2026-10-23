// ─── Tattlestone — macOS-native design tokens ─────────────────
// Brand colours (Basalt, Signal, Paper) over Apple's system status colours, SF
// type scale, 4pt spacing. Light appearance only; the main process pins
// nativeTheme.themeSource to 'light' to match.
//
// Brand rule: Signal orange appears only when the car is telling you something
// (warnings). Everything else is Basalt on Paper; red stays for critical.

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

export const BRAND = {
  'brand-ink':    '#16171A',   // Basalt
  'brand-signal': '#E8590C',   // Signal
  'brand-paper':  '#F5F3EE',   // Paper
} as const;

export const LIGHT = {
  ...BRAND,
  window:        '#F5F3EE',
  content:       '#F5F3EE',
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
  accent:        '#16171A',
  'accent-text': '#16171A',
  'on-accent':   '#FFFFFF',
  ok:            '#34C759',
  'ok-text':     '#1F7A35',
  warn:          '#E8590C',
  'warn-text':   '#B4460A',
  crit:          '#FF3B30',
  'crit-text':   '#D70015',
  teal:          '#30B0C7',
  indigo:        '#5856D6',
  purple:        '#AF52DE',
  pink:          '#FF2D55',
} as const;

/** Tints derived from the palette. */
export const DERIVED: Readonly<Record<string, string>> = {
  'accent-tint': 'color-mix(in srgb, var(--accent) 16%, transparent)',
  'ok-tint':     'color-mix(in srgb, var(--ok) 16%, transparent)',
  'warn-tint':   'color-mix(in srgb, var(--warn) 16%, transparent)',
  'crit-tint':   'color-mix(in srgb, var(--crit) 16%, transparent)',
  selection:     'color-mix(in srgb, var(--accent) 22%, transparent)',
};

const declare = (vars: Readonly<Record<string, string>>): string =>
  Object.entries(vars).map(([k, v]) => `--${k}: ${v};`).join(' ');

export function buildThemeCSS(): string {
  return [
    `:root { color-scheme: light; ${declare(LIGHT)} ${declare(DERIVED)} }`,
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
  ui:   UI_FONT,
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
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
