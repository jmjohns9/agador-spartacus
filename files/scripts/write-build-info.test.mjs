import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBuildInfo } from './write-build-info.mjs';

const fakeGit = (status) => (args) => ({
  'rev-parse --short HEAD': '9d91b7a',
  'rev-parse --abbrev-ref HEAD': 'fix/adapter-link-robustness',
  'status --porcelain --untracked-files=no': status,
})[args.join(' ')];

const when = new Date('2026-10-22T21:15:00Z');

test('records the commit, branch and build time', () => {
  assert.deepEqual(readBuildInfo(fakeGit(''), when), {
    commit: '9d91b7a', branch: 'fix/adapter-link-robustness', dirty: false, builtAt: '2026-10-22T21:15:00.000Z',
  });
});

test('flags a build made with uncommitted changes', () => {
  assert.equal(readBuildInfo(fakeGit(' M src/main/main.ts'), when).dirty, true);
});

test('outside a git checkout the commit is unknown', () => {
  const info = readBuildInfo(() => { throw new Error('not a git repository'); }, when);
  assert.equal(info.commit, 'unknown');
  assert.equal(info.builtAt, '2026-10-22T21:15:00.000Z');
});
