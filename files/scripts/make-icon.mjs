#!/usr/bin/env node
// Renders the app icon (a gauge on a systemBlue squircle) to build/icon-1024.png
// with Electron, then builds build/icon.icns with macOS sips + iconutil.
// A placeholder until a designed icon replaces build/icon.icns.
// Usage: node scripts/make-icon.mjs
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'build');
mkdirSync(out, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3B9BFF"/><stop offset="1" stop-color="#0A5FD8"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
  <!-- 270° dial centred on (512, 540), r = 240; value arc and needle at 30° -->
  <path d="M 342.3 709.7 A 240 240 0 1 1 681.7 709.7" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="56" stroke-linecap="round"/>
  <path d="M 342.3 709.7 A 240 240 0 1 1 719.8 420" fill="none" stroke="#fff" stroke-width="56" stroke-linecap="round"/>
  <line x1="512" y1="540" x2="642" y2="465" stroke="#fff" stroke-width="36" stroke-linecap="round"/>
  <circle cx="512" cy="540" r="44" fill="#fff"/>
  <text x="512" y="835" text-anchor="middle" font-family="-apple-system, Helvetica" font-weight="700" font-size="92" fill="#fff" fill-opacity="0.9">OBD</text>
</svg>`;

// Electron main script that loads the SVG offscreen and saves a 1024 px PNG
const tmp = mkdtempSync(path.join(os.tmpdir(), 'icon-'));
const png = path.join(out, 'icon-1024.png');
writeFileSync(path.join(tmp, 'render.js'), `
const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', webPreferences: { offscreen: true }, useContentSize: true });
  // An SVG document gets an opaque page behind it; an HTML page can be transparent
  const html = '<html><body style="margin:0;background:transparent">' + ${JSON.stringify(svg)} + '</body></html>';
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise(r => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  require('fs').writeFileSync(${JSON.stringify(png)}, img.resize({ width: 1024, height: 1024 }).toPNG());
  app.quit();
});`);
const { ELECTRON_RUN_AS_NODE: _unused, ...env } = process.env;
const r = spawnSync(require('electron'), [path.join(tmp, 'render.js'), '--force-device-scale-factor=1'], { env, stdio: 'inherit' });
if (r.status !== 0) throw new Error('Electron render failed');

// .iconset with the sizes iconutil expects, then .icns
const set = path.join(tmp, 'icon.iconset');
mkdirSync(set);
for (const s of [16, 32, 128, 256, 512]) {
  execFileSync('sips', ['-z', String(s), String(s), png, '--out', path.join(set, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
  execFileSync('sips', ['-z', String(s * 2), String(s * 2), png, '--out', path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(out, 'icon.icns')]);
rmSync(tmp, { recursive: true, force: true });
console.log('wrote build/icon-1024.png and build/icon.icns');
