# Deps review — 2026-08-09

7 findings: 0 critical, 0 high, 3 medium, 4 low.

## New since previous run (2026-08-08)

- **[medium]** other @ files/index.html — index.html loads @tabler/icons-webfont from a third-party CDN at the floating `@latest` tag with no subresource integrity, duplicating a dependency that is already declared and bundled.

## All findings today

- **[medium]** precarious_pre_1_0 @ files/package.json — The actively-used @anthropic-ai/sdk dependency is pinned with a caret on a 0.x version, which cannot adopt fixes published outside the 0.104.* patch line.
- **[medium]** other @ files/index.html — index.html loads @tabler/icons-webfont from a third-party CDN at the floating `@latest` tag with no subresource integrity, duplicating a dependency that is already declared and bundled.
- **[medium]** missing_audit @ files/package.json — The repository has no CI pipeline, no vulnerability-scan step, and no Renovate or Dependabot configuration, so no dependency update or advisory is surfaced automatically.
- **[low]** unused_dep @ files/package.json — electron-store is declared as a runtime dependency but is never imported anywhere in the source tree.
- **[low]** unpinned_runtime @ files/package.json — package.json declares no `engines` field, leaving the Node and npm versions used to build the app unconstrained.
- **[low]** missing_overrides @ files/package.json — package.json has no `overrides` block, so a vulnerable transitive dependency cannot be pinned without waiting for every direct parent to publish a fix.
- **[low]** unused_dep @ files/package.json — recharts is declared as a runtime dependency but is never imported anywhere in the source tree.

## Notes

- Dropped vs 2026-08-08: `outdated_major` / `electron:^42.4.1`. Electron ^42.4.1 was assessed this run as current rather than past its support window, so it was not re-raised. Nothing in the manifest changed between runs — this is a judgment difference, not a fix.
- The stale majors react ^18.0.0, react-dom ^18.0.0, zustand ^4.0.0 and electron-store ^8.0.0 were folded into the single `missing_audit` finding per the prompt's consolidation rule, rather than emitted as separate `outdated_major` findings.
