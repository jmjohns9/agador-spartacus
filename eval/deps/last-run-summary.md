# Deps review — 2026-08-08

7 findings: 0 critical, 0 high, 2 medium, 5 low.

## New since previous run (first run)

- **[medium]** precarious_pre_1_0 @ files/package.json — The actively-used Anthropic SDK is declared with a caret on a 0.x version, which confines updates to the 0.104.x patch line and blocks any security fix released on a later 0.x minor.
- **[medium]** missing_audit @ files/package.json — The project has no CI pipeline, no vulnerability scan and no automated dependency-update bot, so nothing in the repository can surface or land a security update.
- **[low]** outdated_major @ files/package.json — Electron is pinned to the 42 line, which sits at or just behind the boundary of Electron's published support window of the latest three stable majors.
- **[low]** unused_dep @ files/package.json — electron-store is declared as a production dependency but is never imported anywhere in the source tree, so it ships in the packaged app while serving no purpose.
- **[low]** unpinned_runtime @ files/package.json — package.json declares no engines field, so no Node or npm floor is enforced and contributors or build machines may resolve a different, potentially unsupported runtime.
- **[low]** missing_overrides @ files/package.json — There is no overrides block, so a vulnerable transitive dependency cannot be pinned without waiting for every intermediate maintainer to publish a fix.
- **[low]** unused_dep @ files/package.json — recharts is declared as a production dependency but is never imported anywhere in the source tree, so it ships in the packaged app while serving no purpose.

## All findings today

- **[medium]** precarious_pre_1_0 @ files/package.json — The actively-used Anthropic SDK is declared with a caret on a 0.x version, which confines updates to the 0.104.x patch line and blocks any security fix released on a later 0.x minor.
- **[medium]** missing_audit @ files/package.json — The project has no CI pipeline, no vulnerability scan and no automated dependency-update bot, so nothing in the repository can surface or land a security update.
- **[low]** outdated_major @ files/package.json — Electron is pinned to the 42 line, which sits at or just behind the boundary of Electron's published support window of the latest three stable majors.
- **[low]** unused_dep @ files/package.json — electron-store is declared as a production dependency but is never imported anywhere in the source tree, so it ships in the packaged app while serving no purpose.
- **[low]** unpinned_runtime @ files/package.json — package.json declares no engines field, so no Node or npm floor is enforced and contributors or build machines may resolve a different, potentially unsupported runtime.
- **[low]** missing_overrides @ files/package.json — There is no overrides block, so a vulnerable transitive dependency cannot be pinned without waiting for every intermediate maintainer to publish a fix.
- **[low]** unused_dep @ files/package.json — recharts is declared as a production dependency but is never imported anywhere in the source tree, so it ships in the packaged app while serving no purpose.
