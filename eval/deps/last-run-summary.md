# Deps review — 2026-08-10

6 findings: 0 critical, 0 high, 2 medium, 4 low.

## New since previous run (2026-08-09)

_No new findings._

## All findings today

- **[medium]** precarious_pre_1_0 @ files/package.json — The actively-used @anthropic-ai/sdk dependency is declared with a caret on a 0.x version, so npm can never resolve past the 0.104.x patch line.
- **[medium]** missing_audit @ files/package.json — The project has no automated vulnerability scan and no dependency-update bot, so nothing surfaces advisories or proposes upgrades for its 25 declared dependencies.
- **[low]** unused_dep @ files/package.json — electron-store is declared as a runtime dependency but is never imported anywhere in the source tree.
- **[low]** unpinned_runtime @ files/package.json — package.json declares no engines field, so no Node or npm version constraint is enforced at install time.
- **[low]** missing_overrides @ files/package.json — package.json has no overrides block, leaving no mechanism to force-pin a vulnerable transitive dependency ahead of an upstream fix.
- **[low]** unused_dep @ files/package.json — recharts is declared as a runtime dependency but no chart component from it is imported anywhere in the source tree.

## Notes

- Every fingerprint carried over unchanged from 2026-08-09; the backlog is static, not newly clean.
- The 2026-08-09 run additionally reported `other @ files/index.html — @tabler/icons-webfont:cdn-latest` (an unpinned `@latest` CDN stylesheet). Not reported today: `files/index.html` is a tracked but unbuilt legacy duplicate — `webpack.renderer.js` templates from `./src/renderer/index.html`, which has no CDN link — and the review's declared inputs are package.json, package-lock.json, .npmrc, and CI/bot config. It is a dropped false positive, not a fix.
