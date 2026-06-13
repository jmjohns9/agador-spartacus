You are reviewing the dependency hygiene of a Node project rooted at SCOPE_ROOT.

## Scope

- Inputs: SCOPE_ROOT/package.json (required), SCOPE_ROOT/package-lock.json if present, .npmrc if present.
- Also check for the presence/absence of CI / bot config under: .github/workflows/, .gitlab-ci.yml, .circleci/config.yml, renovate.json, .dependabot/config.yml, .github/dependabot.yml.
- Do NOT run `npm install`, `npm audit`, or any network calls. This is a static review of declared metadata.

If SCOPE_ROOT/package.json is missing, emit `{"findings": [], "skipped": [{"path": "SCOPE_ROOT/package.json", "reason": "not found"}], ...}` and stop.

## What counts as a finding

Report only structural defects in dependency declarations and the toolchain around them. A defect is:

- A version range that prevents adopting security-relevant updates (caret on a 0.x package, pin to an unsupported major, no upper bound on a hot package).
- A dependency declared at a major version that has reached end-of-life on its project's published support schedule.
- A package known to be deprecated, abandoned, or superseded by a renamed package.
- A direct dependency declared but never imported anywhere under the source tree (use only what you can verify by grep).
- A missing piece of the supply-chain toolchain: no committed lockfile, no `engines` field, no `overrides`/`resolutions` block, no automated audit step in CI, no Renovate/Dependabot config.
- A `scripts` entry that defeats reproducibility (`npm install` inside `postinstall`, `prepare` that fetches from an arbitrary URL).

Do NOT report:

- "Should upgrade to latest" without a concrete reason (EOL, CVE, or deprecation).
- Specific CVE IDs — those decay; this review focuses on the policy/structure that lets CVEs slip through.
- Deps declared in devDependencies that ship correctly there (eslint, webpack, electron-builder).
- A caret prefix on a 1.x+ dep with a committed lockfile and CI using `npm ci` — that combination is fine.

## Category (closed set — pick exactly one per finding)

- `outdated_major` — dep pinned to a major past its official support window or one boundary behind the current line.
- `precarious_pre_1_0` — `^0.x.y` range that cannot escape the 0.x.* patch line.
- `loose_version_range` — overly permissive range combined with missing CI safety nets.
- `missing_lockfile` — no `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` committed.
- `missing_audit` — no automated vulnerability scan wired into CI / no Renovate / no Dependabot config.
- `missing_overrides` — no `overrides`/`resolutions` block for emergency transitive pinning.
- `unpinned_runtime` — no `engines.node` / `engines.npm` constraints.
- `deprecated_package` — declared dep is marked deprecated upstream or has a renamed successor.
- `unused_dep` — declared in dependencies/devDependencies but no `require`/`import` for it under the source tree.
- `precarious_script` — `scripts.postinstall` / `scripts.prepare` / similar that mutates the install in a non-reproducible way.
- `other` — nothing above fits; include `"category_detail": "<short descriptor>"`.

When the same root cause has multiple symptoms (e.g. all deps use caret AND there's no CI audit), emit ONE finding at the highest-leverage policy level and reference the others in `evidence`.

## Severity

- critical: a declared dep is currently being used as a malware delivery vector (typosquat, known supply-chain compromise on a still-installable version).
- high: a major version is unsupported / EOL, OR a declared dep is deprecated and recommended for removal upstream.
- medium: caret-on-0.x for an actively-used dep, OR no CI audit AND no Renovate/Dependabot, OR a `postinstall` that fetches from the network.
- low: missing `engines`, missing `overrides`, generic loose-range hygiene, missing-major-but-still-supported.

## Output

Emit ONE JSON object matching this schema, and nothing else (no prose, no markdown fence):

```
{
  "review_type": "deps",
  "scope": {"root": "<SCOPE_ROOT>", "files": [...], "git_sha": "<sha or 'unknown'>"},
  "findings": [
    {
      "id": "DEP-<3-digit>",
      "category": "<one of the closed set>",
      "severity": "critical|high|medium|low",
      "file": "<repo-relative path, e.g. files/package.json>",
      "line": null,
      "summary": "<one sentence>",
      "evidence": "<quote the exact range / field / absence, including the package name>",
      "recommendation": "<concrete action, not 'consider X'>",
      "confidence": <0.0-1.0>,
      "fingerprint_inputs": ["<category>", "<file>", "<stable-identifier, e.g. package-name:^X>"]
    }
  ],
  "skipped": [{"path": "<path>", "reason": "<why>"}],
  "stats": {"files_scanned": <int>, "elapsed_ms": <int>}
}
```

Rules for the output:

- `fingerprint_inputs` is exactly `[category, file, stable_identifier]` where stable_identifier names the package or the specific missing field (e.g. `"electron:^31"`, `"no-engines"`, `"no-ci-audit"`).
- `line` is always `null` for dep findings.
- Order findings by severity (critical → low), then by package/field name.
- If no findings, emit `"findings": []`.
- `confidence` < 0.6 → drop the finding.
