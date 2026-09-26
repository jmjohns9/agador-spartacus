// Pure helpers shared by UI components. No React, no DOM — unit tested.

import type { Status } from '../../theme/theme';

/** Map a legacy valueColor/barColor prop onto the new status model.
 *  Only amber and red carry meaning; everything else renders neutral. */
export function statusFromLegacyColor(color?: string): Status {
  if (color === 'var(--sr)') return 'crit';
  if (color === 'var(--sa)') return 'warn';
  return 'neutral';
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** True for values that mean "no reading": placeholders, blanks, NaN/Infinity. */
export function isMissing(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'number') return !Number.isFinite(v);
  if (typeof v === 'string') return ['', '—', '-', '–'].includes(v.trim());
  return false;
}

/** Roving-focus index for arrow-key navigation in a group of `len` items. */
export function nextIndex(i: number, key: string, len: number): number | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (i + 1) % len;
    case 'ArrowLeft':  case 'ArrowUp':   return (i - 1 + len) % len;
    case 'Home': return 0;
    case 'End':  return len - 1;
    default: return null;
  }
}
