import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useAppStore, selectVoltageTrend } from './appStore';

const MIN = 60_000;
const atrv = (t: number, value: number) => ({ pid: 'ATRV', value, raw: [], timestamp: t, unit: 'V' });

test('a repeated value keeps the time it first appeared in history', () => {
  const s = useAppStore.getState();
  s.updatePIDReading(atrv(1000, 12.6));
  s.updatePIDReading(atrv(9000, 12.6));
  const h = useAppStore.getState().history['ATRV'];
  assert.equal(h[h.length - 1].timestamp, 1000);
  assert.equal(useAppStore.getState().liveData['ATRV'].timestamp, 9000, 'live value should know it was just seen');
});

test('selectVoltageTrend does not call an engine shutdown a draw', () => {
  useAppStore.setState({ history: {}, liveData: {} });
  const s = useAppStore.getState();
  s.updatePIDReading(atrv(0, 14.2));
  s.updatePIDReading(atrv(1 * MIN, 12.9));
  s.updatePIDReading(atrv(3 * MIN, 12.75));
  s.updatePIDReading(atrv(5 * MIN, 12.7));
  s.updatePIDReading(atrv(6 * MIN, 12.69));
  s.updatePIDReading(atrv(7 * MIN, 12.7));
  s.updatePIDReading(atrv(8 * MIN, 12.69));
  s.updatePIDReading(atrv(9 * MIN, 12.7));
  s.updatePIDReading(atrv(10 * MIN, 12.69));
  s.updatePIDReading(atrv(11 * MIN, 12.7));
  assert.equal(selectVoltageTrend(useAppStore.getState()), 'stable');
});
