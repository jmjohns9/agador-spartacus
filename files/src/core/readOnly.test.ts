import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELM327Commander } from './elm327Commander';
import { ELM327Simulator } from './elm327Simulator';
import { OBDProtocolManager } from './obdProtocolManager';
import { PcmDiagnostics } from './pcmDiagnostics';

// The app must never change a control module. Drive a full session against the
// simulator and check every command that reaches the adapter.
const ALLOWED = /^(AT|ST)|^(01|03|07|09|0A|3C)/;

test('a whole session only sends adapter commands and reads', async () => {
  const sim = new ELM327Simulator();
  const sent: string[] = [];
  const elm: ELM327Commander = new ELM327Commander((data) => {
    const cmd = data.trim().toUpperCase();
    sent.push(cmd);
    setTimeout(() => elm.onData(sim.respond(cmd)), 1);
  });
  const mgr = new OBDProtocolManager(elm);

  await elm.initialize();
  await mgr.discoverSupportedPIDs();
  mgr.startPolling();
  await new Promise(r => setTimeout(r, 200));
  await mgr.scanDTCs();
  await mgr.readVIN();
  mgr.stopPolling();
  await new PcmDiagnostics(elm).readIdentity();
  elm.close();

  const bad = [...new Set(sent.filter(c => !ALLOWED.test(c.replace(/\s+/g, ''))))];
  assert.deepEqual(bad, [], `non-read commands sent: ${bad.join(', ')}`);
  assert.ok(sent.includes('03') && sent.includes('0902') && sent.some(c => c.startsWith('3C')));
});
