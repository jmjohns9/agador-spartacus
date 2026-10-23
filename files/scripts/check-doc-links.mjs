#!/usr/bin/env node
// Checks that every relative link and image in a Markdown file points at a file
// that exists. Covers [text](target), ![alt](target), and HTML src="…" / srcset="…"
// (the README's <picture> banners). External, mailto and #anchor links are skipped,
// as is anything inside fenced code blocks or inline backticks.
// Usage: node scripts/check-doc-links.mjs <file.md>...   (exit 1 on any miss)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MD_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_ATTR = /\b(?:src|srcset)="([^"]+)"/g;

function isLocal(target) {
  return !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target);
}

export function findBrokenLinks(mdPath) {
  const dir = path.dirname(mdPath);
  const broken = [];
  let inFence = false;
  readFileSync(mdPath, 'utf8').split('\n').forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; return; }
    if (inFence) return;
    const line = raw.replace(/`[^`]*`/g, '');
    const targets = [...line.matchAll(MD_LINK), ...line.matchAll(HTML_ATTR)].map(m => m[1]);
    for (const link of targets) {
      if (!isLocal(link)) continue;
      const file = decodeURIComponent(link.replace(/[#?].*$/, ''));
      if (file && !existsSync(path.resolve(dir, file))) broken.push({ link, line: i + 1 });
    }
  });
  return broken;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let total = 0;
  for (const file of process.argv.slice(2)) {
    for (const { link, line } of findBrokenLinks(file)) {
      console.log(`${file}:${line}  ${link}`);
      total++;
    }
  }
  process.exit(total ? 1 : 0);
}
