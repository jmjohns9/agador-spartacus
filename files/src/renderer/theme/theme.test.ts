import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT, DARK, DERIVED, buildThemeCSS, statusFor, STATUS_TEXT } from './theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('light and dark palettes define the same tokens', () => {
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
});

test('every *-text status token reaches 4.5:1 on grouped and content', () => {
  for (const [name, p] of [['light', LIGHT], ['dark', DARK]] as const) {
    for (const key of ['accent-text', 'ok-text', 'warn-text', 'crit-text'] as const) {
      for (const bg of ['grouped', 'content'] as const) {
        const ratio = contrast(p[key], p[bg]);
        assert.ok(ratio >= 4.5, `${name} ${key} on ${bg} = ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('no legacy variable names remain', () => {
  const css = buildThemeCSS();
  for (const old of ['--bg:', '--bg2:', '--tw:', '--tm:', '--pp:', '--sg:', '--sa:', '--sr:', '--gb:', '--br:']) {
    assert.ok(!css.includes(old), old);
  }
});

test('theme CSS declares light defaults and a dark media override', () => {
  const css = buildThemeCSS();
  assert.match(css, /:root \{[^}]*--label: rgba\(0,0,0,0\.85\);/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{ :root \{[^}]*--label: rgba\(255,255,255,0\.85\);/);
});

test('statusFor maps thresholds, crit before warn, in-range is neutral', () => {
  const t = { warnHigh: 215, critHigh: 230 };
  assert.equal(statusFor(200, t), 'neutral');
  assert.equal(statusFor(220, t), 'warn');
  assert.equal(statusFor(240, t), 'crit');
  assert.equal(statusFor(Number.NaN, t), 'neutral');
  assert.equal(STATUS_TEXT.crit, 'var(--crit-text)');
});
