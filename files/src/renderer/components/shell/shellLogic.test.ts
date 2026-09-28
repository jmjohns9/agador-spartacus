import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSessionTime, batteryStatus, connectionTone, connectionLabel, computeRate,
  shortcutFor, readSidebarPref, writeSidebarPref,
} from './shellLogic';
import { NAV_GROUPS, ALL_SCREEN_IDS } from './navItems';

test('formatSessionTime pads h:m:s', () => {
  assert.equal(formatSessionTime(0), '00:00:00');
  assert.equal(formatSessionTime(3_723_000), '01:02:03');
  assert.equal(formatSessionTime(-5), '00:00:00');
});

test('batteryStatus bands', () => {
  assert.equal(batteryStatus(0), 'none');
  assert.equal(batteryStatus(Number.NaN), 'none');
  assert.equal(batteryStatus(13.8), 'neutral');
  assert.equal(batteryStatus(12.5), 'neutral');
  assert.equal(batteryStatus(12.2), 'warn');
  assert.equal(batteryStatus(11.6), 'crit');
});

test('connection tone and label', () => {
  assert.equal(connectionTone('connected'), 'ok');
  assert.equal(connectionTone('error'), 'crit');
  assert.equal(connectionTone('connecting'), 'warn');
  assert.equal(connectionTone('disconnected'), 'neutral');
  assert.equal(connectionLabel('connected', 'OBDLink MX+ v5.2'), 'OBDLink MX+ v5.2');
  assert.equal(connectionLabel('connected', ''), 'Connected');
  assert.equal(connectionLabel('initializing'), 'Initializing…');
});

test('computeRate counts fresh PIDs and readings/sec', () => {
  const now = 10_000;
  const data = { a: { timestamp: 9_500 }, b: { timestamp: 7_500 }, c: { timestamp: 2_000 } };
  assert.deepEqual(computeRate(data, now), { livePIDs: 2, perSec: '0.5' });
});

test('shortcuts need the exact modifiers', () => {
  const k = (key: string, m: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
    ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...m });
  assert.equal(shortcutFor(k('s', { metaKey: true, ctrlKey: true })), 'toggle-sidebar');
  assert.equal(shortcutFor(k('S', { metaKey: true, ctrlKey: true })), 'toggle-sidebar');
  assert.equal(shortcutFor(k(',', { metaKey: true })), 'settings');
  assert.equal(shortcutFor(k('s')), null);
  assert.equal(shortcutFor(k(',')), null);
  assert.equal(shortcutFor(k('s', { metaKey: true })), null);
  assert.equal(shortcutFor(k(',', { metaKey: true, shiftKey: true })), null);
});

test('sidebar pref defaults open and survives throwing storage', () => {
  assert.equal(readSidebarPref(undefined), true);
  assert.equal(readSidebarPref({ getItem: () => null }), true);
  assert.equal(readSidebarPref({ getItem: () => '0' }), false);
  assert.equal(readSidebarPref({ getItem: () => { throw new Error('blocked'); } }), true);
  assert.doesNotThrow(() => writeSidebarPref({ setItem: () => { throw new Error('blocked'); } }, false));
});

test('navigation lists all 19 screens exactly once, settings last', () => {
  assert.equal(ALL_SCREEN_IDS.length, 19);
  assert.equal(new Set(ALL_SCREEN_IDS).size, 19);
  assert.equal(ALL_SCREEN_IDS[ALL_SCREEN_IDS.length - 1], 'settings');
  assert.deepEqual(NAV_GROUPS.map(g => g.title), [undefined, 'Overview', 'Subsystems', 'Diagnostic', 'Advanced', 'Records']);
});
