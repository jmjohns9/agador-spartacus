import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responseMessages, parseDTCResponse, parseVIN, parsePIDData, parsePIDMessages } from './obdParsers';

// Fixtures are ELM327 replies as the commander sees them: ATH0 (no headers),
// ATS0 (no spaces) unless noted, lines separated by \r.

test('responseMessages splits frames and drops adapter status lines', () => {
  assert.deepEqual(
    responseMessages('SEARCHING...\r410C1AF8\r410C1B00\r\r>'),
    [[0x41, 0x0C, 0x1A, 0xF8], [0x41, 0x0C, 0x1B, 0x00]],
  );
  assert.deepEqual(responseMessages('BUS INIT: ...OK\r41 0C 1A F8 \r'), [[0x41, 0x0C, 0x1A, 0xF8]]);
});

test('responseMessages reassembles ISO-TP multi-line replies to their stated length', () => {
  assert.deepEqual(
    responseMessages('00A\r0:43040300 0101\r1:01710174000000\r'),
    [[0x43, 0x04, 0x03, 0x00, 0x01, 0x01, 0x01, 0x71, 0x01, 0x74]],
  );
});

test('DTC: J1850 single frame', () => {
  assert.deepEqual(parseDTCResponse('03', '43030000000000\r'), { ok: true, codes: ['P0300'] });
});

test('DTC: a second ECU with no codes does not add a phantom code', () => {
  assert.deepEqual(parseDTCResponse('03', '43030000000000\r43000000000000\r').codes, ['P0300']);
});

test('DTC: J1850 codes spread over two frames are all kept', () => {
  assert.deepEqual(
    parseDTCResponse('03', '43030001710174\r43044600000000\r').codes,
    ['P0300', 'P0171', 'P0174', 'P0446'],
  );
});

test('DTC: CAN count byte is skipped', () => {
  assert.deepEqual(parseDTCResponse('03', '43010133\r').codes, ['P0133']);
  assert.deepEqual(parseDTCResponse('03', '43 01 01 33 \r').codes, ['P0133']);
  assert.deepEqual(parseDTCResponse('03', '4300\r'), { ok: true, codes: [] });
});

test('DTC: CAN multi-frame reply', () => {
  assert.deepEqual(
    parseDTCResponse('03', '00A\r0:430403000101\r1:01710174000000\r').codes,
    ['P0300', 'P0101', 'P0171', 'P0174'],
  );
});

test('DTC: type prefixes and de-duplication across ECUs', () => {
  assert.deepEqual(parseDTCResponse('07', '47998241230000\r47C10099820000\r').codes, ['B1982', 'C0123', 'U0100']);
});

test('DTC: pending and permanent modes use their own response SID', () => {
  assert.deepEqual(parseDTCResponse('07', '47C1000000\r').codes, ['U0100']);
  assert.deepEqual(parseDTCResponse('0A', '4A0300\r').codes, ['P0300']);
});

test('DTC: NO DATA and negative responses mean no codes, not a failure', () => {
  assert.deepEqual(parseDTCResponse('03', 'NO DATA\r'), { ok: true, codes: [] });
  assert.deepEqual(parseDTCResponse('0A', 'SEARCHING...\rNO DATA\r'), { ok: true, codes: [] });
  assert.deepEqual(parseDTCResponse('0A', '7F0A11\r'), { ok: true, codes: [] });
});

test('DTC: timeouts and bus errors are failures, not "no codes"', () => {
  for (const raw of ['', 'UNABLE TO CONNECT\r', 'CAN ERROR\r', 'BUS ERROR\r', 'STOPPED\r', '?\r', 'BUS BUSY\r']) {
    assert.equal(parseDTCResponse('03', raw).ok, false, JSON.stringify(raw));
  }
});

const VIN = '1GCEK19T54E123456';

test('VIN: J1850 five-frame reply', () => {
  const raw = '49020100000031\r4902024743454B\r49020331395435\r49020434453132\r49020533343536\r';
  assert.equal(parseVIN(raw), VIN);
});

test('VIN: J1850 frames arriving out of order are sorted by sequence byte', () => {
  const raw = '49020331395435\r49020100000031\r49020533343536\r4902024743454B\r49020434453132\r';
  assert.equal(parseVIN(raw), VIN);
});

test('VIN: CAN ISO-TP reply', () => {
  assert.equal(parseVIN('014\r0:490201314743\r1:454B3139543534\r2:45313233343536\r'), VIN);
});

test('VIN: invalid or missing replies return null', () => {
  assert.equal(parseVIN('NO DATA\r'), null);
  assert.equal(parseVIN(''), null);
  // 17 characters, but contains I/O/Q, which a VIN never does
  assert.equal(parseVIN('014\r0:490201494F51\r1:454B3139543534\r2:45313233343536\r'), null);
});

test('PID: data after the response header', () => {
  assert.deepEqual(parsePIDData('010C', '410C1AF8\r'), [0x1A, 0xF8]);
  assert.deepEqual(parsePIDData('010C', 'SEARCHING...\r410C1AF8\r'), [0x1A, 0xF8]);
});

test('PID: data bytes equal to the header are kept', () => {
  assert.deepEqual(parsePIDData('010C', '410C410C\r'), [0x41, 0x0C]);
});

test('PID: header is matched at byte boundaries only', () => {
  assert.deepEqual(parsePIDData('0100', '4100BE34100F\r'), [0xBE, 0x34, 0x10, 0x0F]);
});

test('PID: first ECU wins; parsePIDMessages returns every ECU', () => {
  assert.deepEqual(parsePIDData('010C', '410C1AF8\r410C1B00\r'), [0x1A, 0xF8]);
  assert.deepEqual(parsePIDMessages('0100', '4100BE3EB811\r410080000000\r'), [[0xBE, 0x3E, 0xB8, 0x11], [0x80, 0, 0, 0]]);
});

test('PID: wrong PID or no data gives null', () => {
  assert.equal(parsePIDData('010C', '410D00\r'), null);
  assert.equal(parsePIDData('010C', 'NO DATA\r'), null);
  assert.equal(parsePIDData('010C', '410C\r'), null);
});
