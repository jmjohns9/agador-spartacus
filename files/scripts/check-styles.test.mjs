import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource } from './check-styles.mjs';

test('flags raw colours, fonts, spacing, case and borders', () => {
  const src = [
    "const a = { color: '#9B8AFF' };",
    "const b = { background: 'rgba(0,0,0,0.1)' };",
    "const c = { fontFamily: FONTS.mono };",
    "const d = { letterSpacing: 1.2 };",
    "const e = { textTransform: 'uppercase' };",
    "const f = { borderBottom: '1px solid var(--br)' };",
  ].join('\n');
  const rules = checkSource(src).map(v => v.rule);
  assert.deepEqual(rules, ['hex colour', 'rgba()/rgb() literal', 'fontFamily', 'FONTS.* reference', 'letterSpacing', 'textTransform', 'border style key']);
});

test('ignores token usage, borderRadius, and style-ok lines', () => {
  const src = [
    "const a = { color: 'var(--label)', borderRadius: 6 };",
    "const b = { stroke: '#123456' }; // style-ok: chart series",
    "const c = { ...NUMERIC };",
  ].join('\n');
  assert.deepEqual(checkSource(src), []);
});

test('reports 1-based line numbers', () => {
  assert.equal(checkSource("ok\nconst x = { letterSpacing: 2 };")[0].line, 2);
});
