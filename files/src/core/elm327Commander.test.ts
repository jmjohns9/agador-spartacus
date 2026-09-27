import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELM327Commander } from './elm327Commander';
import { ELM327Simulator } from './elm327Simulator';

// Commander wired to the offline simulator with serial-like latency.
function simulated(): { elm: ELM327Commander; writes: string[] } {
  const sim = new ELM327Simulator();
  const writes: string[] = [];
  const elm: ELM327Commander = new ELM327Commander((data) => {
    writes.push(data);
    setTimeout(() => elm.onData(sim.respond(data.trim())), 5);
  });
  return { elm, writes };
}

test('close() during initialize rejects promptly instead of reporting a connection', async () => {
  const { elm, writes } = simulated();
  const init = elm.initialize();
  await new Promise(r => setTimeout(r, 30)); // probe answered, init under way
  const t0 = Date.now();
  elm.close();
  const writesAtClose = writes.length;
  await assert.rejects(init, /closed/i);
  assert.ok(Date.now() - t0 < 500, `initialize took ${Date.now() - t0}ms to give up after close()`);
  assert.equal(writes.length, writesAtClose, 'commander kept writing to the transport after close()');
  assert.equal(elm.ready, false);
});

test('send() after close() resolves as failed without touching the transport', async () => {
  const { elm, writes } = simulated();
  elm.close();
  const resp = await elm.send('010C', 1000);
  assert.equal(resp.success, false);
  assert.equal(resp.errorMessage, 'Closed');
  assert.equal(writes.length, 0);
});

test('close() resolves a command that is waiting for its reply', async () => {
  const elm = new ELM327Commander(() => { /* adapter never answers */ });
  const pending = elm.send('010C', 60_000);
  elm.close();
  const resp = await pending;
  assert.equal(resp.success, false);
  assert.equal(resp.errorMessage, 'Closed');
});
