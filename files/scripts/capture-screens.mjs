#!/usr/bin/env node
// Launches the built app with Chrome DevTools Protocol enabled, clicks every
// sidebar entry ([data-screen]) and saves light + dark PNGs of each screen.
// Native vibrancy is not captured (CDP renders web content only).
// Usage: npm run build && node scripts/capture-screens.mjs <outDir> [--only live,health]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');
const outDir = process.argv[2] ?? '.screens/current';
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1].split(',') : null;
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(outDir, { recursive: true });
// Some shells (including this repo's agent sandbox) export ELECTRON_RUN_AS_NODE=1,
// which makes the "electron" binary boot as plain Node — no app/BrowserWindow,
// no CDP target. Strip it so the harness always gets a real Electron process.
const { ELECTRON_RUN_AS_NODE: _unused, ...cleanEnv } = process.env;
const child = spawn(electronBin, ['.', `--remote-debugging-port=${PORT}`], {
  stdio: 'ignore',
  env: { ...cleanEnv, NODE_ENV: 'production' },
});

async function pageSocketUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP page target not found');
}

try {
  const ws = new WebSocket(await pageSocketUrl());
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, m => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  await sleep(5000); // simulator auto-connects and starts polling
  const ids = JSON.parse((await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('[data-screen]')].map(b => b.dataset.screen))`,
    returnByValue: true,
  })).result.value).filter(id => !only || only.includes(id));

  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    for (const id of ids) {
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-screen="${id}"]').click()` });
      await sleep(1200);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(outDir, `${id}-${scheme}.png`), Buffer.from(data, 'base64'));
      console.log(`saved ${id}-${scheme}.png`);
    }
  }
  ws.close();
} finally {
  child.kill();
}
