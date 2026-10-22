// Debug probe: talks to the OBDLink over Bluetooth serial with the same
// serialport library the app uses, outside the app. Run from Terminal:
//   ELECTRON_RUN_AS_NODE=1 npx electron scripts/bt-probe.cjs [/dev/cu.Port]
const { SerialPort } = require('serialport');

const path = process.argv[2] || '/dev/cu.OBDLinkMX13659';
const t0 = Date.now();
const log = (m) => console.log(`${String(Date.now() - t0).padStart(6)}ms  ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const port = new SerialPort({ path, baudRate: 115200, autoOpen: false });
port.on('data', (b) => log(`RX ${b.length}B ${JSON.stringify(b.toString('ascii'))}`));
port.on('error', (e) => log(`ERROR ${e.message}`));
port.on('close', () => log('closed'));

const send = (cmd) => new Promise((r) => port.write(cmd + '\r', (e) => {
  log(`TX ${JSON.stringify(cmd)}${e ? ' write error: ' + e.message : ''}`);
  port.drain(() => r());
}));

(async () => {
  log(`opening ${path}`);
  await new Promise((res, rej) => port.open((e) => (e ? rej(e) : res())));
  log('open');

  await wait(3000);
  log('--- test A: plain (same as the app)');
  await send('ATI');
  await wait(3000);

  log('--- test B: DTR/RTS asserted (like screen)');
  await new Promise((r) => port.set({ dtr: true, rts: true }, (e) => { log(`set dtr/rts${e ? ' error: ' + e.message : ''}`); r(); }));
  await wait(500);
  await send('ATI');
  await wait(3000);

  log('--- test C: one character at a time (like typing)');
  for (const ch of 'ATI\r') {
    await new Promise((r) => port.write(ch, () => port.drain(() => r())));
    await wait(100);
  }
  log('TX "ATI" (per char)');
  await wait(3000);

  port.close();
})().catch((e) => { log(`FAILED ${e.message}`); process.exit(1); });
