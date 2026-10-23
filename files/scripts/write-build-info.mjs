// Records which commit a build came from, for Settings → About. Every build
// reports version 1.0.0, so the commit is the only way to tell them apart.
// Run by `npm run build` after tsc/webpack; main reads dist/build-info.json.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// `run` is git by default; tests pass a stand-in.
export function readBuildInfo(run = git, now = new Date()) {
  try {
    return {
      commit: run(['rev-parse', '--short', 'HEAD']),
      branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
      // Untracked files (notes, logs) don't change what gets built
      dirty:  run(['status', '--porcelain', '--untracked-files=no']) !== '',
      builtAt: now.toISOString(),
    };
  } catch {
    // Not a git checkout (e.g. a source tarball): still record the build time
    return { commit: 'unknown', branch: '', dirty: false, builtAt: now.toISOString() };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist/build-info.json');
  const info = readBuildInfo();
  writeFileSync(out, JSON.stringify(info, null, 2) + '\n');
  console.log(`build-info: ${info.commit}${info.dirty ? '-dirty' : ''} (${info.branch})`);
}
