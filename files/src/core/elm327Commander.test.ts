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

test('close() during the probe ends it without reporting a silent adapter', async () => {
  // A bridge that hangs up before answering: the probe's ATZ is cut off by
  // close(), which is not the same as the adapter staying quiet.
  const writes: string[] = [];
  const logs: string[] = [];
  const elm = new ELM327Commander((data) => { writes.push(data); });
  elm.on('log', (e: { message: string }) => logs.push(e.message));
  const init = elm.initialize();
  await new Promise(r => setTimeout(r, 10));
  elm.close();
  await assert.rejects(init, /closed/i);
  assert.deepEqual(logs.filter((m) => m.includes('No response to')), []);
  assert.deepEqual(writes, ['ATZ\r'], 'ATI was sent after the link closed');
});

test('send() refuses vehicle-write services without touching the transport', async () => {
  // The app is read-only: clearing codes, resets, writes and flashing never go out.
  for (const cmd of ['04', '08 01', '11 01', '14 FF FF FF', '28 00', '2E F1 90', '2F 01', '31 01', '34', '36 01', '3B 01', '85 02']) {
    const { elm, writes } = simulated();
    const resp = await elm.send(cmd, 1000);
    assert.equal(resp.success, false, `${cmd} was not refused`);
    assert.match(resp.errorMessage ?? '', /read-only/i);
    assert.equal(writes.length, 0, `${cmd} reached the adapter`);
  }
});

test('send() still passes reads and adapter commands', async () => {
  for (const cmd of ['010C', '03', '07', '0A', '0902', '3C 01', 'ATSH 6C 10 F0', 'STI']) {
    const { elm, writes } = simulated();
    await elm.send(cmd, 200);
    assert.equal(writes.length, 1, `${cmd} was blocked`);
  }
});

test('a reply that arrives after its timeout is not credited to the next command', async () => {
  // Adapter answers 010C slowly (after the commander gave up) and 010D promptly.
  let elm: ELM327Commander;
  const written: string[] = [];
  elm = new ELM327Commander((data) => {
    const cmd = data.trim();
    written.push(cmd);
    if (cmd === '010C') setTimeout(() => elm.onData('410C1AF8\r\r>'), 120);
    if (cmd === '010D') setTimeout(() => elm.onData('410D32\r\r>'), 100);
  });
  const first = await elm.send('010C', 50);
  assert.equal(first.success, false);
  const second = await elm.send('010D', 1000);
  assert.equal(second.raw, '410D32');
  assert.deepEqual(written, ['010C', '010D']);
});

test('a late reply that never comes does not block the next command forever', async () => {
  const elm = new ELM327Commander((data) => {
    if (data.trim() === '010D') setTimeout(() => elm.onData('410D32\r\r>'), 5);
  });
  await elm.send('010C', 30);            // no answer at all
  const t0 = Date.now();
  const second = await elm.send('010D', 1000);
  assert.equal(second.raw, '410D32');
  assert.ok(Date.now() - t0 < 2500, 'waited too long for the stale prompt');
});

test('a reply later than the stale window is not credited to the next command', async () => {
  // 010C answers at 1760 ms — after the 1.5 s stale wait — unless interrupted
  // by the resync CR, which (like a real ELM327) yields STOPPED and a prompt.
  let elm: ELM327Commander;
  const late = new Set<ReturnType<typeof setTimeout>>();
  elm = new ELM327Commander((data) => {
    if (data === '\r') {
      for (const t of late) clearTimeout(t);
      setTimeout(() => elm.onData('STOPPED\r\r>'), 5);
    }
    if (data.trim() === '010C') late.add(setTimeout(() => elm.onData('410C1AF8\r\r>'), 1760));
    if (data.trim() === 'ATDP') setTimeout(() => elm.onData('SAE J1850 VPW\r\r>'), 150);
  });
  assert.equal((await elm.send('010C', 200)).success, false);
  const dp = await elm.send('ATDP', 1000);
  assert.equal(dp.raw, 'SAE J1850 VPW');
});

test('partial bytes of a timed-out reply do not leak into the next reply', async () => {
  let elm: ELM327Commander;
  elm = new ELM327Commander((data) => {
    if (data.trim() === '0100') setTimeout(() => elm.onData('SEARCHING...\r'), 100);
    if (data === '\r') setTimeout(() => elm.onData('STOPPED\r\r>'), 5);
    if (data.trim() === 'ATRV') setTimeout(() => elm.onData('12.6V\r\r>'), 5);
  });
  await elm.send('0100', 50);
  const rv = await elm.send('ATRV', 1000);
  assert.equal(rv.raw, '12.6V');
});

test('two prompts in one chunk are two replies', async () => {
  let elm: ELM327Commander;
  elm = new ELM327Commander((data) => {
    const cmd = data.trim();
    if (cmd === '0100') setTimeout(() => elm.onData('4100BE1FA813\r\r>4100BE1FA813\r\r>'), 2);
    if (cmd === 'ATRV') setTimeout(() => elm.onData('12.6V\r\r>'), 2);
  }, { staleReplyWaitMs: 50, resyncWaitMs: 20 });
  assert.equal((await elm.send('0100', 500)).raw, '4100BE1FA813');
  // The duplicate's prompt had no command waiting, so it is dropped rather
  // than left in the buffer to resolve ATRV with the wrong bytes.
  await new Promise(r => setTimeout(r, 10));
  assert.equal((await elm.send('ATRV', 500)).raw, '12.6V');
});

test('emits link-lost after consecutive timeouts on a ready session, once', async () => {
  const sim = new ELM327Simulator();
  let live = true;
  const elm: ELM327Commander = new ELM327Commander((data) => {
    if (live) setTimeout(() => elm.onData(sim.respond(data.trim())), 2);
  }, { staleReplyWaitMs: 20, resyncWaitMs: 10 });
  await elm.initialize();
  let lost = 0;
  elm.on('link-lost', () => lost++);
  live = false;   // adapter goes silent
  for (let i = 0; i < 5; i++) await elm.send('010C', 20);
  assert.equal(lost, 1);
});

test('a reply resets the timeout count', async () => {
  let answer = false;
  let elm: ELM327Commander;
  elm = new ELM327Commander((data) => {
    if (answer && data.trim() === '010C') setTimeout(() => elm.onData('410C1AF8\r\r>'), 2);
  }, { staleReplyWaitMs: 20, resyncWaitMs: 10 });
  (elm as any).isReady = true;   // dead-link detection only runs after init
  let lost = 0;
  elm.on('link-lost', () => lost++);
  for (let i = 0; i < 3; i++) await elm.send('010C', 20);
  answer = true;
  await elm.send('010C', 2000);
  answer = false;
  for (let i = 0; i < 3; i++) await elm.send('010C', 20);
  assert.equal(lost, 0);
});

test('response lines are split on the ELM327 carriage return', async () => {
  const elm = new ELM327Commander((data) => {
    if (data.trim() === 'ATDP') setTimeout(() => elm.onData('SEARCHING...\rSAE J1850 VPW\r\r>'), 1);
  });
  assert.deepEqual((await elm.send('ATDP', 500)).lines, ['SEARCHING...', 'SAE J1850 VPW']);
});
