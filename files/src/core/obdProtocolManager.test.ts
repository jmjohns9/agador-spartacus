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

// A commander whose adapter answers from a fixed table; unknown commands time out.
function scriptedManager(replies: Record<string, string>): { mgr: OBDProtocolManager; writes: string[] } {
  const writes: string[] = [];
  const elm: ELM327Commander = new ELM327Commander((data) => {
    const cmd = data.trim();
    writes.push(cmd);
    if (cmd in replies) setTimeout(() => elm.onData(replies[cmd] + '\r\r>'), 1);
  });
  return { mgr: new OBDProtocolManager(elm), writes };
}

test('discovery merges every ECU and follows the next-range bit', async () => {
  const { mgr, writes } = scriptedManager({
    '0100': '4100BE3EB811\r410000000001',   // ECM, plus a TCM that only says "0120 exists"
    '0120': '4120A005B011',
    '0140': '4140FED09080',                 // last bit clear: nothing above 0x60
  });
  const pids = await mgr.discoverSupportedPIDs();
  assert.deepEqual(writes, ['0100', '0120', '0140']);
  assert.ok(pids.has('010C') && pids.has('0142'));
});

test('a failed discovery range does not stop its PIDs being polled', async (t) => {
  const { mgr, writes } = scriptedManager({
    '0120': '4120A005B011',
    '0140': '4140FED09080',
    '010C': '410C1AF8',
  });
  t.after(() => mgr.stopPolling());
  await mgr.discoverSupportedPIDs();   // 0100 times out
  const readings: string[] = [];
  mgr.on('pid-reading', r => readings.push(r.pid));
  writes.length = 0;
  mgr.startPolling();
  await sleep(3500);
  mgr.stopPolling();
  assert.ok(writes.includes('010C'), 'RPM was skipped because 0100 did not answer');
  assert.ok(readings.includes('010C'));
});

test('a DTC scan with no answer returns null instead of "no codes"', async () => {
  const { mgr } = scriptedManager({ '03': 'UNABLE TO CONNECT', '07': 'NO DATA', '0A': 'NO DATA' });
  assert.equal(await mgr.scanDTCs(), null);
});

test('a DTC scan decodes codes from each mode', async () => {
  const { mgr } = scriptedManager({ '03': '43030000000000\r43000000000000', '07': 'NO DATA', '0A': '7F0A11' });
  const dtcs = await mgr.scanDTCs();
  assert.deepEqual(dtcs?.map(d => `${d.code}:${d.status}`), ['P0300:active']);
});
