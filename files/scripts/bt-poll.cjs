// Debug probe: opens the OBDLink with serialport (same as the app), then reads
// the port's fd directly. If bytes show up here but never as 'data' events,
// serialport's poller is what's deaf. Run from Terminal:
//   ELECTRON_RUN_AS_NODE=1 npx electron scripts/bt-poll.cjs [/dev/cu.Port]
const fs = require('fs');
const { SerialPort } = require('serialport');

const path = process.argv[2] || '/dev/cu.OBDLinkMX13659';
const t0 = Date.now();
const log = (m) => console.log(`${String(Date.now() - t0).padStart(6)}ms  ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const port = new SerialPort({ path, baudRate: 115200, autoOpen: false });
port.on('data', (b) => log(`'data' event ${b.length}B ${JSON.stringify(b.toString('ascii'))}`));
port.on('error', (e) => log(`ERROR ${e.message}`));

(async () => {
  log(`opening ${path}`);
  await new Promise((res, rej) => port.open((e) => (e ? rej(e) : res())));
  const fd = port.port.fd;
  log(`open, fd ${fd}`);

  // Stop serialport from consuming bytes so the direct reads below see them.
  port.pause();
  await wait(3000);

  await new Promise((r) => port.write('ATI\r', (e) => { log(`TX "ATI"${e ? ' write error: ' + e.message : ''}`); port.drain(() => r()); }));

  const buf = Buffer.alloc(256);
  for (let i = 0; i < 6; i++) {
    await wait(500);
    try {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      log(`direct read ${n}B ${JSON.stringify(buf.toString('ascii', 0, n))}`);
    } catch (e) {
      log(`direct read: ${e.code}`);   // EAGAIN = nothing waiting
    }
  }

  log('--- resuming serialport reads');
  port.resume();
  await new Promise((r) => port.write('ATI\r', () => port.drain(() => r())));
  log('TX "ATI"');
  await wait(3000);
  port.close(() => log('closed'));
})().catch((e) => { log(`FAILED ${e.message}`); process.exit(1); });
