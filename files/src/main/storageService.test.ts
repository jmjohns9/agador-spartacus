import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StorageService } from './storageService';
import type { FreezeFrame, SessionSnapshot } from '../shared/types';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'storage-'));

// better-sqlite3 is built for Electron's ABI; under plain Node the SQLite
// cases skip. Run them with `npm run test:electron`.
let sqliteAvailable = true;
try { new (require('better-sqlite3'))(':memory:').close(); } catch { sqliteAvailable = false; }
const sqliteTest = (name: string, fn: () => void) =>
  test(name, { skip: sqliteAvailable ? false : 'better-sqlite3 not built for this runtime' }, fn);

const snap = (id: string): SessionSnapshot => ({ id, name: id, createdAt: 1 } as unknown as SessionSnapshot);
const ff = (id: string, dtcCode: string, capturedAt: number): FreezeFrame =>
  ({ id, dtcCode, capturedAt, vehicleName: 'Truck', liveData: {} });

test('local round-trip survives a new instance', () => {
  const dir = tmp();
  new StorageService(dir).saveSnapshot(snap('a'));
  assert.deepEqual(new StorageService(dir).getSnapshots().map(s => s.id), ['a']);
});

test('a corrupt storage.json is quarantined, never overwritten', () => {
  const dir = tmp();
  const file = path.join(dir, 'storage.json');
  fs.writeFileSync(file, '{"snapshots":[{"id":"precious"'); // torn write
  const warnings: string[] = [];
  const s = new StorageService(dir, w => warnings.push(w));
  assert.deepEqual(s.getSnapshots(), []);
  s.saveSnapshot(snap('new'));

  const quarantined = fs.readdirSync(dir).filter(f => f.startsWith('storage.json.corrupt-'));
  assert.equal(quarantined.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, quarantined[0]), 'utf-8'), '{"snapshots":[{"id":"precious"');
  assert.match(warnings.join(' '), /could not be read/i);
  assert.deepEqual(new StorageService(dir).getSnapshots().map(x => x.id), ['new']);
});

test('writes are atomic: no temp file left behind', () => {
  const dir = tmp();
  new StorageService(dir).saveSnapshot(snap('a'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['storage.json']);
});

test('the store is parsed once, not on every call', () => {
  const dir = tmp();
  const s = new StorageService(dir);
  s.saveSnapshot(snap('a'));
  // If any call re-read the file, it would now hit this and come back empty
  fs.writeFileSync(path.join(dir, 'storage.json'), 'not json');
  assert.deepEqual(s.getSnapshots().map(x => x.id), ['a']);
  assert.equal(s.getInfo().counts.snapshots, 1);
});

test('a freeze frame is kept from its first capture, not overwritten', () => {
  const s = new StorageService(tmp());
  const first = s.saveFreezeFrame(ff('f1', 'P0300', 100));
  const second = s.saveFreezeFrame(ff('f2', 'P0300', 200));
  assert.equal(first, 'f1');
  assert.equal(second, 'f1');
  assert.deepEqual(s.getFreezeFrames('P0300').map(f => f.capturedAt), [100]);
});

test('setConfig ignores unknown backends', () => {
  const s = new StorageService(tmp());
  s.setConfig({ backend: 'nonsense' as 'local' });
  assert.equal(s.getConfig().backend, 'local');
});

sqliteTest('migrating local → sqlite does not bring back deleted items', () => {
  const s = new StorageService(tmp());
  s.migrate('sqlite');
  s.saveSnapshot(snap('A'));
  s.migrate('local');
  s.deleteSnapshot('A');
  s.saveSnapshot(snap('B'));
  s.migrate('sqlite');
  assert.deepEqual(s.getSnapshots().map(x => x.id), ['B']);
});

sqliteTest('sqlite keeps the first freeze frame too', () => {
  const s = new StorageService(tmp());
  s.migrate('sqlite');
  assert.equal(s.saveFreezeFrame(ff('f1', 'P0300', 100)), 'f1');
  assert.equal(s.saveFreezeFrame(ff('f2', 'P0300', 200)), 'f1');
  assert.deepEqual(s.getFreezeFrames('P0300').map(f => f.capturedAt), [100]);
});
