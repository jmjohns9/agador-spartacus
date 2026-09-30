import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PID_CATALOG, PID_MAP, POLLING_FAST, POLLING_NORMAL, POLLING_SLOW } from './pidCatalog';

const decode = (pid: string, bytes: number[]) => PID_MAP.get(pid)!.decode(bytes);
const format = (pid: string, bytes: number[]) => PID_MAP.get(pid)!.format(decode(pid, bytes));

test('every PID is defined once', () => {
  const seen = PID_CATALOG.map(p => p.pid);
  assert.deepEqual(seen.filter((p, i) => seen.indexOf(p) !== i), []);
});

test('every polled PID has a definition', () => {
  for (const pid of [...POLLING_FAST, ...POLLING_NORMAL, ...POLLING_SLOW]) {
    assert.ok(PID_MAP.has(pid), pid);
  }
});

// SAE J1979 formulas, checked against worked values
const cases: Array<[string, number[], number]> = [
  ['010C', [0x1A, 0xF8], 1726],        // (256A+B)/4
  ['0104', [0xFF], 100],               // A·100/255
  ['0106', [0x80], 0],                 // (A−128)·100/128
  ['0106', [0x00], -100],
  ['010E', [0x80], 0],                 // A/2 − 64
  ['0110', [0x01, 0xF4], 5],           // (256A+B)/100
  ['0114', [0xC8], 1],                 // A/200
  ['0142', [0x31, 0x6A], 12.65],       // (256A+B)/1000
  ['0143', [0x00, 0x64], 39.2],        // (256A+B)·100/255
  ['0143', [0x01, 0x00], 100.4],
  ['0147', [0x80], 50.2],              // absolute throttle position B, A·100/255
];

for (const [pid, bytes, expected] of cases) {
  test(`${pid} decodes ${bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')} as ${expected}`, () => {
    assert.equal(decode(pid, bytes), expected);
  });
}

test('0121 is not in the catalog as a throttle sensor (it is distance with MIL on)', () => {
  assert.notEqual(PID_MAP.get('0121')?.unit, '%');
});

test('0103 fuel system status decodes system 1 from byte A', () => {
  assert.equal(format('0103', [0x02, 0x00]), 'Closed loop');
  assert.equal(format('0103', [0x01, 0x00]), 'Open loop — engine cold');
  assert.equal(format('0103', [0x04, 0x00]), 'Open loop — driving conditions');
  assert.equal(format('0103', [0x08, 0x00]), 'Open loop — system fault');
  assert.equal(format('0103', [0x10, 0x00]), 'Closed loop — O2 sensor fault');
});

test('012A is not in the catalog as fuel system status (it is O2 sensor 7)', () => {
  assert.ok(!PID_MAP.get('012A')?.name.includes('Fuel System'));
});

test('01A4 decodes the gear from the upper nibble of byte B', () => {
  assert.equal(decode('01A4', [0x02, 0x40, 0x0D, 0xAC]), 4);
  assert.equal(format('01A4', [0x02, 0x40, 0x0D, 0xAC]), '4th');
  assert.equal(format('01A4', [0x02, 0x10, 0x0D, 0xAC]), '1st');
  assert.equal(format('01A4', [0x02, 0x00, 0x00, 0x00]), 'Neutral');
});

test('Bank 1 is the cylinder-1 side, never called the right side', () => {
  for (const pid of ['0106', '0107']) assert.doesNotMatch(PID_MAP.get(pid)!.name, /right/i);
  for (const pid of ['0108', '0109']) assert.doesNotMatch(PID_MAP.get(pid)!.name, /left/i);
  assert.doesNotMatch(PID_MAP.get('0118')!.description, /driver/i);
});
