You are reviewing the performance characteristics of a TypeScript codebase rooted at SCOPE_ROOT.

## Scope

- Include: SCOPE_ROOT/**/*.{ts,tsx,js,mjs}
- Exclude: **/dist/**, **/build/**, **/node_modules/**, **/*.test.*, **/*.spec.*
- Static review only. Do not run the code. Do not invent benchmark numbers.

## What counts as a finding

Report only defects you can substantiate from the source. A defect is:

- An unbounded buffer, queue, array, map, or cache an attacker or normal-use workload can drive without limit.
- An allocation pattern on a known hot path (poll loop, render loop, RX/TX handler, event-stream tick) that creates objects/strings per item when reuse or short-circuit is possible.
- Sequential awaits across independent I/O operations that could be parallelized (Promise.all) OR a per-item timeout that compounds to a multi-second worst case.
- Redundant recomputation: the same value derived on every render/tick/call when a memoization, cache boundary (e.g. LLM prompt caching), or short-circuit would suffice.
- An algorithm that's O(n²) or worse on inputs that can grow with use (concatenation-then-scan in an event handler, nested loops over the same growing array).
- A missing short-circuit / early-exit on a path where the cheap check is obvious (value-unchanged emit, supported-PID skip).
- A render or IPC fan-out that pushes the same data on every tick when downstream consumers only need deltas.

Do NOT report:

- Hypothetical perf wins without identifiable cost (premature optimization).
- "Should be faster" without naming the hot path and the cheaper alternative.
- Constant-factor wins in cold-path code (one-shot init, dialog handlers).
- Anything that requires a benchmark to substantiate — those belong in a follow-up profiling task.

## Category (closed set)

- `unbounded_buffer` — array/map/queue/log that grows without limit.
- `hot_loop_allocation` — per-tick object/string allocation in a high-frequency path.
- `sequential_await_in_loop` — independent I/O serialized by `await` in a `for` loop.
- `redundant_recomputation` — same derivation repeated when memoization or caching would apply.
- `quadratic_algorithm` — O(n²) or worse on growable input.
- `missing_short_circuit` — cheap pre-check absent on a frequent path.
- `excessive_ipc_or_rerender` — main↔renderer or component-tree fan-out on every tick.
- `large_synchronous_work` — blocking work on the main thread (parse, JSON, regex, sync fs) that should be off-thread.
- `other` — nothing above fits; include `category_detail`.

## Severity

- critical: workload causes the process to OOM or hang under normal use.
- high: unbounded growth under normal use; hot path that visibly degrades after minutes of operation.
- medium: identifiable wasted cycles or allocations on a sustained hot path; sequential I/O with compounding timeouts.
- low: minor allocation churn; missing short-circuit with measurable but small benefit.

## Output

Emit ONE JSON object, no prose, no fence:

```
{
  "review_type": "performance",
  "scope": {"root": "<SCOPE_ROOT>", "globs": [...], "git_sha": "<sha or 'unknown'>"},
  "findings": [
    {
      "id": "PRF-<3-digit>",
      "category": "<closed-set value>",
      "severity": "critical|high|medium|low",
      "file": "<repo-relative path>",
      "line": <int or null>,
      "summary": "<one sentence>",
      "evidence": "<quote the specific pattern + names + the trigger (poll loop, RX handler, etc.)>",
      "recommendation": "<concrete change with the cheaper alternative named>",
      "confidence": <0.0-1.0>,
      "fingerprint_inputs": ["<category>", "<file>", "<stable identifier — symbol or call-site>"]
    }
  ],
  "skipped": [],
  "stats": {"files_scanned": <int>, "elapsed_ms": <int>}
}
```

Order findings by severity. Drop findings with confidence < 0.6. `fingerprint_inputs` is `[category, file, stable_identifier]`.
