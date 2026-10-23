# GitHub Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the developer-facing README with a short, plain-language, branded one, add an Arduino flow diagram, refresh the screenshots, move technical material into `docs/`, and brand the GitHub repo page.

**Architecture:** Mostly content work. The one piece of code is a Markdown link checker (`files/scripts/check-doc-links.mjs`, node:test, same pattern as `check-styles.mjs`). It gates every docs task. Brand images are hand-written SVGs. The social PNG is drawn with Pillow, the same way `brand/build_icon.py` works. Screenshots come from the existing `capture-screens.mjs` harness.

**Tech Stack:** Markdown, SVG, Python 3 + Pillow, Node 22 `node:test`, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-19-github-redesign-design.md`

## Change from the spec (decided while planning, 2026-10-22)

- **Base branch.** PRs #10 and #11 have merged into their parent branches, and `fix/adapter-link-robustness` (PR #12 → `main`) now holds the brand, Network Mode and the newer bridge fixes. `docs/github-redesign` is rebuilt on `fix/adapter-link-robustness`, and its PR targets that branch, not `feat/tattlestone-brand`.
- **Social preview source.** No SVG renderer is installed (no cairosvg, rsvg-convert or Inkscape), so `build_social.py` draws the PNG directly with Pillow and there is no `social-preview.svg`.
- **Screenshot name.** The harness names the drain screen `parasite.png`. `draw.png` is deleted and the README uses `parasite.png`.

## Global Constraints

- Colours: Basalt `#16171A`, Signal `#E8590C`, Paper `#F5F3EE` only. Signal is used only for the "coming later" parts of the diagram and the dot in the mark.
- README under 150 lines of Markdown.
- Banned in README and new docs: "seamless", "robust", "powerful", "comprehensive", "leverage", "empower", "Whether you're", emoji in headings, bold-label bullet lists, chains of em dashes, a closing summary sentence.
- One-liner, exact: "Tattlestone plugs into your car and tells you what it's been keeping quiet about."
- About description, exact: "Mac app that reads your car's computers and finds what's draining the battery."
- Topics, exact: `obd2`, `obd-ii`, `macos`, `electron`, `arduino`, `car-diagnostics`, `parasitic-draw`, `elm327`.
- Never stage `ARDUINO_SIGNAL_LAB_PROMPT.md` or any file this plan doesn't name. Every `git add` lists paths explicitly.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `gh repo edit` runs only after the user approves the PR.

## Review Focus

1. **GitHub dark mode.** An SVG with a transparent background shows dark text on a dark page. Every banner and diagram SVG must paint a full-size background `<rect>`. Pinned by the background check in Tasks 2 and 3.
2. **Links inside code.** Paths shown in fenced code blocks or inline code (such as `docs/screenshots`) aren't links and must not be flagged. Pinned by `ignores links in code` in Task 1.
3. **Fragments and nested files.** `docs/HARDWARE.md#path-a` must resolve to the file, and a link in `docs/X.md` must resolve relative to `docs/`, not the repo root. Pinned by `strips fragments` and `resolves relative to the file` in Task 1.
4. **Phone width.** The GitHub mobile app shrinks a wide diagram until it can't be read. The diagram viewBox is at most 1200 wide, its smallest text is 15 units, and the README embeds it with `width="100%"`. Checked by eye in Task 3.
5. **Private data in screenshots.** The assistant and settings screens could show an API key or a home path. The harness uses a throwaway profile, and every PNG is opened and looked at before commit (Task 5).

---

### Task 0: Rebuild the branch on the current tip

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-github-redesign-design.md` (the `Branch:` line)

- [ ] **Step 1: Recreate the branch**

```bash
cd /Users/joshuajohnson/Tattlestone/agador-spartacus
git switch fix/adapter-link-robustness && git pull --ff-only
git branch -m docs/github-redesign docs/github-redesign-old
git switch -c docs/github-redesign
git cherry-pick bab1b45
```
Expected: one commit ahead of `fix/adapter-link-robustness`, and `git status` shows only `?? ARDUINO_SIGNAL_LAB_PROMPT.md` and `?? docs/hardware/`.

- [ ] **Step 2: Fix the spec's branch line** to read `Branch: docs/github-redesign, cut from fix/adapter-link-robustness, PR stacked on #12`.

- [ ] **Step 3: Commit and drop the old branch**

```bash
git add docs/superpowers/specs/2026-10-19-github-redesign-design.md docs/superpowers/plans/2026-10-22-github-redesign.md
git commit -m "docs(plan): GitHub page redesign; rebase on #12"
git branch -D docs/github-redesign-old
```

---

### Task 1: Markdown link checker

**Files:**
- Create: `files/scripts/check-doc-links.mjs`
- Test: `files/scripts/check-doc-links.test.mjs`

**Interfaces:**
- Produces: `export function findBrokenLinks(mdPath: string): Array<{ link: string, line: number }>`. CLI: `node scripts/check-doc-links.mjs <file.md>...` prints `path:line  link` for each miss and exits 1 if any, 0 otherwise. Later tasks run it from `files/` against `../README.md ../docs/*.md ../CHANGELOG.md ../files/README.md`.

Checks Markdown `[text](target)` and `![alt](target)`, HTML `src="…"` and `srcset="…"`. Skips `http:`, `https:`, `mailto:` and `#…` targets. Strips `#fragment` and `?query`, URL-decodes, and resolves relative to the Markdown file's directory. Ignores anything inside fenced code blocks or inline backticks.

- [ ] **Step 1: Write the failing tests** in `check-doc-links.test.mjs`. Each test writes fixture files into `mkdtempSync(os.tmpdir())`:

```js
test('flags a missing relative link', () => {
  // README.md: "[a](docs/nope.md)" on line 3
  assert.deepEqual(findBrokenLinks(readme), [{ link: 'docs/nope.md', line: 3 }]);
});
test('passes an existing file and image', ...);        // [a](docs/a.md) ![b](img/b.png), both created → []
test('skips external and anchor links', ...);          // https://x, mailto:x, #top → []
test('checks <img src> and <source srcset>', ...);     // srcset="brand/missing.svg" → flagged
test('strips fragments and queries', ...);             // [h](docs/a.md#path-a), docs/a.md exists → []
test('resolves relative to the file', ...);            // docs/X.md contains [p](../brand/l.svg), brand/l.svg exists → []
test('ignores links in code', ...);                    // ```\n[a](nope.md)\n``` and `[b](nope2.md)` → []
test('decodes %20 in paths', ...);                     // [s](my%20file.md), "my file.md" exists → []
```

- [ ] **Step 2: Run, expect failure**

Run: `cd files && node --test scripts/check-doc-links.test.mjs`
Expected: FAIL, `Cannot find module './check-doc-links.mjs'`.

- [ ] **Step 3: Implement `findBrokenLinks` and the CLI** in `check-doc-links.mjs`. Use Node built-ins only. Track fence state line by line, and blank out inline-code spans before matching.

- [ ] **Step 4: Run, expect pass**

Run: `cd files && node --test scripts/check-doc-links.test.mjs && npm test`
Expected: 8 new tests pass and the full suite stays green (188 pass on #12).

- [ ] **Step 5: Baseline run.** `cd files && node scripts/check-doc-links.mjs ../README.md`. Expected: exit 0 on today's README. If not, note the misses; the README is replaced in Task 6.

- [ ] **Step 6: Commit**

```bash
git add files/scripts/check-doc-links.mjs files/scripts/check-doc-links.test.mjs
git commit -m "chore(docs): link checker for README and docs"
```

---

### Task 2: README banner and social preview

**Files:**
- Create: `brand/github/readme-banner-light.svg`, `brand/github/readme-banner-dark.svg`
- Create: `brand/build_social.py`, output `brand/github/social-preview.png`

**Interfaces:**
- Consumes: the mark and wordmark paths in `brand/tattlestone-lockup.svg` and `tattlestone-wordmark-reversed.svg`. Copy their `<path>` data; don't redraw them.
- Produces: the two banner files, referenced by the README in Task 6.

- [ ] **Step 1: Write the banners.** viewBox `0 0 1200 300`. A full-size background rect: Paper for light, Basalt for dark. The lockup is centred-left at 70% of the old 440px scale. The one-liner sits under it as `<text>`, `font-family="-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif"`, 28px, Basalt on light and Paper on dark. Light uses the lockup's paths; dark uses the reversed wordmark's.

- [ ] **Step 2: Write `build_social.py`.** It writes a 1280×640 RGB PNG to `brand/github/social-preview.png`: Basalt background, the stone-and-T mark at left in Paper with the Signal dot (same geometry as `build_icon.py`), "Tattlestone" in `/System/Library/Fonts/HelveticaNeue.ttc` Bold (index 1) at 120px in Paper, and the one-liner at 40px in Paper at 70% opacity. Keep 80px of margin on every side, because GitHub crops the edges in some views.

- [ ] **Step 3: Verify**

```bash
cd brand && python3 build_social.py
python3 -c "from PIL import Image; im=Image.open('github/social-preview.png'); assert im.size==(1280,640), im.size; print('ok')"
xmllint --noout github/readme-banner-*.svg
grep -c '<rect[^>]*width="1200"[^>]*height="300"' github/readme-banner-light.svg github/readme-banner-dark.svg
qlmanage -t -s 1200 -o /private/tmp/claude-501/banner github/readme-banner-*.svg >/dev/null
```
Expected: `ok`, xmllint silent, each grep count `1`. Open the two qlmanage PNGs and `social-preview.png` with Read and check them by eye: nothing clipped, the mark matches the app icon, and the text is readable.

- [ ] **Step 4: Commit**

```bash
git add brand/github/readme-banner-light.svg brand/github/readme-banner-dark.svg brand/build_social.py brand/github/social-preview.png
git commit -m "feat(brand): GitHub banner and social preview card"
```

---

### Task 3: Arduino flow diagram

**Files:**
- Create: `brand/github/arduino-flow-light.svg`, `brand/github/arduino-flow-dark.svg`

**Interfaces:**
- Produces: the two diagram files, embedded by the README in Task 6 through `<picture>` with `width="100%"`.

Content is fixed by spec section 2. Layout rules:
- viewBox `0 0 1200 640`, with a full-size background rect (Paper or Basalt).
- Three column headers: "In the truck", "On the Arduino UNO Q", "On your Mac".
- Solid strokes for working paths. Dashed (`stroke-dasharray="8 6"`) Signal strokes and a "coming later" label for the INA260 path.
- Arrow labels: "Bluetooth", "Wi-Fi · port 35000", "Qwiic (I2C)", "Bluetooth, no Arduino needed".
- UNO Q box, Linux side: "obd_tcp_bridge.py — passes data through, blocks 'clear codes', starts on boot". The systemd units exist on #12.
- Emulator callout: "No adapter? elm327_emulator.py answers instead. Reach it over an SSH tunnel."
- All text is `<text>` at 15 units or larger, in the banner's font stack. Arrowheads use one `<marker>` per colour.

- [ ] **Step 1: Write `arduino-flow-light.svg`.**
- [ ] **Step 2: Derive `arduino-flow-dark.svg`.** Swap Paper and Basalt; Signal stays.
- [ ] **Step 3: Verify**

```bash
cd brand/github && xmllint --noout arduino-flow-*.svg
grep -c '<rect[^>]*width="1200"[^>]*height="640"' arduino-flow-light.svg arduino-flow-dark.svg
grep -o 'font-size="[0-9]*"' arduino-flow-light.svg | sort -u
qlmanage -t -s 1200 -o /private/tmp/claude-501/diagram arduino-flow-*.svg >/dev/null
```
Expected: xmllint silent, each count `1`, no font-size below 15. Open both PNGs with Read: arrows point the right way, no text overlaps, the dashed path is clearly separate, and it reads at half size (the phone-width check).

- [ ] **Step 4: Commit**

```bash
git add brand/github/arduino-flow-light.svg brand/github/arduino-flow-dark.svg
git commit -m "docs(brand): Arduino UNO Q flow diagram"
```

---

### Task 4: Developer docs, history move, parts list

**Files:**
- Create: `docs/DEVELOPING.md`, `docs/ARCHITECTURE.md`, `docs/HARDWARE.md`, `docs/SECURITY.md`, `CHANGELOG.md`
- Move (`git mv`) to `docs/history/`: `OBD2_Mac_App_Prompt.md`, `DELIVERABLES_MANIFEST.txt`, `README_SILVERADO_DX_PROJECT.md`, `HARDWARE_SOFTWARE_COMPATIBILITY_REVIEW.md`, `build_summary.js`, `shopping-list.html`
- Add: `docs/hardware/fuse-sensor-parts-list.md` (already written, untracked)
- Replace: `files/README.md`

**Interfaces:**
- Consumes: `check-doc-links.mjs` (Task 1).
- Produces: the five doc paths above. The README's "For developers" section in Task 6 links exactly these.

Section mapping is in the spec, section 3. Text moves from the current README with its wording kept, except for three things: links are re-pointed for the new location, references to the moved history files point into `history/`, and banned words from Global Constraints are cut. Add to `CHANGELOG.md` a top entry for #12 (dead-link detection, late-reply resync, `BRIDGE ERROR: <reason>`, systemd units, "Connection failed: <reason>"), taken from the PR #12 body.

`files/README.md` becomes exactly:

```markdown
# Tattlestone app source

This folder is the Electron app. Start with the [main README](../README.md), then [docs/DEVELOPING.md](../docs/DEVELOPING.md) to build and run it.
```

- [ ] **Step 1: Move the history files** with `git mv` (one command per file), then `grep -rn` the repo for each old filename outside `docs/history/` and `.git/`. Expected: the only hits are in the README, which Task 6 replaces.
- [ ] **Step 2: Write the five docs and the `files/README.md` pointer.**
- [ ] **Step 3: Verify links and word rules**

```bash
cd files && node scripts/check-doc-links.mjs ../docs/DEVELOPING.md ../docs/ARCHITECTURE.md ../docs/HARDWARE.md ../docs/SECURITY.md ../CHANGELOG.md ../README.md
grep -niE "seamless|robust|powerful|comprehensive|leverage|empower|whether you're" ../docs/*.md ../CHANGELOG.md
```
Expected: the checker exits 0 and grep prints nothing.

- [ ] **Step 4: Commit**

```bash
git add docs/DEVELOPING.md docs/ARCHITECTURE.md docs/HARDWARE.md docs/SECURITY.md CHANGELOG.md files/README.md docs/hardware/fuse-sensor-parts-list.md docs/history
git commit -m "docs: split developer docs out of the README; move old project files to docs/history"
```
(`git mv` already staged the deletions at the root.)

---

### Task 5: Fresh screenshots

**Files:**
- Replace: `docs/screenshots/{connect,dtc,ecubus,engine,health,live,modules,settings}.png`
- Create: `docs/screenshots/parasite.png`, `docs/screenshots/recalls.png`
- Delete: `docs/screenshots/draw.png`

- [ ] **Step 1: Capture**

```bash
cd files && npm run build && node scripts/capture-screens.mjs .screens/current
ls .screens/current
```
Expected: one PNG per screen id (20: allpids, assistant, compare, connect, dtc, ecubus, electrical, engine, freezeframes, health, hvac, live, logger, logs, modules, parasite, pcm, recalls, settings, transmission).

The simulator only fills the screens after it connects. If `health.png` shows an empty "not connected" state, check whether the harness clicks **Launch Emulator**. If it doesn't, add that click as one step in `capture-screens.mjs`, matching how it already finds `[data-screen]` entries, and commit it on its own: `fix(capture): connect the simulator before capturing`.

- [ ] **Step 2: Look at all 10 chosen PNGs** with Read. Check that the brand shows in the sidebar and toolbar, there's no API key, no `/Users/` path and no real VIN (only the simulator's `1GCEK19T44E123456`), nothing is clipped, and the screen has data in it.
- [ ] **Step 3: Copy them in and remove the old one**

```bash
for s in connect dtc ecubus engine health live modules settings parasite recalls; do cp files/.screens/current/$s.png docs/screenshots/; done
git rm docs/screenshots/draw.png
```

- [ ] **Step 4: Commit**

```bash
git add docs/screenshots/*.png
git commit -m "docs(screenshots): recapture every screen with the Tattlestone brand"
```

---

### Task 6: The new README

**Files:**
- Replace: `README.md`

**Interfaces:**
- Consumes: banner SVGs (Task 2), diagram SVGs (Task 3), docs paths (Task 4), screenshot names (Task 5).

The section order and contents are fixed by spec section 1. Write it from a blank file; don't edit the old one. Facts to use, all checked against the code on 2026-10-22:
- Curated GM codes: 371. Generic codes: 9,533.
- Simulator battery: 12.89 V falling toward 11.8 V. Preloaded codes: `B1982`, `P0300`, `U0100`.
- Network Mode port: 35000. The bridge drops Mode 04.
- Minimum macOS: 13.
- Install from source: `npm run install:app` (builds and copies to `/Applications`).

Check before writing it in: the number of PIDs. Run `node -e "require('ts-node/register');console.log(require('./src/core/pidCatalog.ts').PID_CATALOG.length)"` from `files/` with `TS_NODE_TRANSPILE_ONLY=1`. Use the printed number, or leave the count out.

The "Credits" section copies today's attribution list word for word (it's a licence obligation).

- [ ] **Step 1: Write `README.md`.** Screenshots: the large four are health, live, dtc and parasite. The two-column table holds connect, engine, modules, recalls, ecubus and settings.
- [ ] **Step 2: Humanizer pass.** Invoke the `humanizer` skill on `README.md`. Fix every flagged line, or note in the commit body why it stays.
- [ ] **Step 3: Verify**

```bash
cd files && node scripts/check-doc-links.mjs ../README.md
wc -l ../README.md
grep -niE "seamless|robust|powerful|comprehensive|leverage|empower|whether you're|—.*—" ../README.md
grep -c "Tattlestone plugs into your car and tells you what it's been keeping quiet about." ../README.md
```
Expected: the checker exits 0, line count < 150, the banned-word grep prints nothing, and the one-liner count is `1`.

- [ ] **Step 4: Check the claims.** For each sentence in "What it does" and "It only listens", name the file that backs it, in the commit body. The read-only claim cites the block list in `src/core/elm327Commander.ts`.
- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite in plain language with the Arduino diagram"
```

---

### Task 7: Publish

- [ ] **Step 1: Full check**

```bash
cd files && npm test && node scripts/check-doc-links.mjs ../README.md ../docs/*.md ../CHANGELOG.md ../files/README.md
```
Expected: all pass, exit 0.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin docs/github-redesign
gh pr create --base fix/adapter-link-robustness --title "docs: plain-language README, Arduino diagram, Tattlestone branding" --body "<summary of tasks 1–6, the social-preview upload note, test plan; ends with the Claude Code line>"
```
Then bind the PR with the ccd_pr tools.

- [ ] **Step 3: User review.** Ask the user to view the README on the PR branch in GitHub's light and dark themes, and on a phone.
- [ ] **Step 4: After the user approves, set the About box**

```bash
gh repo edit jmjohns9/Tattlestone --description "Mac app that reads your car's computers and finds what's draining the battery." --add-topic obd2,obd-ii,macos,electron,arduino,car-diagnostics,parasitic-draw,elm327
gh repo view jmjohns9/Tattlestone --json description,repositoryTopics
```
Expected: the description and all 8 topics come back.

- [ ] **Step 5: Hand over the social card.** Send `brand/github/social-preview.png` with SendUserFile and tell the user: Settings → General → Social preview → Edit → Upload.
