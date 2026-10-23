import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mergeDecoded, engineLabel, decodeOffline, closeVinDecoder, VIN_RE } from './vinDecoder';

const blank = { year: '', make: '', model: '', engine: '', trim: '', transmission: '' };

test('engine label rounds vPIC displacement', () => {
  assert.equal(engineLabel('5.328510', '8', 'Gasoline'), '5.3L 8-cyl Gasoline');
  assert.equal(engineLabel(undefined, undefined, undefined), '');
});

test('online wins field by field, offline fills its blanks', () => {
  const offline = { ...blank, year: '2004', make: 'Chevrolet', model: 'Silverado', engine: '5.3L 8-cyl Gasoline' };
  const online  = { ...blank, year: '2004', make: 'CHEVROLET', model: 'Silverado', trim: 'LS', engine: '' };
  assert.deepEqual(mergeDecoded(offline, online), { ...offline, make: 'CHEVROLET', trim: 'LS' });
});

test('either source alone is enough; neither is null', () => {
  const only = { ...blank, make: 'Honda', model: 'Accord' };
  assert.deepEqual(mergeDecoded(only, null), only);
  assert.deepEqual(mergeDecoded(null, only), only);
  assert.equal(mergeDecoded(null, null), null);
  assert.equal(mergeDecoded(blank, blank), null);
});

test('VIN pattern excludes I, O and Q', () => {
  assert.ok(VIN_RE.test('1GCEK19T84E123456'));
  assert.ok(!VIN_RE.test('1GCEK19T84E12345O'));
});

// better-sqlite3 is built for Electron's ABI, so this runs under `npm run test:electron`
test('decodes offline from the bundled vPIC database', { skip: !process.versions.electron }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tattlestone-vin-'));
  try {
    const v = await decodeOffline('1GCEK19T84E123456', dir);
    assert.equal(v?.make, 'Chevrolet');
    assert.equal(v?.model, 'Silverado');
    assert.equal(v?.year, '2004');
    assert.match(v?.engine ?? '', /^5\.3L 8-cyl/);
    assert.deepEqual(readdirSync(join(dir, 'vpic')).filter(f => f.endsWith('.tmp')), []);
  } finally {
    await closeVinDecoder();
    rmSync(dir, { recursive: true, force: true });
  }
});
