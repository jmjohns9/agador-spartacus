import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseAppearance, loadAppearance, saveAppearance } from './appearance';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-'));

test('parseAppearance accepts only known values', () => {
  assert.equal(parseAppearance('dark'), 'dark');
  assert.equal(parseAppearance('light'), 'light');
  assert.equal(parseAppearance('system'), 'system');
  assert.equal(parseAppearance('DARK'), 'system');
  assert.equal(parseAppearance(42), 'system');
  assert.equal(parseAppearance(undefined), 'system');
});

test('save then load round-trips', () => {
  const dir = tmp();
  saveAppearance(dir, 'dark');
  assert.equal(loadAppearance(dir), 'dark');
});

test('missing or corrupt file falls back to system', () => {
  const dir = tmp();
  assert.equal(loadAppearance(dir), 'system');
  fs.writeFileSync(path.join(dir, 'appearance.json'), '{not json');
  assert.equal(loadAppearance(dir), 'system');
  fs.writeFileSync(path.join(dir, 'appearance.json'), JSON.stringify({ appearance: 'neon' }));
  assert.equal(loadAppearance(dir), 'system');
});
