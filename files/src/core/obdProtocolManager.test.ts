import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELM327Commander } from './elm327Commander';
import { ELM327Simulator } from './elm327Simulator';
import { OBDProtocolManager } from './obdProtocolManager';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// A commander wired to the offline simulator, counting every command written.
function simulatedManager(): { mgr: OBDProtocolManager; sent: () => number } {
  const sim = new ELM327Simulator();
  let count = 0;
  const elm: ELM327Commander = new ELM327Commander((data) => {
    count++;
    setTimeout(() => elm.onData(sim.respond(data.trim())), 1);
  });
  return { mgr: new OBDProtocolManager(elm), sent: () => count };
}

test('stopPolling during a DTC scan keeps polling stopped once the scan ends', async (t) => {
  const { mgr, sent } = simulatedManager();
  t.after(() => mgr.stopPolling());
  mgr.startPolling();
  await sleep(50);
  const scan = mgr.scanDTCs();
  mgr.stopPolling();             // e.g. the user disconnected mid-scan
  await scan;
  await sleep(50);
  const before = sent();
  await sleep(200);
  assert.equal(sent(), before, 'poll loop resumed after stopPolling()');
});

test('stopPolling during a VIN read keeps polling stopped once the read ends', async (t) => {
  const { mgr, sent } = simulatedManager();
  t.after(() => mgr.stopPolling());
  mgr.startPolling();
  await sleep(50);
  const vin = mgr.readVIN();
  mgr.stopPolling();
  await vin;
  await sleep(50);
  const before = sent();
  await sleep(200);
  assert.equal(sent(), before, 'poll loop resumed after stopPolling()');
});

test('a DTC scan still resumes polling that was running and not stopped', async (t) => {
  const { mgr, sent } = simulatedManager();
  t.after(() => mgr.stopPolling());
  mgr.startPolling();
  await sleep(50);
  await mgr.scanDTCs();
  const before = sent();
  await sleep(200);
  assert.ok(sent() > before, 'polling did not resume after the scan');
});
