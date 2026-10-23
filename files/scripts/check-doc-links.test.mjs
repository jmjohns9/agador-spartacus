import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBrokenLinks } from './check-doc-links.mjs';

// Builds a throwaway repo: { 'README.md': '...', 'docs/a.md': '' } → root dir.
function repo(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'doc-links-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  }
  return root;
}

test('flags a missing relative link', () => {
  const root = repo({ 'README.md': '# T\n\n[a](docs/nope.md)\n' });
  assert.deepEqual(findBrokenLinks(path.join(root, 'README.md')), [{ link: 'docs/nope.md', line: 3 }]);
});

test('passes an existing file and image', () => {
  const root = repo({ 'README.md': '[a](docs/a.md) ![b](img/b.png)\n', 'docs/a.md': '', 'img/b.png': '' });
  assert.deepEqual(findBrokenLinks(path.join(root, 'README.md')), []);
});

test('skips external and anchor links', () => {
  const root = repo({ 'README.md': '[x](https://x.org/a) [y](http://y) [m](mailto:a@b.c) [t](#top)\n' });
  assert.deepEqual(findBrokenLinks(path.join(root, 'README.md')), []);
});

test('checks <img src> and <source srcset>', () => {
  const root = repo({
    'README.md': '<picture>\n<source media="(prefers-color-scheme: dark)" srcset="brand/missing.svg">\n<img alt="x" src="brand/ok.svg">\n</picture>\n',
    'brand/ok.svg': '',
  });
  assert.deepEqual(findBrokenLinks(path.join(root, 'README.md')), [{ link: 'brand/missing.svg', line: 2 }]);
});

test('strips fragments and queries', () => {
  const root = repo({ 'README.md': '[h](docs/a.md#path-a) [q](docs/a.md?raw=1)\n', 'docs/a.md': '' });
  assert.deepEqual(findBrokenLinks(path.join(root, 'README.md')), []);
});

test('resolves relative to the file', () => {
  const root = repo({ 'docs/X.md': '[p](../brand/l.svg)\n', 'brand/l.svg': '' });
  assert.deepEqual(findBrokenLinks(path.join(root, 'docs/X.md')), []);
});

test('ignores links in code', () => {
  const root = repo({ 'README.md': '```\n[a](nope.md)\n```\nRun `[b](nope2.md)` here.\n' });
  assert.deepEqual(findBrokenLinks(path.join(root, 'README.md')), []);
});

test('decodes %20 in paths', () => {
  const root = repo({ 'README.md': '[s](my%20file.md)\n', 'my file.md': '' });
  assert.deepEqual(findBrokenLinks(path.join(root, 'README.md')), []);
});
