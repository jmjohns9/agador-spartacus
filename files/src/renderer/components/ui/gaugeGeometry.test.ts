import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polar, describeArc, gaugeFraction, sparkPath, GAUGE_START, GAUGE_END } from './gaugeGeometry';

test('polar measures degrees clockwise from 12 o’clock', () => {
  const top = polar(50, 50, 40, 0);
  assert.deepEqual([Math.round(top.x), Math.round(top.y)], [50, 10]);
  const right = polar(50, 50, 40, 90);
  assert.deepEqual([Math.round(right.x), Math.round(right.y)], [90, 50]);
});

test('full 240° track uses the large-arc flag and symmetric endpoints', () => {
  assert.equal(describeArc(50, 50, 40, GAUGE_START, GAUGE_END), 'M 15.36 70.00 A 40 40 0 1 1 84.64 70.00');
});

test('short arc uses small-arc flag', () => {
  assert.match(describeArc(50, 50, 40, -120, 0), / 0 0 1 /);
});

test('gaugeFraction clamps and never returns NaN', () => {
  assert.equal(gaugeFraction(50, 0, 100), 0.5);
  assert.equal(gaugeFraction(-10, 0, 100), 0);
  assert.equal(gaugeFraction(500, 0, 100), 1);
  assert.equal(gaugeFraction(Number.NaN, 0, 100), 0);
  assert.equal(gaugeFraction(5, 10, 10), 0);
});

test('sparkPath needs two finite points and never emits NaN', () => {
  assert.equal(sparkPath([1], 200, 36), null);
  assert.equal(sparkPath([Number.NaN, Number.NaN], 200, 36), null);
  const p = sparkPath([1, 2, Number.NaN, 3], 200, 36)!;
  assert.ok(p.line.startsWith('M 0.0 '));
  assert.ok(!p.line.includes('NaN') && !p.area.includes('NaN'));
  assert.ok(p.area.endsWith('Z'));
  const flat = sparkPath([5, 5, 5], 200, 36)!;
  assert.ok(!flat.line.includes('NaN'));
});
