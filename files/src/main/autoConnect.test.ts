import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { connectWithRetry, readRememberedBridge, rememberBridge, AttemptResult } from './autoConnect';

const noSleep = async (): Promise<void> => {};

function attempts(results: AttemptResult[]): { attempt: () => Promise<AttemptResult>; count: () => number } {
  let n = 0;
  return { attempt: async () => results[Math.min(n++, results.length - 1)], count: () => n };
}

test('retries a bridge that is not up yet, then connects', async () => {
  const a = attempts(['retryable', 'retryable', 'connected']);
  const waits: number[] = [];
  const result = await connectWithRetry(a.attempt, {
    cancelled: () => false, delaysMs: [3000, 10_000], sleep: noSleep, onRetry: (ms) => waits.push(ms),
  });
  assert.equal(result, 'connected');
  assert.equal(a.count(), 3);
  assert.deepEqual(waits, [3000, 10_000]);
});

test('gives up after the last delay', async () => {
  const a = attempts(['retryable']);
  assert.equal(await connectWithRetry(a.attempt, { cancelled: () => false, delaysMs: [1, 1], sleep: noSleep }), 'retryable');
  assert.equal(a.count(), 3);
});

test('does not retry a failure the bridge already retried', async () => {
  const a = attempts(['failed']);
  assert.equal(await connectWithRetry(a.attempt, { cancelled: () => false, sleep: noSleep }), 'failed');
  assert.equal(a.count(), 1);
});

test('a manual connect or disconnect during the wait cancels the retry', async () => {
  let cancelled = false;
  const a = attempts(['retryable', 'connected']);
  const result = await connectWithRetry(a.attempt, {
    cancelled: () => cancelled, sleep: async () => { cancelled = true; },
  });
  assert.equal(result, 'cancelled');
  assert.equal(a.count(), 1, 'no attempt after the user took over');
});

test('the last bridge is remembered, and forgotten on Disconnect', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tattlestone-')), 'connection.json');
  assert.equal(readRememberedBridge(file), null);
  rememberBridge(file, 'tcp://192.168.1.33:35000');
  assert.equal(readRememberedBridge(file), 'tcp://192.168.1.33:35000');
  rememberBridge(file, null);
  assert.equal(readRememberedBridge(file), null);
});

test('only tcp:// targets are remembered, and a corrupt file reads as nothing', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tattlestone-')), 'connection.json');
  rememberBridge(file, '/dev/cu.OBDLinkMX13659');
  assert.equal(readRememberedBridge(file), null);
  fs.writeFileSync(file, '{"lastBridge": "tcp://user@host:1/x"}');
  assert.equal(readRememberedBridge(file), null);
  fs.writeFileSync(file, 'not json');
  assert.equal(readRememberedBridge(file), null);
});
