import React from 'react';
import { STREAK, WORDMARK_ASPECT, WORDMARK_PATH, WORDMARK_VIEWBOX } from './wordmark';

// The Tattlestone mark: the OBD-II port read as a touchstone, with one Signal
// streak. The streak sits at the height of the wordmark's joined tt crossbar
// (both come from brand/build_wordmark.py), so in the lockup the line reads
// straight across from the stone into the word.

const STONE = 'M12 12 H108 L92 88 H28 Z';
// The stone's drawn edges (stroke included) run 4..116 × 4..96 of its 120×100 box.
const DRAWN_BOX = '4 4 112 92';

interface MarkProps {
  /** Height of the drawn stone in px. */
  size: number;
  /** Light stone, for dark grounds. */
  reversed?: boolean;
}

export function BrandMark({ size, reversed }: MarkProps): React.ReactElement {
  const ink = reversed ? 'var(--brand-paper)' : 'var(--brand-ink)';
  return (
    <svg width={size * 112 / 92} height={size} viewBox={DRAWN_BOX} aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <path d={STONE} strokeWidth={16} strokeLinejoin="round" style={{ fill: ink, stroke: ink }} />
      <rect x={26} y={STREAK.y} width={58} height={STREAK.h} rx={STREAK.h / 2} style={{ fill: 'var(--brand-signal)' }} />
    </svg>
  );
}

export function Wordmark({ height, reversed }: { height: number; reversed?: boolean }): React.ReactElement {
  return (
    <svg width={height * WORDMARK_ASPECT} height={height} viewBox={WORDMARK_VIEWBOX} role="img" aria-label="Tattlestone" style={{ display: 'block', flexShrink: 0 }}>
      <path d={WORDMARK_PATH} style={{ fill: reversed ? 'var(--brand-paper)' : 'var(--brand-ink)' }} />
    </svg>
  );
}

/** Mark + wordmark. `height` is the cap height; the gap is 0.4 of it. */
export function Lockup({ height, reversed }: { height: number; reversed?: boolean }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: height * 0.4 }}>
      <BrandMark size={height} reversed={reversed} />
      <Wordmark height={height} reversed={reversed} />
    </div>
  );
}
