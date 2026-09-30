import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  voltageSeries, dropMvPerMin, voltageTrend, dischargeStatus, windowMinutes,
  trimStatus, mapVerdict, readinessMonitors, isReading,
} from './verdicts';
import type { PIDReading } from '../../shared/types';

const MIN = 60_000;
const r = (tMin: number, v: number): PIDReading => ({ pid: 'ATRV', value: v, raw: [], timestamp: tMin * MIN, unit: 'V' });

test('voltageSeries adds the current reading as the latest point', () => {
  const pts = voltageSeries([r(0, 12.6), r(5, 12.58)], r(9, 12.58));
  assert.deepEqual(pts.map(p => p.t / MIN), [0, 5, 9]);
});

test('a steady 4 mV/min drain over 20 minutes is measured as ~4 mV/min', () => {
  const hist = Array.from({ length: 21 }, (_, i) => r(i, +(12.7 - i * 0.004).toFixed(3)));
  const rate = dropMvPerMin(voltageSeries(hist))!;
  assert.ok(Math.abs(rate - 4) < 0.1, String(rate));
  assert.equal(dischargeStatus(rate), 'warn');
  assert.equal(voltageTrend(voltageSeries(hist)), 'dropping');
});

test('fewer than 10 minutes of data gives no rate, and the trend is stable', () => {
  const pts = voltageSeries([r(0, 12.7), r(3, 12.5)]);
  assert.equal(dropMvPerMin(pts), null);
  assert.equal(voltageTrend(pts), 'stable');
});

test('engine shutdown settling is not a parasitic draw', () => {
  // Charging at 14.2 V, engine off at t=30, surface charge settles to 12.7
  const hist = [r(0, 14.2), r(29, 14.1), r(30, 13.0), r(31, 12.85), r(33, 12.75), r(36, 12.7)];
  assert.equal(voltageTrend(voltageSeries(hist, r(40, 12.7))), 'stable');
});

test('a single 0.1 V step from a coarse ATRV is not a critical drop', () => {
  const pts = voltageSeries([r(0, 12.6), r(15, 12.5)], r(30, 12.5));
  assert.notEqual(voltageTrend(pts), 'critical');
});

test('a fast drain is critical', () => {
  const hist = Array.from({ length: 16 }, (_, i) => r(i, +(12.7 - i * 0.01).toFixed(2)));
  assert.equal(voltageTrend(voltageSeries(hist)), 'critical');
});

test('dischargeStatus thresholds are in mV/min', () => {
  assert.equal(dischargeStatus(null), 'neutral');
  assert.equal(dischargeStatus(0.5), 'neutral');
  assert.equal(dischargeStatus(4), 'warn');
  assert.equal(dischargeStatus(50), 'crit');
});

test('windowMinutes uses timestamps, not sample counts', () => {
  assert.equal(windowMinutes(voltageSeries([r(0, 12.6), r(45, 12.5)])), 45);
  assert.equal(windowMinutes([]), 0);
});

test('trimStatus has a neutral band', () => {
  assert.equal(trimStatus(0), 'neutral');
  assert.equal(trimStatus(-4.9), 'neutral');
  assert.equal(trimStatus(7.8), 'warn');
  assert.equal(trimStatus(-12), 'crit');
});

test('mapVerdict works in psi', () => {
  assert.match(mapVerdict(4.4), /good vacuum/i);
  assert.match(mapVerdict(14.2), /load/i);
  assert.equal(mapVerdict(NaN), '—');
});

test('isReading treats 0 and negatives as real readings', () => {
  assert.equal(isReading(0), true);
  assert.equal(isReading(-5), true);
  assert.equal(isReading('—'), false);
  assert.equal(isReading(undefined), false);
});

test('readiness decodes PID 0101 for a spark-ignition engine', () => {
  // MIL on, 2 codes; misfire/fuel/components complete; cat, EVAP, O2, O2 heater, EGR
  // available; EVAP incomplete
  const m = readinessMonitors([0x82, 0x07, 0xE5, 0x04])!;
  const byName = Object.fromEntries(m.monitors.map(x => [x.name, x.status]));
  assert.equal(m.milOn, true);
  assert.equal(m.dtcCount, 2);
  assert.equal(byName['Misfire'], 'ready');
  assert.equal(byName['Catalyst'], 'ready');
  assert.equal(byName['Evaporative system'], 'incomplete');
  assert.equal(byName['Secondary air'], undefined, 'unsupported monitors are not listed');
  assert.equal(m.monitors.length, 8);
});

test('readiness uses the compression-ignition table when B bit 3 is set', () => {
  const m = readinessMonitors([0x00, 0x0F, 0x01, 0x00])!;
  assert.deepEqual(m.monitors.map(x => x.name).slice(3), ['NMHC catalyst']);
});

test('readiness with too few bytes is null', () => {
  assert.equal(readinessMonitors([0x82]), null);
});
