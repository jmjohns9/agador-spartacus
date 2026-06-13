You are reviewing the test coverage of a TypeScript project rooted at SCOPE_ROOT.

## Scope

- Source tree: SCOPE_ROOT/src/**/*.{ts,tsx}
- Look for test files anywhere under SCOPE_ROOT matching: **/*.{test,spec}.{ts,tsx,js}, **/__tests__/**
- Look for test-runner config: jest.config.*, vitest.config.*, mocha config, node:test usage in package.json
- Look for CI: .github/workflows/, .gitlab-ci.yml, .circleci/config.yml
- Read SCOPE_ROOT/package.json for the `test` script and any test-runner devDependency.

## What counts as a finding

- **No test infrastructure** — no test runner declared, no `test` script, no test files anywhere. Emit ONE finding; do not duplicate it per module.
- **Untested critical module** — a module owning protocol state, parsing logic, security boundary, or finance/billing math with zero exercising tests. Pick the top 3–5 by blast-radius; do not enumerate every untested file.
- **Untested pure function** — a module exporting pure transformation helpers (formulas, formatters, validators) where tests would be cheap and high-value. Group by file.
- **No CI test gate** — tests exist but CI doesn't run them, or no CI exists at all.
- **Untested simulator/mock parity** — when a project ships both a simulator and the real implementation that consume each other's outputs, the round-trip is a critical untested seam.
- **Missing test type** — only unit tests exist for a module that needs integration coverage (e.g. a serial protocol that depends on timing). Only report if at least some tests exist.

Do NOT report:

- Every untested file individually — pick the highest-leverage ones.
- "Coverage below X%" without an explicit coverage tool wired up to compute it.
- Tests that exist but you personally would write differently — stylistic issues are out of scope.
- Trivial files (type-only exports, re-exports, constants).

## Category (closed set)

- `no_test_infrastructure`
- `no_ci_test_gate`
- `untested_critical_module`
- `untested_pure_function`
- `untested_simulator_parity`
- `missing_test_type`
- `other`

## Severity

- critical: a security boundary or data-corruption path is untested AND in production.
- high: protocol/parsing/state-machine code with zero tests; or NO test infrastructure exists at all.
- medium: pure functions or non-critical modules untested; no CI gate despite having tests.
- low: simulator/mock parity gap; missing integration tests when unit tests exist.

## Output

Emit ONE JSON object, no prose, no fence:

```
{
  "review_type": "tests",
  "scope": {"root": "<SCOPE_ROOT>", "git_sha": "<sha or 'unknown'>"},
  "findings": [
    {
      "id": "TST-<3-digit>",
      "category": "<closed-set value>",
      "severity": "critical|high|medium|low",
      "file": "<repo-relative path of the untested module OR package.json for infra findings>",
      "line": null,
      "summary": "<one sentence>",
      "evidence": "<concrete: what files you scanned, what's missing, names of untested symbols>",
      "recommendation": "<concrete first test to write>",
      "confidence": <0.0-1.0>,
      "fingerprint_inputs": ["<category>", "<file>", "<stable identifier>"]
    }
  ],
  "skipped": [],
  "stats": {"files_scanned": <int>, "elapsed_ms": <int>}
}
```

`fingerprint_inputs` is `[category, file, stable_identifier]` where stable_identifier is the module name or a marker like `"no-test-runner"`. Order by severity. Drop findings with confidence < 0.6.
