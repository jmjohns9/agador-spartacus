import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as net from 'net';
import * as path from 'path';
import { spawn } from 'child_process';
import { TcpPort, parseTcpTarget, isTcpTarget, parseBridgeError, isRetryableOpenError, DEFAULT_TCP_PORT } from './tcpPort';

// A plain Wi-Fi ELM327 never greets; don't make every test wait the full window
const QUICK = { greetingMs: 20 };

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
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`, QUICK);
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
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`, QUICK);
  await new Promise<void>((res, rej) => port.open((e) => e ? rej(e) : res()));
  const closed = new Promise<void>((r) => port.once('close', () => r()));
  await bridge.close();
  await closed;
});

const OPEN_FAIL = 'BRIDGE ERROR: cannot open /dev/rfcomm0: No such file or directory\r';

test('a bridge error line is read out of the received text', () => {
  assert.equal(parseBridgeError(OPEN_FAIL), 'cannot open /dev/rfcomm0: No such file or directory');
  assert.equal(parseBridgeError('ELM327 v1.5\r\r>'), null);
  assert.equal(parseBridgeError('BRIDGE ERR'), null);
});

test('only "bridge not up yet" failures are worth retrying', () => {
  for (const code of ['ECONNREFUSED', 'EHOSTUNREACH', 'CONNECT_TIMEOUT']) assert.equal(isRetryableOpenError({ code }), true, code);
  for (const code of ['BRIDGE_ERROR', 'BRIDGE_TIMEOUT', 'ENOTFOUND', undefined]) assert.equal(isRetryableOpenError({ code }), false, String(code));
});

// A stand-in UNO Q bridge: writes `script` (strings, with numbers as pauses in
// ms) to each connection, then answers ATI if still open, or hangs up on 'END'.
async function scriptedBridge(script: (string | number)[]): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer(async (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('error', () => { /* the port under test may destroy its end */ });
    s.on('data', (d) => { if (d.toString().includes('ATI')) s.write('ELM327 v1.5\r\r>'); });
    for (const step of script) {
      if (typeof step === 'number') await new Promise((r) => setTimeout(r, step));
      else if (step === 'END') { s.end(); return; }
      else if (!s.destroyed) s.write(step);
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}

function openPort(port: TcpPort): Promise<Error | null> {
  return new Promise((r) => port.open(r));
}

test('a bridge that reports progress, then READY, opens and relays its status', async (t) => {
  const bridge = await scriptedBridge([
    'BRIDGE STATUS: connecting to the OBD adapter\r', 20,
    'BRIDGE STATUS: OBDLink 00:04:3E:12:34:56 not answering, retrying in 1s (attempt 1)\r', 20,
    'BRIDGE READY\r',
  ]);
  t.after(bridge.close);
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`);
  const statuses: string[] = [];
  port.on('status', (s: string) => statuses.push(s));
  assert.equal(await openPort(port), null);
  assert.deepEqual(statuses, ['connecting to the OBD adapter', 'OBDLink 00:04:3E:12:34:56 not answering, retrying in 1s (attempt 1)']);
  const reply = new Promise<string>((r) => port.on('data', (b: Buffer) => r(b.toString('ascii'))));
  port.write('ATI\r');
  assert.match(await reply, /ELM327 v1\.5/);
  await new Promise<void>((r) => port.close(r));
});

test('adapter bytes that arrive with READY reach the session', async (t) => {
  const bridge = await scriptedBridge(['BRIDGE READY\rELM327 v1.5\r\r>']);
  t.after(bridge.close);
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`);
  const got = new Promise<string>((r) => port.on('data', (b: Buffer) => r(b.toString('ascii'))));
  assert.equal(await openPort(port), null);
  assert.equal(await got, 'ELM327 v1.5\r\r>');
  await new Promise<void>((r) => port.close(r));
});

for (const [name, script] of [
  ['in one read', ['BRIDGE STATUS: connecting to the OBD adapter\r', OPEN_FAIL, 'END']],
  ['split across reads', ['BRIDGE STATUS: connecting to the OBD adapter\r', OPEN_FAIL.slice(0, 20), 20, OPEN_FAIL.slice(20), 'END']],
] as const) {
  test(`BRIDGE ERROR fails open() with the bridge's advice and emits no close (${name})`, async (t) => {
    const bridge = await scriptedBridge([...script]);
    t.after(bridge.close);
    const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`);
    let closed = false;
    port.on('close', () => { closed = true; });
    const err = await openPort(port);
    assert.equal(err?.message, "The bridge can't reach the OBD adapter: cannot open /dev/rfcomm0: No such file or directory");
    assert.equal((err as NodeJS.ErrnoException).code, 'BRIDGE_ERROR');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(closed, false, 'a failed open must not also report close');
  });
}

test('a bridge that never finishes linking times out', async (t) => {
  const bridge = await scriptedBridge(['BRIDGE STATUS: connecting to the OBD adapter\r']);
  t.after(bridge.close);
  const err = await openPort(new TcpPort(`tcp://127.0.0.1:${bridge.port}`, { linkTimeoutMs: 100 }));
  assert.equal((err as NodeJS.ErrnoException).code, 'BRIDGE_TIMEOUT');
  assert.match(err!.message, /journalctl -u tattlestone-bridge/);
});

test('a bridge that hangs up mid-handshake without a reason fails open()', async (t) => {
  const bridge = await scriptedBridge(['BRIDGE STATUS: connecting to the OBD adapter\r', 'END']);
  t.after(bridge.close);
  const err = await openPort(new TcpPort(`tcp://127.0.0.1:${bridge.port}`));
  assert.match(err!.message, /closed the connection before the adapter link was up/);
});

test('a mid-session BRIDGE ERROR is kept as closeReason, past the first 256 bytes', async (t) => {
  const bridge = await scriptedBridge(['BRIDGE READY\r', 30, '410C1AF8\r\r>'.repeat(40), 30,
    'BRIDGE ERROR: lost the link to the OBD adapter (the adapter closed the link)\r', 'END']);
  t.after(bridge.close);
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`);
  const closed = new Promise<void>((r) => port.once('close', () => r()));
  assert.equal(await openPort(port), null);
  await closed;
  assert.equal(port.closeReason, 'lost the link to the OBD adapter (the adapter closed the link)');
});

test('a link that closes without a bridge error has no closeReason', async () => {
  const bridge = await fakeBridge();
  const port = new TcpPort(`tcp://127.0.0.1:${bridge.port}`, QUICK);
  await new Promise<void>((res, rej) => port.open((e) => e ? rej(e) : res()));
  const closed = new Promise<void>((r) => port.once('close', () => r()));
  await bridge.close();
  await closed;
  assert.equal(port.closeReason, null);
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

  const port = new TcpPort(`tcp://127.0.0.1:${tcp}`, QUICK);
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

// The real UNO Q bridge, run with --device on a pty-backed ELM327 from its own
// test module: the app/bridge handshake end to end. Skipped where python3 is missing.
const FIRMWARE = path.join(__dirname, '../../firmware/uno-q-bridge');

function spawnLine(t: { after: (fn: () => void) => void }, args: string[], expect: RegExp): Promise<string | null> {
  const proc = spawn('python3', ['-u', ...args], { cwd: FIRMWARE });
  t.after(() => { proc.kill(); });
  return new Promise<string | null>((r) => {
    proc.once('error', () => r(null));
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); const m = out.match(expect); if (m) r(m[1] ?? m[0]); });
  });
}

async function realBridge(t: { after: (fn: () => void) => void }, device: string | null): Promise<number | null> {
  if (device === null) {
    const pty = await spawnLine(t, ['-c', 'from test_obd_tcp_bridge import fake_adapter\nimport time\nprint(fake_adapter()[0], flush=True)\ntime.sleep(60)'], /(\/dev\/\S+)/);
    if (!pty) return null;
    device = pty;
  }
  const tcp = await freePort();
  const up = await spawnLine(t, ['obd_tcp_bridge.py', '--device', device, '--port', String(tcp)], /listening/);
  return up ? tcp : null;
}

test('with the real bridge: connect, round-trip, close cleanly, reconnect', async (t) => {
  const tcp = await realBridge(t, null);
  if (!tcp) { t.skip('python3 not available'); return; }
  for (const round of [1, 2]) {
    const port: TcpPort = new TcpPort(`tcp://127.0.0.1:${tcp}`);
    const statuses: string[] = [];
    port.on('status', (s: string) => statuses.push(s));
    assert.equal(await openPort(port), null, `round ${round}`);
    assert.deepEqual(statuses, ['connecting to the OBD adapter']);
    const reply = new Promise<string>((r) => { let rx = ''; port.on('data', (b: Buffer) => { rx += b.toString('ascii'); if (rx.endsWith('>')) r(rx); }); });
    port.write('ATI\r');
    assert.equal(await reply, 'ELM327 v1.5\r\r>');
    await new Promise<void>((r) => port.close(r));
    assert.equal(port.isOpen, false);
  }
});

test('with the real bridge: an unavailable adapter fails open() with what to do', async (t) => {
  const tcp = await realBridge(t, '/dev/does-not-exist');
  if (!tcp) { t.skip('python3 not available'); return; }
  const err = await openPort(new TcpPort(`tcp://127.0.0.1:${tcp}`));
  assert.equal((err as NodeJS.ErrnoException).code, 'BRIDGE_ERROR');
  assert.match(err!.message, /^The bridge can't reach the OBD adapter: cannot open \/dev\/does-not-exist: .*USB cable/);
});
