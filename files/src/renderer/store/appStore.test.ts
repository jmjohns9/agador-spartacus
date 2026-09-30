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

test('a repeated "connected" does not restart the session timer', () => {
  const s = useAppStore.getState();
  s.setConnectionStatus('disconnected');
  s.setConnectionStatus('connected', 'SAE J1850 VPW', 'OBDLink MX+');
  const started = useAppStore.getState().sessionStartMs;
  assert.ok(started);
  useAppStore.setState({ sessionStartMs: started! - 5000 });   // time passes
  s.setConnectionStatus('connected', 'SAE J1850 VPW', 'OBDLink MX+');
  assert.equal(useAppStore.getState().sessionStartMs, started! - 5000);
});

test('starting a new connection clears the previous vehicle\'s live data, history and codes', () => {
  const s = useAppStore.getState();
  s.setConnectionStatus('connected');
  s.updatePIDReading(atrv(1000, 12.6));
  s.setDTCs([{ code: 'P0300' } as never]);
  s.setConnectionStatus('disconnected');
  assert.ok(useAppStore.getState().liveData['ATRV'], 'values stay visible after a disconnect');
  s.setConnectionStatus('connecting');
  const st = useAppStore.getState();
  assert.deepEqual(st.liveData, {});
  assert.deepEqual(st.history, {});
  assert.deepEqual(st.dtcs, []);
});

test('a rescan keeps when each code was first seen', () => {
  const s = useAppStore.getState();
  s.setDTCs([]);
  s.setDTCs([{ code: 'P0300', status: 'active', firstSeen: 100, lastSeen: 100 } as never]);
  s.setDTCs([{ code: 'P0300', status: 'active', firstSeen: 900, lastSeen: 900 } as never]);
  const d = useAppStore.getState().dtcs[0];
  assert.equal(d.firstSeen, 100);
  assert.equal(d.lastSeen, 900);
});
