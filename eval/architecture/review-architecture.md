You are reviewing the architecture of a TypeScript codebase rooted at SCOPE_ROOT.

## Scope

- Include: SCOPE_ROOT/**/*.{ts,tsx}
- Exclude: **/dist/**, **/build/**, **/node_modules/**, **/*.test.*, **/*.spec.*

## What counts as a finding

Report only structural defects you can substantiate by tracing actual imports, file boundaries, and class responsibilities. A defect is:

- **God module** — a single file owning multiple distinct concerns (window lifecycle + IPC + business logic + persistence) where the seam is obvious.
- **Missing abstraction** — two or more concrete implementations of the same role hand-wired without a shared interface (e.g. two transports, two storage backends, two clients).
- **Wrong layer for concern** — a low-level module (protocol, transport, util) contains knowledge that belongs in a higher layer (vehicle knowledge, business rules, presentation strings).
- **Leaky boundary** — data crosses a trust/process/network boundary (IPC, fetch result, file load) without validation/parsing, exposing the inner system to malformed input.
- **Circular responsibility** — a class or module mixes generic and vendor-specific behavior under a name that promises only the generic.
- **Missing seam for testing** — a module-level singleton, static const, or hard-wired dependency that prevents substituting an alternate implementation in tests.
- **Inverted dependency** — a domain module imports from infrastructure (UI imports DB, core imports renderer, etc.).
- **Tangled state ownership** — the same piece of state is mutated from multiple layers without a clear owner.

Do NOT report:

- Anything that's about naming/style — that's `quality`, not `architecture`.
- "Could be more modular" without naming the seam.
- Hypothetical future changes that don't exist as planned work.
- Anything that requires moving 10+ files to fix without a concrete payoff.

## Category (closed set)

- `god_module`
- `missing_abstraction`
- `wrong_layer_for_concern`
- `leaky_boundary`
- `circular_responsibility`
- `missing_seam_for_testing`
- `inverted_dependency`
- `tangled_state_ownership`
- `other`

## Severity

- high: a single change-set frequently has to touch this seam because the structure forces it; testability is severely limited.
- medium: structural debt that costs a half-day per related change but the code still works.
- low: small refactor opportunity, isolated to one file.

## Output

Emit ONE JSON object, no prose, no fence:

```
{
  "review_type": "architecture",
  "scope": {"root": "<SCOPE_ROOT>", "globs": [...], "git_sha": "<sha or 'unknown'>"},
  "findings": [
    {
      "id": "ARC-<3-digit>",
      "category": "<closed-set value>",
      "severity": "critical|high|medium|low",
      "file": "<repo-relative path of the worst offender>",
      "line": <int or null>,
      "summary": "<one sentence>",
      "evidence": "<file paths involved, the concrete imports/responsibilities that demonstrate the issue>",
      "recommendation": "<concrete restructuring — name the new modules / interfaces>",
      "confidence": <0.0-1.0>,
      "fingerprint_inputs": ["<category>", "<file>", "<stable identifier>"]
    }
  ],
  "skipped": [],
  "stats": {"files_scanned": <int>, "elapsed_ms": <int>}
}
```

Order by severity. Drop findings with confidence < 0.6. Don't enumerate every god module — pick the worst one. Don't list every missing seam — pick the highest-leverage.
