import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusFromLegacyColor, clampPercent, isMissing, nextIndex } from './logic';

test('legacy colours map to status; greens and neutrals become neutral', () => {
  assert.equal(statusFromLegacyColor('var(--sr)'), 'crit');
  assert.equal(statusFromLegacyColor('var(--sa)'), 'warn');
  for (const c of ['var(--sg)', 'var(--gb)', 'var(--pp)', 'var(--tw)', 'var(--tm)', '#9B8AFF', undefined]) {
    assert.equal(statusFromLegacyColor(c), 'neutral');
  }
});

test('clampPercent bounds and rejects NaN', () => {
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(42.5), 42.5);
  assert.equal(clampPercent(Number.NaN), 0);
});

test('isMissing covers placeholders and non-finite numbers', () => {
  for (const v of ['—', '', ' ', '-', Number.NaN, Infinity, undefined, null]) assert.equal(isMissing(v), true, String(v));
  for (const v of [0, '0', 12.8, 'P0300']) assert.equal(isMissing(v), false, String(v));
});

test('nextIndex wraps on arrow keys and ignores others', () => {
  assert.equal(nextIndex(0, 'ArrowRight', 3), 1);
  assert.equal(nextIndex(2, 'ArrowRight', 3), 0);
  assert.equal(nextIndex(0, 'ArrowLeft', 3), 2);
  assert.equal(nextIndex(1, 'ArrowDown', 3), 2);
  assert.equal(nextIndex(1, 'Home', 3), 0);
  assert.equal(nextIndex(1, 'End', 3), 2);
  assert.equal(nextIndex(1, 'a', 3), null);
});
