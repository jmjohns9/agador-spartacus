import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as net from 'net';
import * as path from 'path';
import { spawn } from 'child_process';
import { TcpPort, parseTcpTarget, isTcpTarget, DEFAULT_TCP_PORT } from './tcpPort';

test('only tcp:// paths are network targets', () => {
  assert.equal(isTcpTarget('tcp://192.168.4.1:35000'), true);
  assert.equal(isTcpTarget('/dev/cu.OBDLinkMX13659'), false);
  assert.equal(isTcpTarget('SIMULATOR'), false);
});

test('host and port are parsed; the port defaults to 35000', () => {
  assert.deepEqual(parseTcpTarget('tcp://192.168.4.1:35000'), { host: '192.168.4.1', port: 35000 });
  assert.deepEqual(parseTcpTarget('tcp://obd-bridge.local:23'), { host: 'obd-bridge.local', port: 23 });
  assert.deepEqual(parseTcpTarget('tcp://192.168.4.1'), { host: '192.168.4.1', port: DEFAULT_TCP_PORT });
  assert.deepEqual(parseTcpTarget('tcp://  10.0.0.5:35000  '), { host: '10.0.0.5', port: 35000 });
});

test('unusable addresses are refused', () => {
  for (const bad of ['tcp://', 'tcp://:35000', 'tcp://host:0', 'tcp://host:65536', 'tcp://host:abc',
                     'tcp://host:35000/path', 'tcp://user@host:35000', 'tcp://a b:35000', '/dev/cu.OBD']) {
    assert.equal(parseTcpTarget(bad), null, bad);
  }
});

// A stand-in bridge: answers each CR-terminated command like an ELM327
async function fakeBridge(): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('data', (d) => { if (d.toString().includes('ATI')) s.write('ELM327 v1.5\r\r>'); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}

test('opens, round-trips a command and closes like a SerialPort', async () => {
  const bridge = await fakeBridge();
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`);
  await new Promise<void>((res, rej) => port.open((e) => e ? rej(e) : res()));
  assert.equal(port.isOpen, true);

  const reply = new Promise<string>((r) => port.on('data', (b: Buffer) => r(b.toString('ascii'))));
  port.write('ATI\r');
  assert.match(await reply, /ELM327 v1\.5/);

  await new Promise<void>((r) => port.close(r));
  assert.equal(port.isOpen, false);
  await bridge.close();
});

test('a refused connection fails open() and emits no close', async () => {
  const bridge = await fakeBridge();
  const deadPort = bridge.port;
  await bridge.close();

  const port = new TcpPort(`tcp://127.0.0.1:${deadPort}`);
  let closed = false;
  port.on('close', () => { closed = true; });
  const err = await new Promise<Error | null>((r) => port.open(r));
  assert.ok(err);
  assert.equal(closed, false);
});

test('the bridge dropping the link emits close', async () => {
  const bridge = await fakeBridge();
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`);
  await new Promise<void>((res, rej) => port.open((e) => e ? rej(e) : res()));
  const closed = new Promise<void>((r) => port.once('close', () => r()));
  await bridge.close();
  await closed;
});

test('an invalid address throws before any socket is made', () => {
  assert.throws(() => new TcpPort('tcp://'), /expected tcp:\/\/host:port/);
});

test('a refused connect names the address and keeps the errno', async () => {
  const bridge = await fakeBridge();
  const deadPort = bridge.port;
  await bridge.close();

  const err = await new Promise<Error | null>((r) => new TcpPort(`tcp://127.0.0.1:${deadPort}`).open(r));
  assert.equal((err as NodeJS.ErrnoException).code, 'ECONNREFUSED');
  assert.ok(err!.message.includes(`127.0.0.1:${deadPort}`), err!.message);
  assert.doesNotMatch(err!.message, /^connect ECONNREFUSED/, 'raw errno text is not a user message');
});

// The firmware's ELM327 emulator, the same program the UNO Q runs with no
// adapter attached. Skipped where python3 is missing.
const EMULATOR = path.join(__dirname, '../../firmware/uno-q-bridge/elm327_emulator.py');

async function freePort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const { port } = s.address() as net.AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

test('round-trips ELM327 traffic with the firmware emulator, across split reads', async (t) => {
  const tcp = await freePort();
  const emu = spawn('python3', ['-u', EMULATOR, '--host', '127.0.0.1', '--port', String(tcp)]);
  const up = await new Promise<boolean>((r) => {
    emu.once('error', () => r(false));
    emu.stdout.on('data', (d: Buffer) => { if (d.toString().includes('listening')) r(true); });
  });
  if (!up) { t.skip('python3 not available'); return; }
  t.after(() => { emu.kill(); });

  const port = new TcpPort(`tcp://127.0.0.1:${tcp}`);
  await new Promise<void>((res, rej) => port.open((e) => e ? rej(e) : res()));
  let rx = '';
  port.on('data', (b: Buffer) => { rx += b.toString('ascii'); });
  const prompt = (n: number) => new Promise<void>((r) => {
    const check = () => { if ((rx.match(/>/g) ?? []).length >= n) { port.off('data', check); r(); } };
    port.on('data', check); check();
  });

  // One command split across two writes: the reply must still be whole
  port.write('AT'); await new Promise((r) => setTimeout(r, 50)); port.write('Z\r');
  await prompt(1);
  // Two commands in one write: two replies
  port.write('ATI\r010C\r');
  await prompt(3);

  const replies = rx.split('>').map((s) => s.trim()).filter(Boolean);
  assert.equal(replies[0], 'ELM327 v1.5');
  assert.equal(replies[1], 'ELM327 v1.5');
  assert.match(replies[2], /^410C[0-9A-F]{4}$/);
  await new Promise<void>((r) => port.close(r));
});
