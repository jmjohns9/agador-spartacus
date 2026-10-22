// Debug probe: same as bt-probe.cjs but bypasses the serialport library and
// uses a plain file descriptor, the way screen does. Run from Terminal:
//   node scripts/bt-raw.cjs [/dev/cu.Port]
const fs = require('fs');

const path = process.argv[2] || '/dev/cu.OBDLinkMX13659';
const t0 = Date.now();
const log = (m) => console.log(`${String(Date.now() - t0).padStart(6)}ms  ${m}`);

log(`opening ${path}`);
const fd = fs.openSync(path, 'r+');
log('open');

fs.createReadStream(null, { fd, autoClose: false })
  .on('data', (b) => log(`RX ${b.length}B ${JSON.stringify(b.toString('ascii'))}`))
  .on('error', (e) => log(`read error ${e.message}`));

setTimeout(() => { fs.writeSync(fd, 'ATI\r'); log('TX "ATI"'); }, 3000);
setTimeout(() => { fs.writeSync(fd, 'ATZ\r'); log('TX "ATZ"'); }, 6000);
setTimeout(() => { log('done'); process.exit(0); }, 10000);
