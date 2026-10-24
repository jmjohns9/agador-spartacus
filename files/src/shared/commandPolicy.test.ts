import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { refusalReason } from './commandPolicy';

const allowed = (c: string) => assert.equal(refusalReason(c), null, `${JSON.stringify(c)} should be allowed`);
const refused = (c: string) => assert.notEqual(refusalReason(c), null, `${JSON.stringify(c)} should be refused`);

test('every command the app sends is allowed', () => {
  for (const c of ['ATZ', 'ATI', 'ATE0', 'ATL0', 'ATH0', 'ATH1', 'ATS0', 'ATSP0', 'ATSP2', 'ATAT1', 'ATDP', 'ATDPN',
    'ATRV', 'ATAL', 'ATD', 'ATSR F0', 'ATSH 6C 10 F0', 'STI', 'STDI', '010C', '0100', '03', '07', '0A',
    '0900', '0902', '0904', '0906', '090A', '3C 01', '3C A0', '']) allowed(c);
});

test('reads in any spacing or case are allowed', () => {
  allowed('01 0c');
  allowed('22 F1 90');
  allowed('19 02 FF');
  allowed('atsp a2');
});

test('services that clear, write, reset, actuate, unlock or reprogram are refused', () => {
  for (const c of ['04', '0 4', '04\t', '0400', '08', '11 01', '14FF00', '14 FF FF FF', '10 02', '10 03', '27 01',
    '28 00', '2E F1 90 00', '2F 01', '30 01', '31 01 FF 00', '34 00', '36 01', '37', '3B 01', '3D 00', '85 02',
    'A2', 'A5', 'AE', '23 00 10 00']) refused(c);
});

test('a line break inside a command is refused, so nothing rides along after it', () => {
  refused('010C\r04');
  refused('010C\n04');
  refused('ATI\r');
});

test('ST passthrough and unknown ST commands are refused; identification is allowed', () => {
  refused('STPX H:7E0,D:14FFFFFF');
  refused('STPX H:7E0, D:04');
  refused('STSBR 2000000');
  for (const c of ['STI', 'STIX', 'STDI', 'STDIX', 'STSN', 'STMFR']) allowed(c);
});

test('AT commands that defeat the check or send arbitrary bytes are refused', () => {
  refused('ATCAF0');
  refused('AT CAF 0');
  refused('ATPP 2D SV 00');
  refused('ATWM 81 10 F1 04');
  refused('ATFC SD 30 00 00');
  allowed('ATCAF1');
});

test('over-long, non-printable and malformed lines are refused', () => {
  refused('ATSH' + '0'.repeat(61));
  refused('01\x000C');
  refused('010C1');
  refused('HELLO');
});

test('the bridge ships an identical copy of the policy', () => {
  const read = (p: string) => JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
  assert.deepEqual(read('../../firmware/uno-q-bridge/command_policy.json'), read('command-policy.json'));
});
