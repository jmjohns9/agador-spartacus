import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlockResponse, formatBlock, j1850Crc } from './pcmDiagnostics';

test('j1850Crc matches the standard J1850 example frame', () => {
  assert.equal(j1850Crc([0x68, 0x6A, 0xF1, 0x01, 0x00]), 0x17);
});

test('the J1850 CRC byte is not part of the block value', () => {
  const bytes = parseBlockResponse(0x0A, '6C F0 10 7C 0A 00 C0 FF EE 66 \r');
  assert.deepEqual(bytes, [0x00, 0xC0, 0xFF, 0xEE]);
  assert.equal(formatBlock(bytes!, 'uint'), '12648430');
});

test('ASCII blocks do not pick up a printable CRC', () => {
  // 6C F0 10 7C 0A "1GCEK1" + CRC 0D
  const bytes = parseBlockResponse(0x0A, '6C F0 10 7C 0A 31 47 43 45 4B 31 0D\r');
  assert.equal(formatBlock(bytes!, 'ascii'), '1GCEK1');
});

test('a reply without a CRC byte keeps all its data', () => {
  assert.deepEqual(parseBlockResponse(0x0A, '6C F0 10 7C 0A 00 C0 FF EE\r'), [0x00, 0xC0, 0xFF, 0xEE]);
});

test('block data containing 7C is not mistaken for the marker', () => {
  const frame = [0x6C, 0xF0, 0x10, 0x7C, 0x0A, 0x7C, 0x0A, 0x01];
  const raw = frame.map(b => b.toString(16).padStart(2, '0')).join(' ') + ' ' + j1850Crc(frame).toString(16) + '\r';
  assert.deepEqual(parseBlockResponse(0x0A, raw), [0x7C, 0x0A, 0x01]);
});

test('an unanswered or other block gives null', () => {
  assert.equal(parseBlockResponse(0x0A, 'NO DATA\r'), null);
  assert.equal(parseBlockResponse(0x0A, '6C F0 10 7C 0B 01 02 03\r'), null);
  assert.equal(parseBlockResponse(0x0A, ''), null);
});

test('formatBlock', () => {
  assert.equal(formatBlock([0x31, 0x47, 0x00, 0x00], 'ascii'), '1G');
  assert.equal(formatBlock([1, 2, 3, 4, 5, 6, 7], 'uint'), '01 02 03 04 05 06 07');
  assert.equal(formatBlock([87], 'percent'), '87%');
  assert.equal(formatBlock([0xAB, 0x01], 'hex'), 'AB 01');
});
