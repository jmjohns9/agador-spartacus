# GitHub page redesign

Date: 2026-10-19
Branch: `docs/github-redesign`, cut from `fix/adapter-link-robustness`, PR stacked on #12

## Goal

Make the GitHub page for Tattlestone readable by someone who has never heard of OBD-II, carry the Tattlestone brand, show current screenshots, and explain with a diagram how the Arduino UNO Q fits between the truck and the Mac.

Rules from the brief: no AI slop, nothing that reads as machine-written, and anything in the current README that does gets removed.

## Context

- `main` has none of the brand, Network Mode or UNO Q bridge work. Those are in open PRs #8 → #9 → #10. This work stacks on #10 and retargets to `main` when #10 merges.
- Brand assets exist in `brand/` (lockup, wordmark, reversed wordmark, icon builder). Colours: Basalt `#16171A`, Signal `#E8590C`, Paper `#F5F3EE`.
- The repo has no description, topics or social preview.
- Screenshots in `docs/screenshots/` date from 2026-10-13 and predate the brand.
- Arduino work that exists: `files/firmware/uno-q-bridge/obd_tcp_bridge.py` (TCP ↔ serial pass-through, drops Mode 04), `elm327_emulator.py` (answers ELM327 commands with no adapter, 127.0.0.1 by default, reached over SSH), and `files/src/main/tcpPort.ts` (Network Mode, `tcp://host:port`, default port 35000).
- Arduino work that is proposed only: the INA260 fuse-current sensor in `docs/hardware/fuse-sensor-parts-list.md` (currently untracked).

## Decisions

| Question | Decision |
|---|---|
| Diagram scope | Built paths drawn solid; fuse sensor drawn dashed and labelled "coming later" |
| Where dev detail goes | Separate files under `docs/`, linked from a short "For developers" section |
| Screenshot source | Built-in simulator via `scripts/capture-screens.mjs` |
| Branding pieces | README banner, About box, social preview card, branded SVG diagram |
| Writing approach | New README written from a blank page, led by the Silverado battery story |

## 1. README

Sections, in order:

1. **Banner.** `brand/github/readme-banner-light.svg`, with `-dark.svg` chosen through `<picture>` and `prefers-color-scheme`. No badge row.
2. **One line.** "Tattlestone plugs into your car and tells you what it's been keeping quiet about."
3. **Why it exists.** About four sentences: a 2004 Silverado kept going dead overnight and the cause couldn't be found, so this was built to find it.
4. **What it does.** One plain sentence for each of seven areas: health check, live gauges, fault codes in plain English, battery-drain hunt, recalls and bulletins, the Claude helper, and saving and reports.
5. **It only listens.** States that the app never changes anything in the car and cannot clear codes.
6. **Screenshots.** Health, Live, Fault codes and Parasitic draw shown large; the remaining screens in a two-column table of smaller images.
7. **How the Arduino fits in.** The diagram (section 2), then a numbered plain-words list of what happens.
8. **Try it.** Three steps: build or install, open, click **Launch Emulator**.
9. **What you need for a real car.** OBDLink MX+, a Mac on macOS 13 or later, ignition on. Links to `docs/HARDWARE.md`.
10. **For developers.** Links to the files in section 3.
11. **Credits.** The current attribution list, kept intact (PcmHammer GPL-3.0, SAE, Anthropic API, Tabler, OBDex, corgi, NHTSA).

Length target: under 150 lines of Markdown.

Voice rules:

- Short, common words. Address the reader as "you" and the vehicle as "your truck" or "your car".
- Use specifics instead of adjectives (for example, "12.89 V dropping to 11.8 V").
- None of these: "seamless", "robust", "powerful", "comprehensive", "leverage", "empower", "Whether you're X or Y", emoji in headings, bold-label bullet lists, chains of em dashes, a closing summary sentence.
- Every factual claim is checked against the code before commit.

Removed from the README but not deleted: What's new, the bug-fix lists, Known issues, the eval pipeline, Docker, the ELM327 init sequence, the repo layout, and the design-system notes. They move to the files in section 3.

## 2. Arduino diagram

Files: `brand/github/arduino-flow-light.svg` and `arduino-flow-dark.svg`, hand-written SVG with text kept as live `<text>` so it stays sharp and searchable.

Three columns, left to right: **In the truck**, **On the Arduino UNO Q**, **On your Mac**.

Solid (works today):
- OBD-II port → OBDLink MX+ → Bluetooth → UNO Q Linux side (`obd_tcp_bridge.py`, passes bytes through, blocks "clear codes") → Wi-Fi TCP :35000 → Tattlestone Network Mode.
- OBDLink MX+ → Bluetooth → Tattlestone directly, labelled "no Arduino needed".
- USB-C power bank → UNO Q.
- Callout: emulator mode, where the UNO Q answers on its own (`elm327_emulator.py`) and the Mac reaches it through an SSH tunnel.

Dashed, in Signal orange, labelled "coming later":
- Fuse slot → test lead → inline fuse → INA260 → Qwiic (I2C) → UNO Q microcontroller side → readings merged into the same TCP stream.

Under the diagram, a numbered list in plain words: the truck talks, the OBDLink listens, the Arduino passes it on, the Mac shows it, and later the sensor measures the drain directly.

## 3. Developer docs and repo tidy-up

New files, built by moving text out of the current README. Content is kept and only clumsy wording is fixed:

| File | Content from the current README |
|---|---|
| `docs/DEVELOPING.md` | Getting started, prerequisites, scripts table, Docker, Testing, screenshot command |
| `docs/ARCHITECTURE.md` | Architecture diagram, connection sessions, PlatformProfile, ELM327 init sequence, repository layout, design system summary |
| `docs/HARDWARE.md` | Running against real hardware, Hardware (Path A/B, do-not-use list), link to `hardware/fuse-sensor-parts-list.md` |
| `docs/SECURITY.md` | Security notes, the read-only command block list from Safety, the automated review pipeline |
| `CHANGELOG.md` | What's new and the bug-fix lists, plus Known issues under an "Open" heading |

`docs/hardware/fuse-sensor-parts-list.md` is committed on this branch (it is linked from the diagram section).

Moved with `git mv` to `docs/history/`: `OBD2_Mac_App_Prompt.md`, `DELIVERABLES_MANIFEST.txt`, `README_SILVERADO_DX_PROJECT.md`, `HARDWARE_SOFTWARE_COMPATIBILITY_REVIEW.md`, `build_summary.js`, `shopping-list.html`. Links that pointed at them are updated.

`files/README.md` is replaced with a short pointer to the root README and `docs/DEVELOPING.md`.

Not moved: `CLAUDE.md`, `skills-lock.json`, `docker-compose.yml`, `.kiro/`, `.agents/`, `.claude/`, `eval/`. They are tool config that must stay at the root.

## 4. Branding on GitHub

- `brand/github/readme-banner-light.svg` and `-dark.svg`: lockup plus the one-liner, Paper background for light and Basalt for dark.
- `brand/github/social-preview.svg` and `social-preview.png`, 1280×640, rendered by a new `brand/build_social.py` in the same style as `build_icon.py`. The user uploads it in Settings → General → Social preview, because the GitHub API cannot set it.
- About box, set with `gh repo edit` only after the user approves the PR:
  - Description: "Mac app that reads your car's computers and finds what's draining the battery."
  - Topics: `obd2`, `obd-ii`, `macos`, `electron`, `arduino`, `car-diagnostics`, `parasitic-draw`, `elm327`.
- Colour use: only Basalt, Signal and Paper. Signal is used only for the "coming later" parts of the diagram and the dot in the mark.

## 5. Screenshots

- `cd files && npm run build && node scripts/capture-screens.mjs .screens/current`. The harness walks every sidebar entry (`[data-screen]`) and names each PNG by screen id, so it writes about 20 files to the scratch folder.
- Copy into `docs/screenshots/` only the screens the README shows: the nine existing names (connect, draw, dtc, ecubus, engine, health, live, modules, settings) plus the Recalls & bulletins screen. File names follow the harness's screen ids, and README paths match them.
- Look at every image before committing: the brand is visible, there's no personal data or API key, and nothing is clipped.

## 6. Git

- The user's uncommitted `files/src/main/main.ts` and untracked `files/scripts/bt-*.cjs` are never staged. Every commit names its paths explicitly.
- Commits, in order: spec; brand/github assets and `build_social.py`; docs split and `git mv` to `docs/history/`; screenshots; README.
- Push, then open a PR with base `feat/tattlestone-brand`.

## 7. Verification

- A script resolves every relative link and image path in the README and the new docs files and fails on any miss.
- Every README claim is checked against the code: read-only (the ELM327 command-layer block list), 87 PIDs, the 371 + 9,533 code counts, emulator voltage values, port 35000, and that Mode 04 is dropped by the bridge.
- A humanizer pass on the README, with each flagged line fixed or justified.
- The user views the README rendered on the PR branch in GitHub light and dark mode.

## Out of scope

- Building the fuse sensor or its firmware.
- Merging #8, #9 or #10.
- A GitHub Pages site, a logo redesign, or changes to the app's UI.
