import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELM327Commander } from './elm327Commander';
import { ELM327Simulator } from './elm327Simulator';
import { OBDProtocolManager } from './obdProtocolManager';
import { POLLING_FAST, POLLING_NORMAL, POLLING_SLOW } from './pidCatalog';

test('the simulator advertises every polled PID it answers', async () => {
  const sim = new ELM327Simulator();
  const elm: ELM327Commander = new ELM327Commander((data) => {
    setTimeout(() => elm.onData(sim.respond(data.trim())), 1);
  });
  const supported = await new OBDProtocolManager(elm).discoverSupportedPIDs();
  for (const pid of [...POLLING_FAST, ...POLLING_NORMAL, ...POLLING_SLOW]) {
    if (sim.respond(pid).includes('NO DATA')) continue;
    assert.ok(supported.has(pid), `${pid} is answered but not advertised`);
  }
  assert.ok(supported.has('01A4') && supported.has('0110') && supported.has('012F'));
});
