# macOS-Native Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Project Agador Spartacus so it looks and behaves like a first-party macOS pro app. That means a native sidebar and toolbar, SF typography, Apple system colors, and automatic light/dark, with no change to app logic.

**Architecture:** Design tokens live in `theme/theme.ts` and are emitted as CSS custom properties under `prefers-color-scheme`. The main process drives appearance through `nativeTheme.themeSource`. Shared components are rebuilt in `components/ui/*` and re-exported from the existing `components/layout/UIComponents.tsx` barrel, so no screen import breaks. Legacy CSS variable names and legacy component names stay as aliases or wrappers until every screen is swept, then get deleted.

**Tech Stack:** Electron 42, React 18, TypeScript 5 (strict), Zustand 4, Recharts 2, Tabler Icons webfont, `node:test` with the existing `ts-node` devDependency for tests.

**Spec:** `docs/superpowers/specs/2026-09-26-macos-redesign-design.md`

**Prerequisite:** Execute the code-review plan first, then rebase this branch onto its result before Task 1.

**Working directory for every command:** `files/` (e.g. `/Users/joshuajohnson/projects/obd/GIT/agador-spartacus/files`), unless a path starts with `../`.

## Global Constraints

- `contextIsolation: true` and `nodeIntegration: false` stay on every window.
- No new runtime or dev dependencies. Tests use `node:test` plus the existing `ts-node`.
- Nothing may write to a control module. This work never touches `src/core/`.
- `src/core/` keeps zero Electron imports.
- Styling stays as inline React style objects plus CSS custom properties. No CSS modules, Tailwind or styled-components.
- UI font: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`. Data font: `ui-monospace, 'SF Mono', Menlo, monospace` with `tabular-nums`, used only for numbers, VINs, hex and PID IDs.
- Type scale (px): caption 11, body 13, headline 15, title3 17, title2 22, title1 28, display 34. No rendered text below 11px.
- No `textTransform: 'uppercase'` and no `letterSpacing` on labels or headers. Use sentence case.
- Spacing on a 4pt grid (4, 8, 12, 16, 20, 24, 32). Radius: controls 6, cards 10, panels 12. Borders are 1px `var(--separator)`.
- Status text colors must reach at least 4.5:1 contrast on `grouped` and `content` backgrounds in both appearances.
- Motion is 150–250ms ease-out, and `prefers-reduced-motion: reduce` disables it.
- Icons are Tabler at 16px in chrome.
- The app must build and run after every commit.
- Bugs noticed during the sweep go in `../docs/superpowers/code-review-notes.md`. Don't fix them in this plan unless a task says to.

## Review Focus

1. **Appearance override vs. macOS setting.** A user who picks Dark while macOS is Light expects the whole window to be dark, sidebar material included, and still dark after a restart. This is pinned by `appearance.test.ts` (Task 2): round-trip, corrupt file and invalid values.
2. **Light-mode status text contrast.** Orange or green text on white is the classic AA failure. This is pinned by the contrast test in `theme.test.ts` (Task 1), run over every `*-text` token in both palettes.
3. **Missing or garbage readings.** `—`, `''`, `NaN`, `undefined`, and `min === max` gauges must render a quiet placeholder, never "NaN", and never an SVG path containing `NaN`. This is pinned by `logic.test.ts` and `gaugeGeometry.test.ts` (Task 3).
4. **Keyboard use.** Arrow keys move a segmented control's selection. ⌘, opens Settings and ⌃⌘S toggles the sidebar, and plain S or `,` while typing must not trigger either. This is pinned by `logic.test.ts` (Task 4) and `shellLogic.test.ts` (Task 5).
5. **Blocked `localStorage`.** When storage throws, the sidebar defaults to open and nothing crashes. This is pinned by `shellLogic.test.ts` (Task 5).

---

## Sweep Procedure (used by Tasks 7–13)

Apply these steps to one screen file at a time. Make one commit per screen.

**S1: Baseline.** Run `node scripts/check-styles.mjs src/renderer/screens/<File>.tsx` and note the violation count. Also run `grep -nE "onClick|onChange|onSubmit" src/renderer/screens/<File>.tsx`. Every handler it lists is a control you must exercise in S6.

**S2: Replace, using this mapping table.**

| Old | New |
|---|---|
| `<HeroCard label value unit subtext valueColor pid sparkColor staleAt />` | `<Metric size="hero" label value unit subtext status={…} spark={{ pid, color: sparkColor }} staleAt />` |
| `<MetricTile … prominence="hero" />` | `<Metric size="hero" span={2} … />` |
| `<MetricTile … />` | `<Metric … />` (`barColor` becomes a status or is omitted; `accentColor` is deleted) |
| `<DenseMetricTile … />` | `<Metric size="compact" … />` (`accentBorder` is deleted; `subtextColor` becomes `subtextStatus`) |
| `<ArcGauge … />` | `<Gauge … />`, with the same threshold props |
| `<CompactArcGauge label value max unit color />` | `<Gauge size="compact" label value max unit />` |
| `valueColor="var(--sr)"` | `status="crit"` |
| `valueColor="var(--sa)"` | `status="warn"` |
| `valueColor` of `var(--sg)`, `var(--gb)`, `var(--pp)`, `var(--tw)` or `var(--tm)` | delete the prop (neutral) |
| `valueColor={x > a ? 'var(--sr)' : x > b ? 'var(--sa)' : 'var(--sg)'}` | `status={x > a ? 'crit' : x > b ? 'warn' : 'neutral'}` |
| `'#9B8AFF'` (battery purple) | `'var(--purple)'`, only as a bar or spark series color |
| `'#000'` / `'#0B0B0B'` text on an accent fill | `<Button variant="primary">`, or `'var(--on-accent)'` for non-button fills |
| A hand-rolled uppercase heading `<div style={{ fontSize: 9–11, letterSpacing, textTransform: 'uppercase' }}>` | `<SectionHeader>` |
| A hand-rolled group of toggle or tab buttons | `<SegmentedControl ariaLabel=… options=… value=… onChange=… />` |
| A raw `<button style={{…}}>` | `<Button variant="primary" \| "secondary" \| "plain" \| "destructive" size="sm" \| "md" icon="ti-…">` |
| `fontFamily: FONTS.mono` on a number, VIN, hex or PID | `...NUMERIC` (import `NUMERIC` from `../theme/theme`) |
| `fontFamily: FONTS.mono` or `FONTS.body` on words | delete |
| `letterSpacing: …`, `textTransform: 'uppercase'` | delete, and rewrite any ALL-CAPS string literal in JSX to sentence case (`'CONNECTED'` → `'Connected'`) |
| `fontSize` 7–12 | `...TYPE.caption` (11) or `...TYPE.body` (13) |
| A panel `<div style={{ background: 'var(--bg2)', border… }}>` | `<Card>` |
| Row separators `borderBottom: '1px solid …'` | `<DataRow>` or `<Divider />` |
| `rgba(…)` tint backgrounds | `var(--accent-tint)`, `var(--ok-tint)`, `var(--warn-tint)`, `var(--crit-tint)` or `var(--fill)` |
| `var(--bg3)` / `var(--bg4)` wells and tracks | `var(--fill)` / `var(--fill-strong)` |
| `var(--tw)` / `var(--tm)` / `var(--br)` | `var(--label)` / `var(--label-2)` / `var(--separator)` |
| `var(--pp)` | `var(--accent-text)` for text, `var(--accent)` for fills and strokes |
| `var(--sg)` / `var(--sa)` / `var(--sr)` | `var(--ok-text)` / `var(--warn-text)` / `var(--crit-text)` for text; `var(--ok)` / `var(--warn)` / `var(--crit)` for fills |
| A panel that shows only `—` or nothing when there is no data | `<EmptyState icon="ti-…" title="No data yet" message="…one line…" />` |
| `animation: 'blink …'` status dots | `className="pulse"` (the keyframes live in `GLOBAL_CSS`) |
| Recharts `stroke`/`fill` hex values | `'var(--accent)'` or the series vars `var(--teal)`, `var(--indigo)`, `var(--purple)`, `var(--pink)`; axis `tick={{ fill: 'var(--label-2)', fontSize: 11 }}`; grid `stroke="var(--separator)"` |

A line may keep a flagged pattern only with a trailing `// style-ok: <reason>` comment, for example a dynamic data-series color that no token can express. Aim for zero such lines. Each one needs a written reason.

**S3: Lint.** Run `node scripts/check-styles.mjs src/renderer/screens/<File>.tsx`. Expected: `0 violations`.

**S4: Types.** Run `npm run typecheck`. Expected: exit 0, no output.

**S5: Visual.** Run `npm run build && node scripts/capture-screens.mjs .screens/after --only <screenId>`. Open `.screens/after/<screenId>-light.png`, `.screens/after/<screenId>-dark.png` and `.screens/before/<screenId>-dark.png` with the Read tool. All of these must hold:
- No text smaller than 11px.
- No ALL-CAPS labels.
- Values in the normal range are not colored.
- Cards align to one grid.
- Both appearances are legible.
- No clipped text at 1400×900.

**S6: Behavior.** Run `npm run build && npx electron .`. In simulator mode, trigger every handler from S1's list, plus the screen-specific flows named in the task. Behavior must match the pre-change app.

**S7: Commit.** Run `git add src/renderer/screens/<File>.tsx && git commit -m "style(renderer): restyle <Screen> for macOS design"`.

---

### Task 1: Test runner, style linter, screenshot harness, design tokens

**Files:**
- Modify: `package.json` (scripts)
- Modify: `tsconfig.main.json` (exclude tests)
- Modify: `../.gitignore`
- Create: `scripts/check-styles.mjs`
- Create: `scripts/check-styles.test.mjs`
- Create: `scripts/capture-screens.mjs`
- Rewrite: `src/renderer/theme/theme.ts`
- Create: `src/renderer/theme/theme.test.ts`
- Create: `src/renderer/theme/globalStyles.ts`
- Modify: `src/renderer/App.tsx:3`, `:152-155`, `:408-420` (theme wiring, `data-screen` attr), `:513-632` (global CSS)
- Modify: `src/renderer/index.html` (transparent body)

**Interfaces:**
- Produces, from `theme.ts`:
  - `type Status = 'neutral' | 'ok' | 'warn' | 'crit'`
  - `interface Thresholds { warnLow?: number; warnHigh?: number; critLow?: number; critHigh?: number }`
  - `LIGHT`, `DARK` (palette records with identical keys), `DERIVED`, `LEGACY_ALIASES`
  - `buildThemeCSS(): string`
  - `FONTS { ui, mono, body, display }`, where `body` and `display` are legacy aliases of `ui`
  - `TYPE { caption, body, headline, title3, title2, title1, display }` (each a `CSSProperties`)
  - `WEIGHT`, `NUMERIC: CSSProperties`, `SPACE`, `RADIUS { control: 6, card: 10, panel: 12 }`, `MOTION`
  - `STATUS_TEXT: Record<Status, string>`, `STATUS_FILL: Record<Status, string>`
  - `statusFor(value: number, t: Thresholds): Status`
  - `valueColor(...)` (legacy) and `gaugeArc(...)` (legacy, unchanged; deleted in Task 4)
- Produces, from `globalStyles.ts`: `GLOBAL_CSS: string`, `LEGACY_CSS: string`.
- Produces, from `scripts/check-styles.mjs`: `checkSource(src: string): Array<{ line: number; rule: string; text: string }>`, plus a CLI.
- Produces, from `scripts/capture-screens.mjs`: the CLI `node scripts/capture-screens.mjs <outDir> [--only id,id]`, which writes `<outDir>/<screenId>-light.png` and `<outDir>/<screenId>-dark.png`.

- [ ] **Step 1: Install and establish the baseline**

Run: `npm install && npm run typecheck`
Expected: install succeeds and typecheck exits 0.

If `npx electron .` later fails with a `NODE_MODULE_VERSION` error for `serialport` or `better-sqlite3`, run `npx electron-builder install-app-deps`.

- [ ] **Step 2: Add the test script and exclude tests from the main build**

In `package.json` `"scripts"`, add:

```json
"test": "TS_NODE_TRANSPILE_ONLY=1 node --require ts-node/register --test \"src/**/*.test.ts\" \"scripts/*.test.mjs\"",
"lint:styles": "node scripts/check-styles.mjs"
```

In `tsconfig.main.json`, add a top-level key next to `"include"`:

```json
"exclude": ["src/**/*.test.ts"]
```

Append to `../.gitignore`:

```
# Redesign screenshot harness output
files/.screens/
```

- [ ] **Step 3: Write the failing style-linter test**

Create `scripts/check-styles.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource } from './check-styles.mjs';

test('flags raw colours, fonts, spacing, case and borders', () => {
  const src = [
    "const a = { color: '#9B8AFF' };",
    "const b = { background: 'rgba(0,0,0,0.1)' };",
    "const c = { fontFamily: FONTS.mono };",
    "const d = { letterSpacing: 1.2 };",
    "const e = { textTransform: 'uppercase' };",
    "const f = { borderBottom: '1px solid var(--br)' };",
  ].join('\n');
  const rules = checkSource(src).map(v => v.rule);
  assert.deepEqual(rules, ['hex colour', 'rgba()/rgb() literal', 'fontFamily', 'FONTS.* reference', 'letterSpacing', 'textTransform', 'border style key']);
});

test('ignores token usage, borderRadius, and style-ok lines', () => {
  const src = [
    "const a = { color: 'var(--label)', borderRadius: 6 };",
    "const b = { stroke: '#123456' }; // style-ok: chart series",
    "const c = { ...NUMERIC };",
  ].join('\n');
  assert.deepEqual(checkSource(src), []);
});

test('reports 1-based line numbers', () => {
  assert.equal(checkSource("ok\nconst x = { letterSpacing: 2 };")[0].line, 2);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `node --test scripts/check-styles.test.mjs`
Expected: FAIL with `Cannot find module` … `check-styles.mjs`.

- [ ] **Step 5: Implement the linter**

Create `scripts/check-styles.mjs`:

```js
#!/usr/bin/env node
// Flags renderer code that sets raw colours, fonts, letter-spacing, text-transform
// or borders instead of using theme tokens / shared components.
// Usage: node scripts/check-styles.mjs <file> [file…]   (exit 1 on violations)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RULES = [
  { rule: 'hex colour',            re: /['"`]#[0-9a-fA-F]{3,8}\b/ },
  { rule: 'rgba()/rgb() literal',  re: /\brgba?\(/ },
  { rule: 'fontFamily',            re: /\bfontFamily\s*[:=]/ },
  { rule: 'FONTS.* reference',     re: /\bFONTS\./ },
  { rule: 'letterSpacing',         re: /\bletterSpacing\s*:/ },
  { rule: 'textTransform',         re: /\btextTransform\s*:/ },
  { rule: 'border style key',      re: /\bborder(Top|Bottom|Left|Right)?\s*:/ },
];

export function checkSource(src) {
  const out = [];
  src.split('\n').forEach((text, i) => {
    if (text.includes('style-ok')) return;
    for (const { rule, re } of RULES) {
      if (re.test(text)) out.push({ line: i + 1, rule, text: text.trim() });
    }
  });
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  let total = 0;
  for (const f of files) {
    for (const v of checkSource(readFileSync(f, 'utf8'))) {
      total++;
      console.log(`${f}:${v.line}  ${v.rule}  ${v.text}`);
    }
  }
  console.log(`${total} violations`);
  process.exit(total ? 1 : 0);
}
```

- [ ] **Step 6: Run the linter test to verify it passes**

Run: `node --test scripts/check-styles.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 7: Add `data-screen` to the current nav buttons (needed by the capture harness)**

In `src/renderer/App.tsx`, inside the `<button className="nav-btn" …>` opening tag (around line 408), add the attribute on the line after `className="nav-btn"`:

```tsx
                  data-screen={item.id}
```

- [ ] **Step 8: Create the screenshot harness**

Create `scripts/capture-screens.mjs`:

```js
#!/usr/bin/env node
// Launches the built app with Chrome DevTools Protocol enabled, clicks every
// sidebar entry ([data-screen]) and saves light + dark PNGs of each screen.
// Native vibrancy is not captured (CDP renders web content only).
// Usage: npm run build && node scripts/capture-screens.mjs <outDir> [--only live,health]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');
const outDir = process.argv[2] ?? '.screens/current';
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1].split(',') : null;
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

mkdirSync(outDir, { recursive: true });
const child = spawn(electronBin, ['.', `--remote-debugging-port=${PORT}`], {
  stdio: 'ignore',
  env: { ...process.env, NODE_ENV: 'production' },
});

async function pageSocketUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP page target not found');
}

try {
  const ws = new WebSocket(await pageSocketUrl());
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, m => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  await sleep(5000); // simulator auto-connects and starts polling
  const ids = JSON.parse((await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('[data-screen]')].map(b => b.dataset.screen))`,
    returnByValue: true,
  })).result.value).filter(id => !only || only.includes(id));

  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    for (const id of ids) {
      await send('Runtime.evaluate', { expression: `document.querySelector('[data-screen="${id}"]').click()` });
      await sleep(1200);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path.join(outDir, `${id}-${scheme}.png`), Buffer.from(data, 'base64'));
      console.log(`saved ${id}-${scheme}.png`);
    }
  }
  ws.close();
} finally {
  child.kill();
}
```

- [ ] **Step 9: Capture the "before" screenshots**

Run: `npm run build && node scripts/capture-screens.mjs .screens/before`
Expected: 38 lines of `saved <id>-<scheme>.png`. The old theme ignores `prefers-color-scheme`, so the `-light` files look dark. That's expected.

Open `.screens/before/live-dark.png` with the Read tool and confirm it shows the Live screen.

- [ ] **Step 10: Write the failing token test**

Create `src/renderer/theme/theme.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT, DARK, DERIVED, LEGACY_ALIASES, buildThemeCSS, statusFor, STATUS_TEXT } from './theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('light and dark palettes define the same tokens', () => {
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
});

test('every *-text status token reaches 4.5:1 on grouped and content', () => {
  for (const [name, p] of [['light', LIGHT], ['dark', DARK]] as const) {
    for (const key of ['accent-text', 'ok-text', 'warn-text', 'crit-text'] as const) {
      for (const bg of ['grouped', 'content'] as const) {
        const ratio = contrast(p[key], p[bg]);
        assert.ok(ratio >= 4.5, `${name} ${key} on ${bg} = ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('every legacy alias points at a defined token', () => {
  const defined = new Set([...Object.keys(LIGHT), ...Object.keys(DERIVED)]);
  for (const [alias, target] of Object.entries(LEGACY_ALIASES)) {
    const m = /^var\(--([a-z0-9-]+)\)$/.exec(target);
    assert.ok(m && defined.has(m[1]), `--${alias} -> ${target}`);
  }
});

test('theme CSS declares light defaults and a dark media override', () => {
  const css = buildThemeCSS();
  assert.match(css, /:root \{[^}]*--label: rgba\(0,0,0,0\.85\);/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{ :root \{[^}]*--label: rgba\(255,255,255,0\.85\);/);
  assert.match(css, /--tm: var\(--label-2\);/);
});

test('statusFor maps thresholds, crit before warn, in-range is neutral', () => {
  const t = { warnHigh: 215, critHigh: 230 };
  assert.equal(statusFor(200, t), 'neutral');
  assert.equal(statusFor(220, t), 'warn');
  assert.equal(statusFor(240, t), 'crit');
  assert.equal(statusFor(Number.NaN, t), 'neutral');
  assert.equal(STATUS_TEXT.crit, 'var(--crit-text)');
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npm test`
Expected: FAIL. The theme test errors on imports (`LIGHT` is undefined / not exported).

- [ ] **Step 12: Rewrite `theme.ts`**

Replace the whole of `src/renderer/theme/theme.ts` with:

```ts
// ─── Project Agador Spartacus — macOS-native design tokens ───────────────────
// Apple system colours, SF type scale, 4pt spacing. Light/dark switch purely via
// prefers-color-scheme; the main process drives it with nativeTheme.themeSource.

import type { CSSProperties } from 'react';

export type Status = 'neutral' | 'ok' | 'warn' | 'crit';

export interface Thresholds {
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
}

// ─── Colour ──────────────────────────────────────────────────────────────────
// *-text variants are contrast-checked for body text (see theme.test.ts);
// the plain status colours are for fills, strokes and dots.

export const LIGHT = {
  window:        '#F5F5F7',
  content:       '#F5F5F7',
  grouped:       '#FFFFFF',
  elevated:      '#FFFFFF',
  fill:          'rgba(118,118,128,0.12)',
  'fill-strong': 'rgba(118,118,128,0.20)',
  label:         'rgba(0,0,0,0.85)',
  'label-2':     'rgba(0,0,0,0.55)',
  'label-3':     'rgba(0,0,0,0.40)',
  'label-4':     'rgba(0,0,0,0.10)',
  separator:     'rgba(0,0,0,0.10)',
  shadow:        'rgba(0,0,0,0.12)',
  accent:        '#007AFF',
  'accent-text': '#0066CC',
  'on-accent':   '#FFFFFF',
  ok:            '#34C759',
  'ok-text':     '#1F7A35',
  warn:          '#FF9500',
  'warn-text':   '#C93400',
  crit:          '#FF3B30',
  'crit-text':   '#D70015',
  teal:          '#30B0C7',
  indigo:        '#5856D6',
  purple:        '#AF52DE',
  pink:          '#FF2D55',
} as const;

export const DARK: Record<keyof typeof LIGHT, string> = {
  window:        '#1C1C1E',
  content:       '#1C1C1E',
  grouped:       '#2C2C2E',
  elevated:      '#3A3A3C',
  fill:          'rgba(118,118,128,0.24)',
  'fill-strong': 'rgba(118,118,128,0.36)',
  label:         'rgba(255,255,255,0.85)',
  'label-2':     'rgba(255,255,255,0.55)',
  'label-3':     'rgba(255,255,255,0.40)',
  'label-4':     'rgba(255,255,255,0.10)',
  separator:     'rgba(255,255,255,0.10)',
  shadow:        'rgba(0,0,0,0.40)',
  accent:        '#0A84FF',
  'accent-text': '#409CFF',
  'on-accent':   '#FFFFFF',
  ok:            '#30D158',
  'ok-text':     '#30D158',
  warn:          '#FF9F0A',
  'warn-text':   '#FF9F0A',
  crit:          '#FF453A',
  'crit-text':   '#FF6961',
  teal:          '#40CBE0',
  indigo:        '#5E5CE6',
  purple:        '#BF5AF2',
  pink:          '#FF375F',
};

/** Tints derived from the active palette — resolve per appearance automatically. */
export const DERIVED: Readonly<Record<string, string>> = {
  'accent-tint': 'color-mix(in srgb, var(--accent) 16%, transparent)',
  'ok-tint':     'color-mix(in srgb, var(--ok) 16%, transparent)',
  'warn-tint':   'color-mix(in srgb, var(--warn) 16%, transparent)',
  'crit-tint':   'color-mix(in srgb, var(--crit) 16%, transparent)',
  selection:     'color-mix(in srgb, var(--accent) 22%, transparent)',
};

/** Old variable names kept alive during the screen sweep. Removed in Task 13. */
export const LEGACY_ALIASES: Readonly<Record<string, string>> = {
  bg:  'var(--window)',
  bg2: 'var(--grouped)',
  bg3: 'var(--fill)',
  bg4: 'var(--fill-strong)',
  br:  'var(--separator)',
  bs:  'var(--label-4)',
  tw:  'var(--label)',
  tm:  'var(--label-2)',
  tp:  'var(--label)',
  pp:  'var(--accent-text)',
  gb:  'var(--teal)',
  sg:  'var(--ok-text)',
  sa:  'var(--warn-text)',
  sr:  'var(--crit-text)',
};

const declare = (vars: Readonly<Record<string, string>>): string =>
  Object.entries(vars).map(([k, v]) => `--${k}: ${v};`).join(' ');

export function buildThemeCSS(): string {
  return [
    `:root { color-scheme: light dark; ${declare(LIGHT)} ${declare(DERIVED)} ${declare(LEGACY_ALIASES)} }`,
    `@media (prefers-color-scheme: dark) { :root { ${declare(DARK)} } }`,
  ].join('\n');
}

export const STATUS_TEXT: Record<Status, string> = {
  neutral: 'var(--label)',
  ok:      'var(--ok-text)',
  warn:    'var(--warn-text)',
  crit:    'var(--crit-text)',
};

export const STATUS_FILL: Record<Status, string> = {
  neutral: 'var(--accent)',
  ok:      'var(--ok)',
  warn:    'var(--warn)',
  crit:    'var(--crit)',
};

export function statusFor(value: number, t: Thresholds): Status {
  if (!Number.isFinite(value)) return 'neutral';
  if ((t.critLow !== undefined && value < t.critLow) || (t.critHigh !== undefined && value > t.critHigh)) return 'crit';
  if ((t.warnLow !== undefined && value < t.warnLow) || (t.warnHigh !== undefined && value > t.warnHigh)) return 'warn';
  return 'neutral';
}

// ─── Typography ──────────────────────────────────────────────────────────────

const UI_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

export const FONTS = {
  ui:      UI_FONT,
  mono:    "ui-monospace, 'SF Mono', Menlo, monospace",
  /** @deprecated legacy alias — removed in Task 13 */
  body:    UI_FONT,
  /** @deprecated legacy alias — removed in Task 13 */
  display: UI_FONT,
} as const;

export const WEIGHT = { regular: 400, medium: 510, semibold: 590, bold: 700 } as const;

export const TYPE = {
  caption:  { fontSize: 11, lineHeight: '14px', fontWeight: WEIGHT.regular },
  body:     { fontSize: 13, lineHeight: '18px', fontWeight: WEIGHT.regular },
  headline: { fontSize: 15, lineHeight: '20px', fontWeight: WEIGHT.semibold },
  title3:   { fontSize: 17, lineHeight: '22px', fontWeight: WEIGHT.semibold },
  title2:   { fontSize: 22, lineHeight: '28px', fontWeight: WEIGHT.bold },
  title1:   { fontSize: 28, lineHeight: '34px', fontWeight: WEIGHT.bold },
  display:  { fontSize: 34, lineHeight: '40px', fontWeight: WEIGHT.bold },
} satisfies Record<string, CSSProperties>;

/** Spread onto any element showing a number, VIN, hex byte or PID id. */
export const NUMERIC: CSSProperties = { fontFamily: FONTS.mono, fontVariantNumeric: 'tabular-nums' };

// ─── Space, shape, motion ────────────────────────────────────────────────────

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const RADIUS = { control: 6, card: 10, panel: 12 } as const;
export const MOTION = { fast: '150ms ease-out', base: '200ms ease-out', slow: '250ms ease-out' } as const;

// ─── Legacy helpers (removed in Task 4 once UIComponents is rebuilt) ─────────

/** @deprecated use statusFor + STATUS_TEXT */
export function valueColor(
  value: number, warnLow?: number, warnHigh?: number, critLow?: number, critHigh?: number, _dark = true,
): string {
  return STATUS_TEXT[statusFor(value, { warnLow, warnHigh, critLow, critHigh })];
}

/** @deprecated replaced by components/ui/gaugeGeometry.ts */
export function gaugeArc(
  value: number, min: number, max: number, radius: number, sweep = 270,
): { dashArray: string; dashOffset: number } {
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const arcLength = (sweep / 360) * circumference;
  const filled = fraction * arcLength;
  const gap = circumference - filled;
  const dashOffset = -circumference * ((360 - sweep) / 2 / 360);
  return { dashArray: `${filled.toFixed(1)} ${gap.toFixed(1)}`, dashOffset };
}
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for all theme and linter tests.

- [ ] **Step 14: Create the global stylesheet module**

Create `src/renderer/theme/globalStyles.ts`:

```ts
// Global CSS injected once by App.tsx. Pseudo-classes (hover/focus/active) live
// here because inline styles cannot express them.

import { FONTS } from './theme';

export const GLOBAL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; background: transparent; }
  body {
    overflow: hidden;
    font-family: ${FONTS.ui};
    font-size: 13px; line-height: 18px;
    color: var(--label);
    -webkit-font-smoothing: antialiased;
    -webkit-user-select: none; user-select: none;
  }
  input, textarea, [contenteditable], .selectable { -webkit-user-select: text; user-select: text; }

  button { font-family: inherit; font-size: inherit; color: inherit; cursor: default; }
  :focus { outline: none; }
  :focus-visible { outline: 3px solid var(--accent-tint); outline-offset: 1px; box-shadow: 0 0 0 1px var(--accent); }

  input, select, textarea {
    font: inherit; color: var(--label);
    background: var(--grouped);
    border: 1px solid var(--separator); border-radius: 6px;
    padding: 4px 8px; min-height: 24px;
    transition: box-shadow 150ms ease-out, border-color 150ms ease-out;
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-tint);
  }
  ::placeholder { color: var(--label-3); }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--fill-strong); border-radius: 5px; border: 2px solid transparent; background-clip: padding-box; }

  .drag    { -webkit-app-region: drag; }
  .no-drag { -webkit-app-region: no-drag; }

  .ui-button { transition: filter 150ms ease-out, background 150ms ease-out; }
  .ui-button:hover:not(:disabled)  { filter: brightness(1.06); }
  .ui-button:active:not(:disabled) { filter: brightness(0.92); }

  .sidebar-row:hover:not([aria-current="page"]) { background: var(--fill) !important; }
  .row-hover:hover { background: var(--fill) !important; }
  .toolbar-item:hover { background: var(--fill) !important; }

  .metric .info-trigger { opacity: 0; transition: opacity 150ms ease-out; }
  .metric:hover .info-trigger, .info-trigger:focus-visible { opacity: 1; }

  @keyframes spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  .pulse { animation: pulse 1.8s ease-in-out infinite; }

  @keyframes screenIn { from { opacity: 0; } to { opacity: 1; } }
  .screen-enter { animation: screenIn 200ms ease-out both; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
`;

/** Class names and keyframes still referenced by unswept screens. Removed in Task 13. */
export const LEGACY_CSS = `
  @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:.3} }
  @keyframes waveAnim { 0%,100%{transform:scaleY(.2)} 50%{transform:scaleY(1)} }
  .btn { transition: filter 150ms ease-out; }
  .btn:hover:not(:disabled)  { filter: brightness(1.06); }
  .btn:active:not(:disabled) { filter: brightness(0.92); }
  .card-lift { transition: border-color 150ms ease-out; }
  .data-row:hover { background: var(--fill) !important; }
  .nav-btn:hover:not([aria-current="page"]) { background: var(--fill) !important; }
  .nav-btn[aria-current="page"] { background: var(--selection) !important; }
  @media (max-width: 800px) { .hero-grid { grid-template-columns: 1fr !important; } }
`;
```

- [ ] **Step 15: Wire the tokens into `App.tsx` and `index.html`**

In `src/renderer/App.tsx`:

1. Line 3: change the import to

   ```ts
   import { buildThemeCSS, FONTS } from './theme/theme';
   import { GLOBAL_CSS, LEGACY_CSS } from './theme/globalStyles';
   ```

2. Delete the effect at lines 152–155, the one that sets `document.documentElement.style.cssText = buildCSSVars(isDarkMode)`. Inline `style` on `<html>` would override the `:root` rules.

3. Replace the whole `<style>{`…`}</style>` block (lines 513–632) with:

   ```tsx
      <style>{`${buildThemeCSS()}\n${GLOBAL_CSS}\n${LEGACY_CSS}`}</style>
   ```

In `src/renderer/index.html`, change the inline `<style>` rule to:

```html
    html, body, #root {
      margin: 0; padding: 0;
      width: 100%; height: 100%;
      overflow: hidden;
      background: transparent;
    }
```

- [ ] **Step 16: Verify**

Run: `npm run typecheck && npm test && npm run build && node scripts/capture-screens.mjs .screens/t1 --only live,dtc`

Expected:
- All three commands pass.
- `.screens/t1/live-light.png` shows a light UI with the old layout. It will look rough, which is expected.
- `.screens/t1/live-dark.png` shows it dark.

Open both images with the Read tool.

- [ ] **Step 17: Commit**

```bash
git add package.json tsconfig.main.json ../.gitignore scripts src/renderer/theme src/renderer/App.tsx src/renderer/index.html
git commit -m "feat(theme): macOS design tokens, style linter, screenshot harness"
```

---

### Task 2: Appearance control in the main process + native window chrome

**Files:**
- Modify: `src/shared/types.ts` (append `Appearance`)
- Create: `src/main/appearance.ts`
- Create: `src/main/appearance.test.ts`
- Modify: `src/main/main.ts:1` (import), `:24-47` (`createWindow`), plus two new IPC handlers next to the `ipcMain.handle('obd:list-ports'…` block (line ~311)
- Modify: `src/main/preload.ts` (two bridge methods)
- Modify: `src/renderer/App.tsx:27-86` (`Window.electronAPI` type)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `type Appearance = 'system' | 'light' | 'dark'` in `shared/types.ts`
  - `parseAppearance(raw: unknown): Appearance`, `loadAppearance(dir: string): Appearance` and `saveAppearance(dir: string, a: Appearance): void` in `main/appearance.ts`
  - IPC `app:get-appearance` → `Appearance` and `app:set-appearance(a)` → `Appearance`
  - Renderer `window.electronAPI.getAppearance(): Promise<Appearance>` and `window.electronAPI.setAppearance(a: Appearance): Promise<Appearance>`

- [ ] **Step 1: Write the failing test**

Append to `src/shared/types.ts`:

```ts
/** Window appearance override. 'system' follows macOS. */
export type Appearance = 'system' | 'light' | 'dark';
```

Create `src/main/appearance.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseAppearance, loadAppearance, saveAppearance } from './appearance';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-'));

test('parseAppearance accepts only known values', () => {
  assert.equal(parseAppearance('dark'), 'dark');
  assert.equal(parseAppearance('light'), 'light');
  assert.equal(parseAppearance('system'), 'system');
  assert.equal(parseAppearance('DARK'), 'system');
  assert.equal(parseAppearance(42), 'system');
  assert.equal(parseAppearance(undefined), 'system');
});

test('save then load round-trips', () => {
  const dir = tmp();
  saveAppearance(dir, 'dark');
  assert.equal(loadAppearance(dir), 'dark');
});

test('missing or corrupt file falls back to system', () => {
  const dir = tmp();
  assert.equal(loadAppearance(dir), 'system');
  fs.writeFileSync(path.join(dir, 'appearance.json'), '{not json');
  assert.equal(loadAppearance(dir), 'system');
  fs.writeFileSync(path.join(dir, 'appearance.json'), JSON.stringify({ appearance: 'neon' }));
  assert.equal(loadAppearance(dir), 'system');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL with `Cannot find module './appearance'`.

- [ ] **Step 3: Implement**

Create `src/main/appearance.ts`:

```ts
// Persists the user's appearance override (System / Light / Dark) so the window
// opens in the right appearance before the renderer loads. No Electron imports —
// main.ts applies the value to nativeTheme.themeSource.

import * as fs from 'fs';
import * as path from 'path';
import type { Appearance } from '../shared/types';

const FILE = 'appearance.json';

export function parseAppearance(raw: unknown): Appearance {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function loadAppearance(dir: string): Appearance {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')) as { appearance?: unknown };
    return parseAppearance(json.appearance);
  } catch {
    return 'system';
  }
}

export function saveAppearance(dir: string, appearance: Appearance): void {
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify({ appearance }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for all tests.

- [ ] **Step 5: Native window chrome and IPC in `main.ts`**

Line 1 becomes:

```ts
import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
```

Add after the other local imports (after line 13):

```ts
import { loadAppearance, saveAppearance, parseAppearance } from './appearance';
```

Replace `createWindow` (lines 24–47) with:

```ts
function createWindow(): void {
  // Apply the saved override before the window exists so vibrancy and
  // prefers-color-scheme are correct on the very first frame.
  nativeTheme.themeSource = loadAppearance(app.getPath('userData'));

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 19 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Project Agador Spartacus',
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}
```

Directly above `ipcMain.handle('obd:list-ports', …)`, add:

```ts
// ─── Appearance ──────────────────────────────────────────────────────────────

ipcMain.handle('app:get-appearance', () => loadAppearance(app.getPath('userData')));

ipcMain.handle('app:set-appearance', (_event, value: unknown) => {
  const appearance = parseAppearance(value);
  nativeTheme.themeSource = appearance;
  saveAppearance(app.getPath('userData'), appearance);
  return appearance;
});
```

- [ ] **Step 6: Bridge and renderer typing**

In `src/main/preload.ts`, add `Appearance` to the `../shared/types` import. Then add, after `exportCSV: …,`:

```ts
  getAppearance: ()                  => ipcRenderer.invoke('app:get-appearance') as Promise<Appearance>,
  setAppearance: (a: Appearance)     => ipcRenderer.invoke('app:set-appearance', a) as Promise<Appearance>,
```

In `src/renderer/App.tsx`, add `Appearance` to the `../shared/types` import on line 4. Inside `electronAPI: { … }`, after `exportCSV: …;`, add:

```ts
      getAppearance: () => Promise<Appearance>;
      setAppearance: (a: Appearance) => Promise<Appearance>;
```

- [ ] **Step 7: Verify in the running app**

Run: `npm run typecheck && npm run build && npx electron .`

Expected:
- The window appears only once content is painted, with no flash.
- In System Settings → Appearance, switching Light/Dark flips the whole UI live.
- The left sidebar region shows the translucent material (desktop colors bleed through).

Quit the app.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/appearance.ts src/main/appearance.test.ts src/main/main.ts src/main/preload.ts src/renderer/App.tsx
git commit -m "feat(main): native window chrome, vibrancy, persisted appearance override"
```

---

### Task 3: Metric, Gauge and Sparkline primitives

**Files:**
- Create: `src/renderer/components/ui/logic.ts`
- Create: `src/renderer/components/ui/logic.test.ts`
- Create: `src/renderer/components/ui/gaugeGeometry.ts`
- Create: `src/renderer/components/ui/gaugeGeometry.test.ts`
- Create: `src/renderer/components/ui/Metric.tsx`
- Create: `src/renderer/components/ui/Gauge.tsx`
- Create: `src/renderer/components/ui/Sparkline.tsx`

**Interfaces:**
- Consumes: `Status`, `Thresholds`, `statusFor`, `STATUS_TEXT`, `STATUS_FILL`, `TYPE`, `WEIGHT`, `NUMERIC`, `RADIUS` and `MOTION` from `theme/theme.ts`.
- Produces, from `logic.ts`:
  - `statusFromLegacyColor(c?: string): Status`
  - `clampPercent(n: number): number`
  - `isMissing(v: unknown): boolean`
  - `nextIndex(i: number, key: string, len: number): number | null`
- Produces, from `gaugeGeometry.ts`:
  - `GAUGE_START = -120`, `GAUGE_END = 120`
  - `polar(cx, cy, r, deg): { x: number; y: number }`
  - `describeArc(cx, cy, r, fromDeg, toDeg): string`
  - `gaugeFraction(value, min, max): number`
  - `sparkPath(values: number[], w: number, h: number): { line: string; area: string } | null`
- Produces, from `Metric.tsx`:
  - `Metric(props: MetricProps)`, where `MetricProps = { label: string; value: string | number; unit?: string; subtext?: string; status?: Status; subtextStatus?: Status; barPercent?: number; barStatus?: Status; tooltip?: React.ReactNode; staleAt?: number; staleAfterMs?: number; size?: 'hero' | 'regular' | 'compact'; span?: 1 | 2; spark?: { pid: string; color?: string } }`
  - `useStaleness(staleAt?: number, afterMs?: number): boolean`
- Produces, from `Gauge.tsx`: `Gauge(props: GaugeProps)`, where `GaugeProps = Thresholds & { label: string; value: number; min?: number; max: number; unit?: string; size?: 'regular' | 'compact'; color?: string; staleAt?: number; staleAfterMs?: number }`.
- Produces, from `Sparkline.tsx`: `Sparkline({ pid, color, height }: { pid: string; color?: string; height?: number })`.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/components/ui/logic.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusFromLegacyColor, clampPercent, isMissing, nextIndex } from './logic';

test('legacy colours map to status; greens and neutrals become neutral', () => {
  assert.equal(statusFromLegacyColor('var(--sr)'), 'crit');
  assert.equal(statusFromLegacyColor('var(--sa)'), 'warn');
  for (const c of ['var(--sg)', 'var(--gb)', 'var(--pp)', 'var(--tw)', 'var(--tm)', '#9B8AFF', undefined]) {
    assert.equal(statusFromLegacyColor(c), 'neutral');
  }
});

test('clampPercent bounds and rejects NaN', () => {
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(42.5), 42.5);
  assert.equal(clampPercent(Number.NaN), 0);
});

test('isMissing covers placeholders and non-finite numbers', () => {
  for (const v of ['—', '', ' ', '-', Number.NaN, Infinity, undefined, null]) assert.equal(isMissing(v), true, String(v));
  for (const v of [0, '0', 12.8, 'P0300']) assert.equal(isMissing(v), false, String(v));
});

test('nextIndex wraps on arrow keys and ignores others', () => {
  assert.equal(nextIndex(0, 'ArrowRight', 3), 1);
  assert.equal(nextIndex(2, 'ArrowRight', 3), 0);
  assert.equal(nextIndex(0, 'ArrowLeft', 3), 2);
  assert.equal(nextIndex(1, 'ArrowDown', 3), 2);
  assert.equal(nextIndex(1, 'Home', 3), 0);
  assert.equal(nextIndex(1, 'End', 3), 2);
  assert.equal(nextIndex(1, 'a', 3), null);
});
```

Create `src/renderer/components/ui/gaugeGeometry.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polar, describeArc, gaugeFraction, sparkPath, GAUGE_START, GAUGE_END } from './gaugeGeometry';

test('polar measures degrees clockwise from 12 o’clock', () => {
  const top = polar(50, 50, 40, 0);
  assert.deepEqual([Math.round(top.x), Math.round(top.y)], [50, 10]);
  const right = polar(50, 50, 40, 90);
  assert.deepEqual([Math.round(right.x), Math.round(right.y)], [90, 50]);
});

test('full 240° track uses the large-arc flag and symmetric endpoints', () => {
  assert.equal(describeArc(50, 50, 40, GAUGE_START, GAUGE_END), 'M 15.36 70.00 A 40 40 0 1 1 84.64 70.00');
});

test('short arc uses small-arc flag', () => {
  assert.match(describeArc(50, 50, 40, -120, 0), / 0 0 1 /);
});

test('gaugeFraction clamps and never returns NaN', () => {
  assert.equal(gaugeFraction(50, 0, 100), 0.5);
  assert.equal(gaugeFraction(-10, 0, 100), 0);
  assert.equal(gaugeFraction(500, 0, 100), 1);
  assert.equal(gaugeFraction(Number.NaN, 0, 100), 0);
  assert.equal(gaugeFraction(5, 10, 10), 0);
});

test('sparkPath needs two finite points and never emits NaN', () => {
  assert.equal(sparkPath([1], 200, 36), null);
  assert.equal(sparkPath([Number.NaN, Number.NaN], 200, 36), null);
  const p = sparkPath([1, 2, Number.NaN, 3], 200, 36)!;
  assert.ok(p.line.startsWith('M 0.0 '));
  assert.ok(!p.line.includes('NaN') && !p.area.includes('NaN'));
  assert.ok(p.area.endsWith('Z'));
  const flat = sparkPath([5, 5, 5], 200, 36)!;
  assert.ok(!flat.line.includes('NaN'));
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './logic'` and `'./gaugeGeometry'`.

- [ ] **Step 3: Implement `logic.ts` and `gaugeGeometry.ts`**

Create `src/renderer/components/ui/logic.ts`:

```ts
// Pure helpers shared by UI components. No React, no DOM — unit tested.

import type { Status } from '../../theme/theme';

/** Map a legacy valueColor/barColor prop onto the new status model.
 *  Only amber and red carry meaning; everything else renders neutral. */
export function statusFromLegacyColor(color?: string): Status {
  if (color === 'var(--sr)') return 'crit';
  if (color === 'var(--sa)') return 'warn';
  return 'neutral';
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** True for values that mean "no reading": placeholders, blanks, NaN/Infinity. */
export function isMissing(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'number') return !Number.isFinite(v);
  if (typeof v === 'string') return ['', '—', '-', '–'].includes(v.trim());
  return false;
}

/** Roving-focus index for arrow-key navigation in a group of `len` items. */
export function nextIndex(i: number, key: string, len: number): number | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (i + 1) % len;
    case 'ArrowLeft':  case 'ArrowUp':   return (i - 1 + len) % len;
    case 'Home': return 0;
    case 'End':  return len - 1;
    default: return null;
  }
}
```

Create `src/renderer/components/ui/gaugeGeometry.ts`:

```ts
// SVG geometry for gauges and sparklines. Angles are degrees clockwise from
// 12 o'clock; the gauge sweeps 240° from -120 to +120.

export const GAUGE_START = -120;
export const GAUGE_END = 120;

export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

export function describeArc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function gaugeFraction(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Smoothed polyline (midpoint quadratic curves) plus a closed area path. */
export function sparkPath(values: number[], w: number, h: number): { line: string; area: string } | null {
  const nums = values.filter(Number.isFinite);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const range = Math.max(...nums) - min || 1;
  const pts = nums.map((v, i) => ({
    x: (i / (nums.length - 1)) * w,
    y: h - 2 - ((v - min) / range) * (h - 4),
  }));
  let line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i - 1].x + pts[i].x) / 2;
    const my = (pts[i - 1].y + pts[i].y) / 2;
    line += ` Q ${pts[i - 1].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  line += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  const area = `${line} L ${w.toFixed(1)} ${h} L 0.0 ${h} Z`;
  return { line, area };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for all tests.

- [ ] **Step 5: Implement `Sparkline.tsx`**

```tsx
import React, { useMemo, useId } from 'react';
import { useAppStore } from '../../store/appStore';
import { sparkPath } from './gaugeGeometry';

const W = 200;

export function Sparkline({ pid, color = 'var(--accent)', height = 40 }: { pid: string; color?: string; height?: number }): React.ReactElement | null {
  const history = useAppStore(s => s.history[pid]);
  const gradientId = useId();
  const path = useMemo(() => {
    if (!history) return null;
    return sparkPath(history.map(r => (typeof r.value === 'number' ? r.value : Number.NaN)), W, height);
  }, [history, height]);
  if (!path) return null;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gradientId})`} />
      <path d={path.line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 6: Implement `Metric.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Status, STATUS_TEXT, STATUS_FILL, TYPE, WEIGHT, NUMERIC, RADIUS, MOTION } from '../../theme/theme';
import { clampPercent, isMissing } from './logic';
import { Sparkline } from './Sparkline';
import { Tooltip } from './feedback';

export function useStaleness(staleAt: number | undefined, afterMs = 3000): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (staleAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [staleAt]);
  return staleAt !== undefined && now - staleAt > afterMs;
}

export interface MetricProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  status?: Status;
  subtextStatus?: Status;
  barPercent?: number;
  barStatus?: Status;
  tooltip?: React.ReactNode;
  staleAt?: number;
  staleAfterMs?: number;
  size?: 'hero' | 'regular' | 'compact';
  span?: 1 | 2;
  spark?: { pid: string; color?: string };
}

const SIZE = {
  hero:    { value: TYPE.display, unit: TYPE.headline, pad: '16px 20px', gap: 6 },
  regular: { value: TYPE.title2,  unit: TYPE.body,     pad: '12px 16px', gap: 4 },
  compact: { value: TYPE.title3,  unit: TYPE.caption,  pad: '10px 12px', gap: 2 },
} as const;

export function Metric({
  label, value, unit, subtext, status = 'neutral', subtextStatus = 'neutral',
  barPercent, barStatus, tooltip, staleAt, staleAfterMs = 3000,
  size = 'regular', span = 1, spark,
}: MetricProps): React.ReactElement {
  const stale = useStaleness(staleAt, staleAfterMs);
  const missing = isMissing(value);
  const s = SIZE[size];
  return (
    <div className="metric" style={{
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: s.gap,
      padding: s.pad, height: '100%',
      background: 'var(--grouped)', border: '1px solid var(--separator)', borderRadius: RADIUS.card,
      gridColumn: span === 2 ? 'span 2' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 14 }}>
        <span style={{ ...TYPE.caption, fontWeight: WEIGHT.medium, color: 'var(--label-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        {staleAt !== undefined && (
          <span title={stale ? 'No update in the last few seconds' : 'Live'} aria-label={stale ? 'stale reading' : 'live reading'}
            style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: stale ? 'var(--label-3)' : 'var(--ok)' }} />
        )}
        {tooltip && <Tooltip content={tooltip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, position: 'relative', zIndex: 1 }}>
        <span style={{
          ...s.value, ...NUMERIC,
          color: missing ? 'var(--label-3)' : STATUS_TEXT[status],
          opacity: stale ? 0.45 : 1, transition: `opacity ${MOTION.base}`,
        }}>
          {missing ? '—' : value}
        </span>
        {unit && !missing && <span style={{ ...s.unit, color: 'var(--label-2)' }}>{unit}</span>}
      </div>
      {subtext && (
        <div style={{ ...TYPE.caption, color: subtextStatus === 'neutral' ? 'var(--label-2)' : STATUS_TEXT[subtextStatus], position: 'relative', zIndex: 1 }}>
          {subtext}
        </div>
      )}
      {barPercent !== undefined && !missing && (
        <div style={{ height: 4, borderRadius: 2, background: 'var(--fill)', marginTop: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${clampPercent(barPercent)}%`,
            background: STATUS_FILL[barStatus ?? status],
            transition: `width ${MOTION.slow}`,
          }} />
        </div>
      )}
      {spark && <Sparkline pid={spark.pid} color={spark.color} />}
    </div>
  );
}
```

`Tooltip` is created in Task 4, so the typecheck at this step fails. Create a temporary stub `src/renderer/components/ui/feedback.tsx` holding only:

```tsx
import React from 'react';
export function Tooltip(_: { content: React.ReactNode }): React.ReactElement | null { return null; }
```

Task 4 replaces the whole file.

- [ ] **Step 7: Implement `Gauge.tsx`**

```tsx
import React from 'react';
import { Thresholds, Status, statusFor, STATUS_FILL, TYPE, WEIGHT, NUMERIC, RADIUS, MOTION } from '../../theme/theme';
import { describeArc, gaugeFraction, GAUGE_START, GAUGE_END } from './gaugeGeometry';
import { statusFromLegacyColor, isMissing } from './logic';
import { useStaleness } from './Metric';

export type GaugeProps = Thresholds & {
  label: string;
  value: number;
  min?: number;
  max: number;
  unit?: string;
  size?: 'regular' | 'compact';
  /** Legacy colour prop — only amber/red are honoured (as warn/crit). */
  color?: string;
  staleAt?: number;
  staleAfterMs?: number;
};

const VB = 120, CX = 60, CY = 62, R = 48, STROKE = 8;

export function Gauge({
  label, value, min = 0, max, unit, size = 'regular', color,
  warnLow, warnHigh, critLow, critHigh, staleAt, staleAfterMs = 3000,
}: GaugeProps): React.ReactElement {
  const stale = useStaleness(staleAt, staleAfterMs);
  const missing = isMissing(value);
  const byThreshold = statusFor(value, { warnLow, warnHigh, critLow, critHigh });
  const tone: Status = byThreshold !== 'neutral' ? byThreshold : statusFromLegacyColor(color);
  const fraction = gaugeFraction(value, min, max);
  const end = GAUGE_START + (GAUGE_END - GAUGE_START) * fraction;
  const compact = size === 'compact';
  const valueType = compact ? TYPE.title3 : TYPE.title1;

  return (
    <div className="metric" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: compact ? '10px 12px' : '12px 16px', height: '100%',
      background: 'var(--grouped)', border: '1px solid var(--separator)', borderRadius: RADIUS.card,
    }}>
      <div style={{ ...TYPE.caption, fontWeight: WEIGHT.medium, color: 'var(--label-2)', alignSelf: 'stretch', textAlign: 'center' }}>{label}</div>
      <div style={{ position: 'relative', width: '100%', maxWidth: compact ? 110 : 170 }}>
        <svg viewBox={`0 0 ${VB} ${VB - 14}`} style={{ width: '100%', display: 'block', opacity: stale ? 0.45 : 1, transition: `opacity ${MOTION.base}` }} aria-hidden>
          <path d={describeArc(CX, CY, R, GAUGE_START, GAUGE_END)} fill="none" stroke="var(--fill-strong)" strokeWidth={STROKE} strokeLinecap="round" />
          {!missing && fraction > 0.005 && (
            <path d={describeArc(CX, CY, R, GAUGE_START, end)} fill="none" stroke={STATUS_FILL[tone]} strokeWidth={STROKE} strokeLinecap="round" />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: compact ? 4 : 8 }}>
          <span style={{ ...valueType, ...NUMERIC, color: missing ? 'var(--label-3)' : 'var(--label)' }}>
            {missing ? '—' : value.toLocaleString()}
          </span>
          {unit && <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{unit}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignSelf: 'stretch', padding: '0 8px', ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)' }}>
        <span>{min.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck && npm test`
Expected: both pass. Nothing renders these components yet.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/ui
git commit -m "feat(ui): Metric, Gauge and Sparkline primitives with tested geometry"
```

---

### Task 4: Containers, controls, feedback, legacy wrappers, barrel

**Files:**
- Create: `src/renderer/components/ui/containers.tsx`
- Create: `src/renderer/components/ui/controls.tsx`
- Rewrite: `src/renderer/components/ui/feedback.tsx` (replaces the Task 3 stub)
- Create: `src/renderer/components/ui/legacy.tsx`
- Rewrite: `src/renderer/components/layout/UIComponents.tsx` (becomes a barrel)
- Modify: `src/renderer/theme/theme.ts` (delete `valueColor`, `gaugeArc`)

**Interfaces:**
- Consumes: `Metric`, `Gauge`, `Sparkline` and `useStaleness` from Task 3; `nextIndex` and `statusFromLegacyColor` from `logic.ts`; tokens from Task 1.
- Produces, from `containers.tsx`:
  - `Card({ children, padding?: number, style?, accentColor?: string /* ignored, deprecated */ })`
  - `SectionHeader({ children, action?: React.ReactNode })`
  - `Grid({ cols?: 2 | 3 | 4, gap?: number, children })`
  - `ScrollPane({ children })`
  - `Divider()`
- Produces, from `controls.tsx`:
  - `Button(props: ButtonProps)`, with variants `'primary' | 'secondary' | 'plain' | 'destructive' | 'ghost' | 'danger'` and sizes `'sm' | 'md'`
  - `SegmentedControl<T extends string>({ options: ReadonlyArray<{ value: T; label: string; icon?: string }>; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; ariaLabel: string })`
- Produces, from `feedback.tsx`:
  - `type BadgeVariant = 'ok' | 'warn' | 'crit' | 'info' | 'muted'`
  - `Badge({ label, variant })`
  - `AlertBanner({ message, variant?, action?, onAction? })`
  - `Tooltip({ content })`
  - `TipContent({ name, description, formula?, range? })`
  - `DataRow({ pid?, name, value, subtext?, badge?, onClick? })`
  - `EmptyState({ icon?: string; title: string; message?: string })`
- Produces, from `legacy.tsx`: `MetricTile`, `HeroCard`, `DenseMetricTile`, `ArcGauge`, `CompactArcGauge`, `WaveBar` and `StatusBar`, with the **same props as today**, mapped onto the new components.
- Produces: the `UIComponents.tsx` barrel re-exports everything above plus `Metric`, `Gauge` and `Sparkline`.

- [ ] **Step 1: Write the failing barrel test**

Create `src/renderer/components/ui/barrel.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as UI from '../layout/UIComponents';

test('barrel keeps every legacy export and adds the new ones', () => {
  const expected = [
    'Grid', 'ScrollPane', 'SectionHeader', 'Card', 'MetricTile', 'ArcGauge', 'Tooltip', 'TipContent',
    'Badge', 'AlertBanner', 'DataRow', 'Button', 'WaveBar', 'Sparkline', 'HeroCard', 'DenseMetricTile',
    'CompactArcGauge', 'StatusBar',
    'Metric', 'Gauge', 'SegmentedControl', 'EmptyState', 'Divider',
  ];
  for (const name of expected) assert.equal(typeof (UI as Record<string, unknown>)[name], 'function', name);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL on `Metric` (and others), because the current barrel doesn't export them.

- [ ] **Step 3: Implement `containers.tsx`**

```tsx
import React from 'react';
import { TYPE, WEIGHT, RADIUS } from '../../theme/theme';

interface CardProps {
  children: React.ReactNode;
  padding?: number;
  style?: React.CSSProperties;
  /** @deprecated ignored — status is shown on values/badges now. Removed in Task 13. */
  accentColor?: string;
}
export function Card({ children, padding = 16, style }: CardProps): React.ReactElement {
  return (
    <div style={{
      background: 'var(--grouped)', border: '1px solid var(--separator)',
      borderRadius: RADIUS.card, padding, overflow: 'hidden', ...style,
    }}>
      {children}
    </div>
  );
}

export function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
      <h2 style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, color: 'var(--label-2)', margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

export function Grid({ cols = 4, gap = 12, children }: { cols?: 2 | 3 | 4; gap?: number; children: React.ReactNode }): React.ReactElement {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>{children}</div>;
}

export function ScrollPane({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {children}
    </div>
  );
}

export function Divider(): React.ReactElement {
  return <div role="separator" style={{ height: 1, background: 'var(--separator)', margin: '4px 0' }} />;
}
```

- [ ] **Step 4: Implement `controls.tsx`**

```tsx
import React, { useRef } from 'react';
import { TYPE, WEIGHT, RADIUS } from '../../theme/theme';
import { nextIndex } from './logic';

type Variant = 'primary' | 'secondary' | 'plain' | 'destructive';
/** 'ghost' and 'danger' are legacy names kept until Task 13. */
type ButtonVariant = Variant | 'ghost' | 'danger';

const normalize = (v: ButtonVariant): Variant => (v === 'ghost' ? 'secondary' : v === 'danger' ? 'destructive' : v);

const VARIANT: Record<Variant, React.CSSProperties> = {
  primary:     { background: 'var(--accent)', color: 'var(--on-accent)' },
  secondary:   { background: 'var(--fill)', color: 'var(--label)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' },
  plain:       { background: 'transparent', color: 'var(--accent-text)' },
  destructive: { background: 'var(--crit-tint)', color: 'var(--crit-text)' },
};

const SIZE = {
  sm: { height: 22, padding: '0 8px',  ...TYPE.caption, iconSize: 13 },
  md: { height: 28, padding: '0 12px', ...TYPE.body,    iconSize: 15 },
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: string;
  children?: React.ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, children, style, disabled, className, ...rest }: ButtonProps): React.ReactElement {
  const { iconSize, ...sz } = SIZE[size];
  return (
    <button
      className={`ui-button no-drag ${className ?? ''}`}
      disabled={disabled}
      style={{
        ...VARIANT[normalize(variant)], ...sz,
        fontWeight: WEIGHT.medium,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: 'none', borderRadius: RADIUS.control, whiteSpace: 'nowrap',
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
      {...rest}
    >
      {icon && <i className={`ti ${icon}`} style={{ fontSize: iconSize }} aria-hidden />}
      {children}
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string; icon?: string }>;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = 'md', ariaLabel }: SegmentedProps<T>): React.ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex(o => o.value === value));
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = nextIndex(current, e.key, options.length);
    if (i === null) return;
    e.preventDefault();
    onChange(options[i].value);
    refs.current[i]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} className="no-drag"
      style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--fill)', borderRadius: RADIUS.control + 1 }}>
      {options.map((o, i) => {
        const selected = i === current;
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el; }}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            style={{
              ...(size === 'sm' ? TYPE.caption : TYPE.body),
              fontWeight: selected ? WEIGHT.semibold : WEIGHT.regular,
              height: size === 'sm' ? 18 : 24, padding: '0 10px',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              border: 'none', borderRadius: RADIUS.control - 1,
              background: selected ? 'var(--elevated)' : 'transparent',
              boxShadow: selected ? '0 1px 2px var(--shadow)' : 'none',
              color: 'var(--label)',
            }}
          >
            {o.icon && <i className={`ti ${o.icon}`} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Implement `feedback.tsx` (replace the stub)**

```tsx
import React, { useRef, useState } from 'react';
import { TYPE, WEIGHT, NUMERIC, RADIUS } from '../../theme/theme';
import { Button } from './controls';

export type BadgeVariant = 'ok' | 'warn' | 'crit' | 'info' | 'muted';

const TINT: Record<BadgeVariant, { bg: string; fg: string; icon: string }> = {
  ok:    { bg: 'var(--ok-tint)',     fg: 'var(--ok-text)',     icon: 'ti-circle-check' },
  warn:  { bg: 'var(--warn-tint)',   fg: 'var(--warn-text)',   icon: 'ti-alert-triangle' },
  crit:  { bg: 'var(--crit-tint)',   fg: 'var(--crit-text)',   icon: 'ti-alert-triangle' },
  info:  { bg: 'var(--accent-tint)', fg: 'var(--accent-text)', icon: 'ti-info-circle' },
  muted: { bg: 'var(--fill)',        fg: 'var(--label-2)',     icon: 'ti-info-circle' },
};

export function Badge({ label, variant }: { label: string; variant: BadgeVariant }): React.ReactElement {
  const t = TINT[variant];
  return (
    <span style={{
      ...TYPE.caption, fontWeight: WEIGHT.semibold,
      background: t.bg, color: t.fg,
      padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center',
    }}>
      {label}
    </span>
  );
}

export function AlertBanner({ message, variant = 'crit', action, onAction }: {
  message: string; variant?: BadgeVariant; action?: string; onAction?: () => void;
}): React.ReactElement {
  const t = TINT[variant];
  return (
    <div role={variant === 'crit' ? 'alert' : 'status'} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: RADIUS.card, background: t.bg,
    }}>
      <i className={`ti ${t.icon}`} style={{ fontSize: 16, color: t.fg, flexShrink: 0 }} aria-hidden />
      <span style={{ ...TYPE.body, color: 'var(--label)', flex: 1 }}>{message}</span>
      {action && onAction && <Button size="sm" variant="secondary" onClick={onAction}>{action}</Button>}
    </div>
  );
}

export function Tooltip({ content }: { content: React.ReactNode }): React.ReactElement {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: string; left: number }>({ left: 0, bottom: 'calc(100% + 8px)' });

  const show = () => {
    setVisible(true);
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const tipW = 260, tipH = 180;
    let left = 0;
    if (rect.left + tipW > window.innerWidth - 8) left = -(rect.left + tipW - window.innerWidth + 16);
    if (rect.left + left < 8) left = -rect.left + 8;
    setPos(rect.top - tipH - 8 < 0 ? { top: rect.height + 8, left } : { bottom: 'calc(100% + 8px)', left });
  };
  const hide = () => setVisible(false);

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={ref}
        type="button"
        className="info-trigger"
        aria-label="More information"
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onKeyDown={e => { if (e.key === 'Escape') hide(); }}
        style={{ border: 'none', background: 'transparent', padding: 0, display: 'inline-flex', color: 'var(--label-3)' }}
      >
        <i className="ti ti-info-circle" style={{ fontSize: 14 }} aria-hidden />
      </button>
      {visible && (
        <div role="tooltip" style={{
          position: 'absolute', ...pos, zIndex: 200, width: 260, pointerEvents: 'none',
          padding: '10px 12px', borderRadius: 8,
          background: 'var(--elevated)', border: '0.5px solid var(--separator)',
          boxShadow: '0 8px 24px var(--shadow)', backdropFilter: 'blur(20px)',
          ...TYPE.caption, color: 'var(--label)',
        }}>
          {content}
        </div>
      )}
    </span>
  );
}

export function TipContent({ name, description, formula, range }: { name: string; description: string; formula?: string; range?: string }): React.ReactElement {
  return (
    <>
      <div style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, marginBottom: 4 }}>{name}</div>
      <div style={{ color: 'var(--label-2)' }}>{description}</div>
      {formula && (
        <div style={{ ...NUMERIC, marginTop: 6, padding: '3px 6px', borderRadius: 4, background: 'var(--fill)', color: 'var(--accent-text)' }}>
          {formula}
        </div>
      )}
      {range && <div style={{ marginTop: 4, color: 'var(--label-2)' }}>{range}</div>}
    </>
  );
}

export function DataRow({ pid, name, value, subtext, badge, onClick }: {
  pid?: string; name: string; value: string | number; subtext?: string; badge?: React.ReactNode; onClick?: () => void;
}): React.ReactElement {
  const Tag = (onClick ? 'button' : 'div') as 'button';
  return (
    <Tag
      className={onClick ? 'row-hover' : undefined}
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        width: '100%', minHeight: 32, padding: '6px 12px', textAlign: 'left',
        background: 'transparent', border: 'none', borderBottom: '1px solid var(--separator)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        {pid && <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)' }}>{pid}</div>}
        <div style={{ ...TYPE.body, color: 'var(--label)' }}>{name}</div>
        {subtext && <div style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{subtext}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {badge}
        <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label)', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </Tag>
  );
}

export function EmptyState({ icon = 'ti-database-off', title, message }: { icon?: string; title: string; message?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24, textAlign: 'center' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 28, color: 'var(--label-3)' }} aria-hidden />
      <div style={{ ...TYPE.headline, color: 'var(--label-2)' }}>{title}</div>
      {message && <div style={{ ...TYPE.caption, color: 'var(--label-3)', maxWidth: 320 }}>{message}</div>}
    </div>
  );
}
```

- [ ] **Step 6: Implement `legacy.tsx`**

```tsx
// Compatibility wrappers: old component names and props, rendered with the new
// components. Screens migrate off these in Tasks 7–12; file deleted in Task 13.

import React from 'react';
import { Metric } from './Metric';
import { Gauge } from './Gauge';
import { statusFromLegacyColor } from './logic';

type Legacy = { valueColor?: string; barColor?: string };
const statusOf = (p: Legacy) => statusFromLegacyColor(p.valueColor);
const barOf = (p: Legacy) => (p.barColor ? statusFromLegacyColor(p.barColor) : undefined);

export function MetricTile(p: {
  label: string; value: string | number; unit?: string; subtext?: string; barPercent?: number; barColor?: string;
  valueColor?: string; accentColor?: string; tooltip?: React.ReactNode; staleAt?: number; staleAfterMs?: number;
  prominence?: 'normal' | 'hero';
}): React.ReactElement {
  const hero = p.prominence === 'hero';
  return <Metric label={p.label} value={p.value} unit={p.unit} subtext={p.subtext} barPercent={p.barPercent}
    barStatus={barOf(p)} status={statusOf(p)} tooltip={p.tooltip} staleAt={p.staleAt} staleAfterMs={p.staleAfterMs}
    size={hero ? 'hero' : 'regular'} span={hero ? 2 : 1} />;
}

export function HeroCard(p: {
  label: string; value: string | number; unit?: string; subtext?: string; valueColor?: string;
  accentBorder?: string; pid: string; sparkColor: string; staleAt?: number;
}): React.ReactElement {
  return <Metric size="hero" label={p.label} value={p.value} unit={p.unit} subtext={p.subtext}
    status={statusOf(p)} staleAt={p.staleAt} spark={{ pid: p.pid, color: p.sparkColor }} />;
}

export function DenseMetricTile(p: {
  label: string; value: string | number; unit?: string; subtext?: string; subtextColor?: string;
  barPercent?: number; barColor?: string; valueColor?: string; accentBorder?: string; tooltip?: React.ReactNode;
}): React.ReactElement {
  return <Metric size="compact" label={p.label} value={p.value} unit={p.unit} subtext={p.subtext}
    subtextStatus={statusFromLegacyColor(p.subtextColor)} barPercent={p.barPercent} barStatus={barOf(p)}
    status={statusOf(p)} tooltip={p.tooltip} />;
}

export function ArcGauge(p: {
  value: number; min: number; max: number; label: string; unit: string; size?: number; maxSize?: number;
  color?: string; warnLow?: number; warnHigh?: number; critLow?: number; critHigh?: number; isDark?: boolean;
  staleAt?: number; staleAfterMs?: number;
}): React.ReactElement {
  return <Gauge label={p.label} value={p.value} min={p.min} max={p.max} unit={p.unit} color={p.color}
    warnLow={p.warnLow} warnHigh={p.warnHigh} critLow={p.critLow} critHigh={p.critHigh}
    staleAt={p.staleAt} staleAfterMs={p.staleAfterMs} />;
}

export function CompactArcGauge(p: { label: string; value: number; max: number; unit: string; color: string }): React.ReactElement {
  return <Gauge size="compact" label={p.label} value={p.value} max={p.max} unit={p.unit} color={p.color} />;
}

/** Was an animated bar; now a status dot that pulses while active. */
export function WaveBar({ color = 'var(--accent)', active = true }: { color?: string; active?: boolean }): React.ReactElement {
  return <span className={active ? 'pulse' : undefined} aria-hidden
    style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: active ? color : 'var(--label-4)' }} />;
}

/** Its content moved to the toolbar connection popover (Task 5). */
export function StatusBar(): null {
  return null;
}
```

- [ ] **Step 7: Rewrite `UIComponents.tsx` as a barrel**

Replace the whole of `src/renderer/components/layout/UIComponents.tsx` with:

```ts
// Public component surface for screens. Implementations live in components/ui/.
export { Card, SectionHeader, Grid, ScrollPane, Divider } from '../ui/containers';
export { Button, SegmentedControl } from '../ui/controls';
export type { ButtonProps } from '../ui/controls';
export { Badge, AlertBanner, Tooltip, TipContent, DataRow, EmptyState } from '../ui/feedback';
export type { BadgeVariant } from '../ui/feedback';
export { Metric, useStaleness } from '../ui/Metric';
export type { MetricProps } from '../ui/Metric';
export { Gauge } from '../ui/Gauge';
export type { GaugeProps } from '../ui/Gauge';
export { Sparkline } from '../ui/Sparkline';
export { MetricTile, HeroCard, DenseMetricTile, ArcGauge, CompactArcGauge, WaveBar, StatusBar } from '../ui/legacy';
```

In `src/renderer/theme/theme.ts`, delete the `// ─── Legacy helpers` section: the `valueColor` and `gaugeArc` functions.

- [ ] **Step 8: Run the tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. If typecheck reports a screen passing a prop the wrappers lack, add that prop to the wrapper's type and map it. **Do not edit the screen in this task.**

- [ ] **Step 9: Visual check**

Run: `npm run build && node scripts/capture-screens.mjs .screens/t4`
Open `live-dark.png`, `live-light.png`, `health-light.png`, `engine-dark.png` and `ecubus-dark.png`.

Expected:
- Every metric and gauge renders in the new style: rounded cards, SF text, large centered gauge values.
- Normal values show in neutral label color.
- No layout collapses.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components src/renderer/theme/theme.ts
git commit -m "feat(ui): rebuild component library for macOS design with legacy wrappers"
```

---

### Task 5: App shell (sidebar, unified toolbar, connection popover, shortcuts, appearance setting)

**Files:**
- Create: `src/renderer/components/shell/navItems.ts`
- Create: `src/renderer/components/shell/shellLogic.ts`
- Create: `src/renderer/components/shell/shellLogic.test.ts`
- Create: `src/renderer/components/shell/Sidebar.tsx`
- Create: `src/renderer/components/shell/Toolbar.tsx`
- Create: `src/renderer/components/shell/ConnectionPopover.tsx`
- Rewrite: `src/renderer/App.tsx` (render tree only; effects kept)
- Modify: `src/renderer/screens/SettingsScreen.tsx` (add an Appearance section at the top)

**Interfaces:**
- Consumes: `ScreenId` from `store/appStore.ts:113`; `Button` and `SegmentedControl` from the barrel; tokens; `window.electronAPI.getAppearance` and `setAppearance` from Task 2.
- Produces, from `navItems.ts`:
  - `interface NavItem { id: ScreenId; icon: string; label: string }`
  - `NAV_GROUPS: ReadonlyArray<{ title?: string; items: ReadonlyArray<NavItem> }>`
  - `SETTINGS_ITEM: NavItem`
  - `ALL_SCREEN_IDS: ScreenId[]`
- Produces, from `shellLogic.ts`:
  - `formatSessionTime(ms: number): string`
  - `batteryStatus(v: number): Status | 'none'`
  - `connectionTone(s: ConnectionStatusLike): Status`
  - `connectionLabel(s: ConnectionStatusLike, adapterInfo?: string): string`
  - `computeRate(liveData: Record<string, { timestamp: number }>, now: number): { livePIDs: number; perSec: string }`
  - `shortcutFor(e: KeyLike): 'toggle-sidebar' | 'settings' | null`
  - `readSidebarPref(storage: Pick<Storage, 'getItem'> | undefined): boolean`
  - `writeSidebarPref(storage: Pick<Storage, 'setItem'> | undefined, open: boolean): void`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/components/shell/shellLogic.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSessionTime, batteryStatus, connectionTone, connectionLabel, computeRate,
  shortcutFor, readSidebarPref, writeSidebarPref,
} from './shellLogic';
import { NAV_GROUPS, ALL_SCREEN_IDS } from './navItems';

test('formatSessionTime pads h:m:s', () => {
  assert.equal(formatSessionTime(0), '00:00:00');
  assert.equal(formatSessionTime(3_723_000), '01:02:03');
  assert.equal(formatSessionTime(-5), '00:00:00');
});

test('batteryStatus bands', () => {
  assert.equal(batteryStatus(0), 'none');
  assert.equal(batteryStatus(Number.NaN), 'none');
  assert.equal(batteryStatus(13.8), 'neutral');
  assert.equal(batteryStatus(12.5), 'neutral');
  assert.equal(batteryStatus(12.2), 'warn');
  assert.equal(batteryStatus(11.6), 'crit');
});

test('connection tone and label', () => {
  assert.equal(connectionTone('connected'), 'ok');
  assert.equal(connectionTone('error'), 'crit');
  assert.equal(connectionTone('connecting'), 'warn');
  assert.equal(connectionTone('disconnected'), 'neutral');
  assert.equal(connectionLabel('connected', 'OBDLink MX+ v5.2'), 'OBDLink MX+ v5.2');
  assert.equal(connectionLabel('connected', ''), 'Connected');
  assert.equal(connectionLabel('initializing'), 'Initializing…');
});

test('computeRate counts fresh PIDs and readings/sec', () => {
  const now = 10_000;
  const data = { a: { timestamp: 9_500 }, b: { timestamp: 7_500 }, c: { timestamp: 2_000 } };
  assert.deepEqual(computeRate(data, now), { livePIDs: 2, perSec: '0.5' });
});

test('shortcuts need the exact modifiers', () => {
  const k = (key: string, m: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) =>
    ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...m });
  assert.equal(shortcutFor(k('s', { metaKey: true, ctrlKey: true })), 'toggle-sidebar');
  assert.equal(shortcutFor(k('S', { metaKey: true, ctrlKey: true })), 'toggle-sidebar');
  assert.equal(shortcutFor(k(',', { metaKey: true })), 'settings');
  assert.equal(shortcutFor(k('s')), null);
  assert.equal(shortcutFor(k(',')), null);
  assert.equal(shortcutFor(k('s', { metaKey: true })), null);
  assert.equal(shortcutFor(k(',', { metaKey: true, shiftKey: true })), null);
});

test('sidebar pref defaults open and survives throwing storage', () => {
  assert.equal(readSidebarPref(undefined), true);
  assert.equal(readSidebarPref({ getItem: () => null }), true);
  assert.equal(readSidebarPref({ getItem: () => '0' }), false);
  assert.equal(readSidebarPref({ getItem: () => { throw new Error('blocked'); } }), true);
  assert.doesNotThrow(() => writeSidebarPref({ setItem: () => { throw new Error('blocked'); } }, false));
});

test('navigation lists all 19 screens exactly once, settings last', () => {
  assert.equal(ALL_SCREEN_IDS.length, 19);
  assert.equal(new Set(ALL_SCREEN_IDS).size, 19);
  assert.equal(ALL_SCREEN_IDS[ALL_SCREEN_IDS.length - 1], 'settings');
  assert.deepEqual(NAV_GROUPS.map(g => g.title), [undefined, 'Overview', 'Subsystems', 'Diagnostic', 'Advanced', 'Records']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './shellLogic'`.

- [ ] **Step 3: Implement `navItems.ts` and `shellLogic.ts`**

Create `src/renderer/components/shell/navItems.ts`:

```ts
import type { ScreenId } from '../../store/appStore';

export interface NavItem { id: ScreenId; icon: string; label: string }

export const NAV_GROUPS: ReadonlyArray<{ title?: string; items: ReadonlyArray<NavItem> }> = [
  { items: [
    { id: 'connect',   icon: 'ti-bluetooth', label: 'Connection' },
    { id: 'assistant', icon: 'ti-sparkles',  label: 'Claude assistant' },
  ] },
  { title: 'Overview', items: [
    { id: 'health',  icon: 'ti-heart-rate-monitor', label: 'Vehicle health' },
    { id: 'live',    icon: 'ti-dashboard',          label: 'Live telemetry' },
    { id: 'allpids', icon: 'ti-list-search',        label: 'All parameters' },
    { id: 'logger',  icon: 'ti-activity',           label: 'Data logger' },
  ] },
  { title: 'Subsystems', items: [
    { id: 'engine',       icon: 'ti-engine',             label: 'Engine & fuel' },
    { id: 'electrical',   icon: 'ti-battery-automotive', label: 'Electrical' },
    { id: 'hvac',         icon: 'ti-temperature',        label: 'HVAC' },
    { id: 'transmission', icon: 'ti-manual-gearbox',     label: 'Transmission' },
  ] },
  { title: 'Diagnostic', items: [
    { id: 'dtc',      icon: 'ti-alert-triangle',   label: 'Fault codes' },
    { id: 'modules',  icon: 'ti-cpu',              label: 'Module monitor' },
    { id: 'parasite', icon: 'ti-zoom-exclamation', label: 'Parasitic draw' },
  ] },
  { title: 'Advanced', items: [
    { id: 'ecubus', icon: 'ti-circuit-diode', label: 'EcuBus-Pro' },
    { id: 'pcm',    icon: 'ti-id-badge-2',    label: 'PCM identity' },
  ] },
  { title: 'Records', items: [
    { id: 'compare',      icon: 'ti-arrows-diff', label: 'Compare' },
    { id: 'freezeframes', icon: 'ti-camera',      label: 'Freeze frames' },
    { id: 'logs',         icon: 'ti-file-text',   label: 'Session log' },
  ] },
];

export const SETTINGS_ITEM: NavItem = { id: 'settings', icon: 'ti-settings', label: 'Settings' };

export const ALL_SCREEN_IDS: ScreenId[] = [
  ...NAV_GROUPS.flatMap(g => g.items.map(i => i.id)),
  SETTINGS_ITEM.id,
];
```

Create `src/renderer/components/shell/shellLogic.ts`:

```ts
// Pure helpers for the app shell. No React/DOM — unit tested.

import type { Status } from '../../theme/theme';

export type ConnectionStatusLike = 'disconnected' | 'scanning' | 'connecting' | 'initializing' | 'connected' | 'error';

export function formatSessionTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Resting/charging lead-acid bands; 'none' when there is no reading. */
export function batteryStatus(v: number): Status | 'none' {
  if (!Number.isFinite(v) || v <= 0) return 'none';
  if (v >= 12.4) return 'neutral';
  if (v >= 12.0) return 'warn';
  return 'crit';
}

export function connectionTone(s: ConnectionStatusLike): Status {
  if (s === 'connected') return 'ok';
  if (s === 'error') return 'crit';
  if (s === 'disconnected') return 'neutral';
  return 'warn';
}

export function connectionLabel(s: ConnectionStatusLike, adapterInfo?: string): string {
  switch (s) {
    case 'connected':    return adapterInfo || 'Connected';
    case 'scanning':     return 'Scanning…';
    case 'connecting':   return 'Connecting…';
    case 'initializing': return 'Initializing…';
    case 'error':        return 'Connection error';
    default:             return 'Not connected';
  }
}

export function computeRate(liveData: Record<string, { timestamp: number }>, now: number): { livePIDs: number; perSec: string } {
  const ts = Object.values(liveData).map(r => r.timestamp);
  return {
    livePIDs: ts.filter(t => now - t < 5000).length,
    perSec: (ts.filter(t => now - t < 2000).length / 2).toFixed(1),
  };
}

export interface KeyLike { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

export function shortcutFor(e: KeyLike): 'toggle-sidebar' | 'settings' | null {
  if (e.altKey || e.shiftKey || !e.metaKey) return null;
  if (e.ctrlKey && e.key.toLowerCase() === 's') return 'toggle-sidebar';
  if (!e.ctrlKey && e.key === ',') return 'settings';
  return null;
}

const SIDEBAR_KEY = 'ui.sidebarOpen';

export function readSidebarPref(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try { return storage?.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
}

export function writeSidebarPref(storage: Pick<Storage, 'setItem'> | undefined, open: boolean): void {
  try { storage?.setItem(SIDEBAR_KEY, open ? '1' : '0'); } catch { /* storage blocked — preference is per-session */ }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for all tests. If `ScreenId` in `appStore.ts` lacks an id used in `NAV_GROUPS`, the typecheck in Step 8 catches it. The ids above are copied from the current `App.tsx:90`.

- [ ] **Step 5: Implement `Sidebar.tsx`**

```tsx
import React from 'react';
import type { ScreenId } from '../../store/appStore';
import { TYPE, WEIGHT, NUMERIC, RADIUS } from '../../theme/theme';
import { NAV_GROUPS, SETTINGS_ITEM, NavItem } from './navItems';

interface SidebarProps {
  active: ScreenId;
  onSelect: (id: ScreenId) => void;
  dtcCount: number;
  connectionAlert: boolean;
}

function Row({ item, active, onSelect, badge, alert }: {
  item: NavItem; active: boolean; onSelect: (id: ScreenId) => void; badge?: number; alert?: boolean;
}): React.ReactElement {
  return (
    <button
      className="sidebar-row no-drag"
      data-screen={item.id}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(item.id)}
      style={{
        ...TYPE.body, color: 'var(--label)',
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', height: 28, padding: '0 8px',
        border: 'none', borderRadius: RADIUS.control, textAlign: 'left',
        background: active ? 'var(--selection)' : 'transparent',
      }}
    >
      <i className={`ti ${item.icon}`} aria-hidden
        style={{ fontSize: 16, width: 18, textAlign: 'center', color: alert ? 'var(--crit-text)' : 'var(--accent-text)' }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
      {badge ? (
        <span aria-label={`${badge} active codes`} style={{
          ...TYPE.caption, ...NUMERIC, fontWeight: WEIGHT.semibold,
          minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--crit)', color: 'var(--on-accent)',
        }}>{badge}</span>
      ) : null}
    </button>
  );
}

export function Sidebar({ active, onSelect, dtcCount, connectionAlert }: SidebarProps): React.ReactElement {
  return (
    <nav aria-label="Sections" style={{
      width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'transparent', borderRight: '1px solid var(--separator)',
    }}>
      <div className="drag" style={{ height: 52, flexShrink: 0 }} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title ?? gi} style={{ marginBottom: 10 }}>
            {group.title && (
              <div style={{ ...TYPE.caption, fontWeight: WEIGHT.semibold, color: 'var(--label-3)', padding: '6px 8px 4px' }}>
                {group.title}
              </div>
            )}
            {group.items.map(item => (
              <Row key={item.id} item={item} active={active === item.id} onSelect={onSelect}
                badge={item.id === 'dtc' ? dtcCount : undefined}
                alert={item.id === 'connect' && connectionAlert} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--separator)' }}>
        <Row item={SETTINGS_ITEM} active={active === 'settings'} onSelect={onSelect} />
      </div>
    </nav>
  );
}
```

- [ ] **Step 6: Implement `ConnectionPopover.tsx` and `Toolbar.tsx`**

Create `src/renderer/components/shell/ConnectionPopover.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { TYPE, WEIGHT, NUMERIC, RADIUS, STATUS_FILL } from '../../theme/theme';
import { Button } from '../layout/UIComponents';
import { computeRate, connectionLabel, connectionTone, ConnectionStatusLike } from './shellLogic';

export function ConnectionItem({ onOpenConnection }: { onOpenConnection: () => void }): React.ReactElement {
  const status = useAppStore(s => s.connectionStatus) as ConnectionStatusLike;
  const protocol = useAppStore(s => s.protocol);
  const adapterInfo = useAppStore(s => s.adapterInfo);
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState({ livePIDs: 0, perSec: '0.0' });
  const ref = useRef<HTMLDivElement>(null);

  // Rate is only computed while the popover is open (cheap when closed).
  useEffect(() => {
    if (!open) return;
    const tick = () => setRate(computeRate(useAppStore.getState().liveData, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const connected = status === 'connected';
  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '3px 0' }}>
      <span style={{ color: 'var(--label-2)' }}>{label}</span>
      <span style={{ ...NUMERIC, color: 'var(--label)' }}>{value}</span>
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }} className="no-drag">
      <button
        className="toolbar-item"
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{ ...TYPE.body, display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', border: 'none', borderRadius: RADIUS.control, background: 'transparent', color: 'var(--label)' }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 4, background: status === 'disconnected' ? 'var(--label-3)' : STATUS_FILL[connectionTone(status)] }} />
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{connectionLabel(status, adapterInfo)}</span>
        {protocol && <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{protocol}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Connection details" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 300, width: 260,
          padding: 12, borderRadius: RADIUS.panel,
          background: 'var(--elevated)', border: '0.5px solid var(--separator)',
          boxShadow: '0 12px 32px var(--shadow)', backdropFilter: 'blur(20px)',
          ...TYPE.caption,
        }}>
          <div style={{ ...TYPE.body, fontWeight: WEIGHT.semibold, marginBottom: 8 }}>{connectionLabel(status, adapterInfo)}</div>
          {row('Protocol', protocol || '—')}
          {row('Live PIDs', connected ? String(rate.livePIDs) : '—')}
          {row('Read rate', connected ? `${rate.perSec}/s` : '—')}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            {connected
              ? <Button size="sm" variant="destructive" onClick={() => { setOpen(false); void window.electronAPI.disconnect(); }}>Disconnect</Button>
              : <Button size="sm" variant="primary" onClick={() => { setOpen(false); onOpenConnection(); }}>Open connection</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
```

Create `src/renderer/components/shell/Toolbar.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useAppStore, selectBatteryVoltage, selectActiveDTCCount, vehicleDisplayName } from '../../store/appStore';
import { TYPE, WEIGHT, NUMERIC, RADIUS, STATUS_TEXT } from '../../theme/theme';
import { Button } from '../layout/UIComponents';
import { ConnectionItem } from './ConnectionPopover';
import { batteryStatus, formatSessionTime } from './shellLogic';

interface ToolbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenDTC: () => void;
  onOpenConnection: () => void;
}

export function Toolbar({ sidebarOpen, onToggleSidebar, onOpenDTC, onOpenConnection }: ToolbarProps): React.ReactElement {
  const vehicle = useAppStore(s => s.vehicle);
  const sessionStartMs = useAppStore(s => s.sessionStartMs);
  const battery = useAppStore(selectBatteryVoltage);
  const dtcCount = useAppStore(selectActiveDTCCount);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sessionStartMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessionStartMs]);

  const subtitle = [vehicle.vin, vehicle.engine, vehicle.nickname].filter(Boolean).join(' · ') || 'Project Agador Spartacus';
  const bStatus = batteryStatus(battery);

  return (
    <header className="drag" style={{
      height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
      padding: `0 12px 0 ${sidebarOpen ? 12 : 84}px`,
      background: 'var(--content)', borderBottom: '1px solid var(--separator)',
    }}>
      <Button variant="plain" icon="ti-layout-sidebar" aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        title="Toggle sidebar (⌃⌘S)" onClick={onToggleSidebar} style={{ color: 'var(--label-2)', padding: '0 6px' }} />

      <div style={{ minWidth: 0, flex: 1, paddingLeft: 4 }}>
        <div style={{ ...TYPE.headline, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {vehicleDisplayName(vehicle)}
        </div>
        <div className="selectable" style={{ ...TYPE.caption, color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
      </div>

      <ConnectionItem onOpenConnection={onOpenConnection} />

      <div title="Battery voltage measured by the adapter at the OBD port" style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: RADIUS.control,
      }}>
        <i className="ti ti-battery-automotive" aria-hidden style={{ fontSize: 16, color: 'var(--label-2)' }} />
        <span style={{ ...TYPE.body, ...NUMERIC, fontWeight: WEIGHT.medium, color: bStatus === 'none' ? 'var(--label-3)' : STATUS_TEXT[bStatus] }}>
          {bStatus === 'none' ? '— V' : `${battery.toFixed(2)} V`}
        </span>
      </div>

      {dtcCount > 0 && (
        <button className="toolbar-item no-drag" onClick={onOpenDTC}
          title={`${dtcCount} active diagnostic code${dtcCount > 1 ? 's' : ''} — open fault codes`}
          style={{ ...TYPE.body, display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', border: 'none', borderRadius: RADIUS.control, background: 'var(--crit-tint)', color: 'var(--crit-text)', fontWeight: WEIGHT.medium }}>
          <i className="ti ti-engine" aria-hidden style={{ fontSize: 16 }} />
          <span style={NUMERIC}>{dtcCount}</span> {dtcCount > 1 ? 'codes' : 'code'}
        </button>
      )}

      <span title="Session time" style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label-2)', padding: '0 4px', minWidth: 64, textAlign: 'right' }}>
        {sessionStartMs ? formatSessionTime(now - sessionStartMs) : '—'}
      </span>
    </header>
  );
}
```

- [ ] **Step 7: Rewrite the `App.tsx` render tree**

In `src/renderer/App.tsx`:

1. Delete `NAV_ITEMS` (lines 88–112), `SCREEN_TITLES` (114–134), and the local `type ScreenId` (line 90). Import it instead:

   ```ts
   import { useAppStore, vehicleDisplayName, selectActiveDTCCount, ScreenId } from './store/appStore';
   import { buildThemeCSS, FONTS, TYPE } from './theme/theme';
   import { GLOBAL_CSS, LEGACY_CSS } from './theme/globalStyles';
   import { Sidebar } from './components/shell/Sidebar';
   import { Toolbar } from './components/shell/Toolbar';
   import { shortcutFor, readSidebarPref, writeSidebarPref } from './components/shell/shellLogic';
   ```

   (`selectBatteryVoltage` moves into `Toolbar`.)

2. Add a screen map below the imports:

   ```tsx
   const SCREENS: Record<ScreenId, React.ComponentType> = {
     connect: ConnectionScreen, assistant: AssistantScreen, health: HealthScreen, live: LiveScreen,
     allpids: AllPIDsScreen, engine: EngineScreen, electrical: ElectricalScreen, hvac: HVACScreen,
     transmission: TransmissionScreen, dtc: DTCScreen, modules: ModulesScreen, parasite: ParasiteScreen,
     ecubus: EcuBusScreen, pcm: PcmScreen, compare: CompareScreen, logs: LogsScreen,
     settings: SettingsScreen, logger: DataLoggerScreen, freezeframes: FreezeFrameScreen,
   };
   ```

3. In `App()`, change the store destructure to:

   ```ts
   const {
     connectionStatus, activeScreen,
     setConnectionStatus, updatePIDReading, setDTCs,
     updateModule, addLogEntry, setActiveScreen,
   } = useAppStore();
   const activeDTCCount = useAppStore(selectActiveDTCCount);
   const vehicle        = useAppStore(s => s.vehicle);
   const dtcs           = useAppStore(s => s.dtcs);
   const liveData       = useAppStore(s => s.liveData);
   ```

   Keep **unchanged** the effects for IPC wiring, freeze-frame auto-capture and auto-navigate-on-disconnect (current lines 157–193 and 209–236).

   Delete:
   - the session-timer state and effect (lines 195–207), which moved to `Toolbar`
   - the `livePIDCount/readingsPerSec` selector (238–245), which moved to `ConnectionPopover` and stops a store subscription recomputing on every PID reading
   - `battColor`, `connColor` and `connLabel` (247–263)

4. Add sidebar state and shortcuts:

   ```tsx
   const [sidebarOpen, setSidebarOpen] = React.useState(() => readSidebarPref(window.localStorage));
   const toggleSidebar = React.useCallback(() => {
     setSidebarOpen(open => { writeSidebarPref(window.localStorage, !open); return !open; });
   }, []);

   useEffect(() => {
     const onKey = (e: KeyboardEvent) => {
       const action = shortcutFor(e);
       if (!action) return;
       e.preventDefault();
       if (action === 'toggle-sidebar') toggleSidebar();
       else setActiveScreen('settings');
     };
     window.addEventListener('keydown', onKey);
     return () => window.removeEventListener('keydown', onKey);
   }, [toggleSidebar, setActiveScreen]);

   const Screen = SCREENS[activeScreen];
   ```

   `window.localStorage` itself can throw on access. Wrap both reads in a helper at module level:

   ```ts
   const safeStorage = (): Storage | undefined => { try { return window.localStorage; } catch { return undefined; } };
   ```

   Use `safeStorage()` in place of `window.localStorage` above.

5. Replace the entire returned JSX with:

   ```tsx
   return (
     <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: FONTS.ui, ...TYPE.body, color: 'var(--label)' }}>
       {sidebarOpen && (
         <Sidebar
           active={activeScreen}
           onSelect={setActiveScreen}
           dtcCount={activeDTCCount}
           connectionAlert={connectionStatus === 'disconnected' || connectionStatus === 'error'}
         />
       )}
       <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--content)' }}>
         <Toolbar
           sidebarOpen={sidebarOpen}
           onToggleSidebar={toggleSidebar}
           onOpenDTC={() => setActiveScreen('dtc')}
           onOpenConnection={() => setActiveScreen('connect')}
         />
         <main key={activeScreen} className="screen-enter" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
           <Screen />
         </main>
       </div>
       <style>{`${buildThemeCSS()}\n${GLOBAL_CSS}\n${LEGACY_CSS}`}</style>
     </div>
   );
   ```

When the sidebar is hidden, the capture harness can't find `[data-screen]`. That's acceptable, because the harness always starts with the default (open) preference.

- [ ] **Step 8: Add the Appearance setting to `SettingsScreen.tsx`**

Add the imports:

```ts
import type { Appearance } from '../../shared/types';
import { Card, SectionHeader, SegmentedControl } from '../components/layout/UIComponents';
import { TYPE } from '../theme/theme';
```

Inside `SettingsScreen()`, after the existing `useState` lines, add:

```tsx
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  useEffect(() => { window.electronAPI.getAppearance().then(setAppearanceState).catch(() => {}); }, []);
  const changeAppearance = async (a: Appearance) => {
    setAppearanceState(a);
    setAppearanceState(await window.electronAPI.setAppearance(a));
  };
```

Make these the first children of the returned root `<div>`:

```tsx
      <SectionHeader>Appearance</SectionHeader>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ ...TYPE.body, color: 'var(--label)' }}>Theme</span>
          <SegmentedControl<Appearance>
            ariaLabel="Theme"
            value={appearance}
            onChange={changeAppearance}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light',  label: 'Light' },
              { value: 'dark',   label: 'Dark' },
            ]}
          />
        </div>
      </Card>
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm test && npm run build && node scripts/capture-screens.mjs .screens/t5 --only live,settings,dtc`

Open `live-light.png` and `live-dark.png`. Expected:
- A 220px sidebar with grouped, sentence-case rows and the selected row tinted.
- A 52px toolbar with the vehicle title and subtitle, connection item, battery and timer.
- No tab strip, no bottom status bar and no "AGADOR SPARTACUS — LIVE TELEMETRY" header. `StatusBar` renders null.

Then run `npx electron .` and check each of these:
- ⌃⌘S hides and shows the sidebar, and a relaunch keeps the choice.
- ⌘, opens Settings.
- Typing `s` or `,` into any input does nothing special.
- Clicking the connection item opens the popover with protocol, PIDs and rate. Esc and an outside click close it.
- Settings → Theme → Dark while macOS is Light turns the whole window dark, sidebar material included. After a restart it's still dark. Choosing System follows macOS again.
- In simulator mode with DTCs present, the toolbar shows the red code count and clicking it opens Fault codes.
- The traffic lights sit vertically centered in the 52px band.
- The window can be dragged by the empty toolbar area and the sidebar top.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/components/shell src/renderer/App.tsx src/renderer/screens/SettingsScreen.tsx
git commit -m "feat(shell): native sidebar, unified toolbar, connection popover, appearance setting"
```

---

### Task 6: Record the known issues for the code review

**Files:**
- Create: `../docs/superpowers/code-review-notes.md`

- [ ] **Step 1: Write the file**

```markdown
# Issues noticed during the macOS redesign

Recorded for the code review. Fixed here only where the redesign had to touch the line anyway.

| Where | Issue | Status |
|---|---|---|
| `files/src/renderer/index.html` | `<script src="renderer.bundle.js">` — webpack emits `renderer.js` and HtmlWebpackPlugin injects it; this tag 404s | open |
| `files/src/renderer/index.html` | CSP allows fonts.googleapis.com / fonts.gstatic.com, no longer used after the redesign | removed in cleanup task |
| `files/src/renderer/screens/PcmScreen.tsx:47` | `var(--tp)` was never defined | aliased to `--label` (Task 1), removed in PCM sweep |
| `files/src/renderer/App.tsx` (old) | Connected chip hard-coded "OBDLink MX+" regardless of adapter | fixed by shell (uses `adapterInfo`) |
| `files/src/renderer/App.tsx` (old) | Status-bar selector recomputed on every PID reading | fixed by shell (computed only while popover open) |
```

- [ ] **Step 2: Commit**

```bash
git add ../docs/superpowers/code-review-notes.md
git commit -m "docs: record issues found during redesign for code review"
```

Append a row to this file whenever a later task finds a bug. Commit it together with that task.

---

### Task 7: Sweep the core screens: Live, Health

**Files:**
- Modify: `src/renderer/screens/LiveScreen.tsx` (baseline: 2 hex, legacy `HeroCard`/`StatusBar`)
- Modify: `src/renderer/screens/HealthScreen.tsx` (baseline: 5 rgba, 7 font, 8 border)

**Interfaces:**
- Consumes: the barrel components from Task 4, and `TYPE`, `NUMERIC` and `WEIGHT` from `theme.ts`.
- Produces: nothing new.

- [ ] **Step 1: LiveScreen.** Apply the Sweep Procedure S1–S7 to `LiveScreen.tsx`. Specifics:
  - Delete the `<StatusBar />` element (line ~45) and its import.
  - Lines ~199 and ~201: the battery `'#9B8AFF'` becomes `status={usePIDNum('ATRV') < 12.0 ? 'crit' : 'neutral'}` on the `Metric`, with a bar color from status. Purple is no longer needed.
  - Convert every `HeroCard` to `<Metric size="hero" … spark={{ pid, color: 'var(--accent)' }} />`.
  - Tiles showing `—` for unsupported PIDs (e.g. STFT B2 on a single-bank read) keep rendering `—` in tertiary via `Metric`. Do not add EmptyState per tile.
  - S6 flows: gauges animate with the simulator, stale dots flip after you disconnect, and tooltips open on hover and on Tab focus.

- [ ] **Step 2: HealthScreen.** Apply S1–S7. Specifics:
  - The MIL indicator (`animation: milOn ? 'blink 2s infinite'`, line ~206) becomes `className={milOn ? 'pulse' : undefined}` on a dot filled with `var(--crit)`.
  - The connection summary tiles at lines ~389–401 map to `status` with `connectionTone` from `components/shell/shellLogic`.
  - S6 flows: every navigation link or button on the Health page jumps to the right screen.

---

### Task 8: Sweep the core screens: DTC, Connection

**Files:**
- Modify: `src/renderer/screens/DTCScreen.tsx` (baseline: 3 rgba, 21 font, 9 ls, 9 tt, 8 border)
- Modify: `src/renderer/screens/ConnectionScreen.tsx` (baseline: 2 hex, 7 rgba, 15 font, 12 border)

- [ ] **Step 1: DTCScreen.** Apply S1–S7. Specifics:
  - Active-DTC blink (line ~83) becomes `className="pulse"`.
  - Code identifiers (`P0300` etc.) use `...NUMERIC`.
  - Descriptions stay sans.
  - Severity uses `Badge` (`crit` active, `warn` pending, `muted` permanent/history).
  - An empty code list shows `<EmptyState icon="ti-circle-check" title="No fault codes" message="Run a scan to read stored, pending and permanent codes." />`.
  - S6 flows: Scan, Clear (confirm dialog still shows), CarsXE lookup (without a key it errors gracefully), and the freeze-frame link.

- [ ] **Step 2: ConnectionScreen.** Apply S1–S7. Specifics:
  - Lines ~470 and ~529 use `'#000'`/`'#0B0B0B'` on accent. Replace with `Button variant="primary"`, or `var(--on-accent)` for the inner dot.
  - The busy blink (line ~313) becomes `className="pulse"`.
  - The port list becomes `DataRow`s with `onClick`.
  - S6 flows: list ports, select the simulator, Connect, Disconnect, and the error state (disconnect mid-init).

---

### Task 9: Sweep the core screens: Parasitic draw

**Files:**
- Modify: `src/renderer/screens/ParasiteScreen.tsx` (baseline: 2 hex, 5 rgba, 16 font, 8 border)

- [ ] **Step 1: ParasiteScreen.** Apply S1–S7. Specifics:
  - Line ~72 `lineColor` and line ~506 `'#9B8AFF'` become `'var(--purple)'` for the chart series. The metric value uses `status`.
  - `riskColor(riskScore)` (line ~496): add a sibling `riskStatus(score): Status` in the same file that returns `'crit' | 'warn' | 'neutral'` using the same cut-offs, and pass `status={riskStatus(riskScore)}`. Keep `riskColor` only if the chart still needs a stroke; otherwise delete it.
  - The fuse map cells take state colors from `STATUS_FILL` (`confirmed` → crit, `suspect` → warn, `cleared` → ok). Cell labels use `...NUMERIC` at `TYPE.caption`.
  - Isolation checklist steps are `DataRow`s with a leading check icon.
  - S6 flows: start and stop the voltage timeline, toggle fuse states, and step through the isolation protocol forward and back.

---

### Task 10: Sweep the subsystem screens

**Files:**
- Modify: `src/renderer/screens/EngineScreen.tsx` (22 style blocks)
- Modify: `src/renderer/screens/ElectricalScreen.tsx` (24)
- Modify: `src/renderer/screens/HVACScreen.tsx` (37)
- Modify: `src/renderer/screens/TransmissionScreen.tsx` (16, 1 hex)

- [ ] **Step 1: EngineScreen.** Apply S1–S7. The `valueColor` ternaries at lines ~100, 110, 142, 151 and 270 become `status` ternaries per the mapping table. The constant `"var(--sg)"` props at lines ~188, 253 and 283 are deleted.
- [ ] **Step 2: ElectricalScreen.** Apply S1–S7. `voltageColor` (line ~160) becomes `voltageStatus` from `batteryStatus` in `shellLogic` (`'none'` maps to `'neutral'`). The `voltageTrend` and `voltDropRate` ternaries become `status`.
- [ ] **Step 3: HVACScreen.** Apply S1–S7. The coolant ternary at line ~69 becomes `status={coolantF > 230 ? 'crit' : coolantF > 215 ? 'warn' : 'neutral'}`. The heater-delta ternaries (lines ~97 and ~129) become `status` where "good" is neutral.
- [ ] **Step 4: TransmissionScreen.** Apply S1–S7. The gear selector (line ~46, `'#000'` on the active gear) becomes a read-only `SegmentedControl`-styled display. It shows state and isn't interactive, so render it as a row of 24px capsules where the active capsule is `background: 'var(--accent)', color: 'var(--on-accent)'` and the others are `var(--fill)`/`var(--label-2)`.

Each screen gets its own commit (S7).

---

### Task 11: Sweep All PIDs, Logger and Modules

**Files:**
- Modify: `src/renderer/screens/AllPIDsScreen.tsx` (35 style blocks)
- Modify: `src/renderer/screens/DataLoggerScreen.tsx` (30 style blocks, 13 border)
- Modify: `src/renderer/screens/ModulesScreen.tsx` (18 style blocks, `WaveBar`)

- [ ] **Step 1: AllPIDsScreen.** Apply S1–S7. The PID table becomes `DataRow`s (`pid`, `name`, `value`, a `Badge` for supported/unsupported). The filter input uses the global input style, with no inline border. S6 flows: search filter, category filter, and CSV export.
- [ ] **Step 2: DataLoggerScreen.** Apply S1–S7. The interval chooser becomes a `SegmentedControl`. Start is `Button variant="primary"` and Stop is `variant="destructive"`. The recordings list uses `DataRow`s. With no recordings, show `<EmptyState icon="ti-activity" title="No recordings" message="Choose PIDs and press Record." />`. S6 flows: start, stop, save, export CSV and delete a recording.
- [ ] **Step 3: ModulesScreen.** Apply S1–S7. Replace `<WaveBar color active />` (line ~154) with `<Badge label={mod.status === 'rogue' ? 'Rogue' : mod.status === 'alive' ? 'Awake' : 'Asleep'} variant={mod.status === 'rogue' ? 'crit' : mod.status === 'alive' ? 'ok' : 'muted'} />`, and drop the `WaveBar` import. S6 flows: Check modules and the rogue-module alert.

---

### Task 12: Sweep the advanced and records screens: PCM, EcuBus, Compare, Freeze, Logs, Assistant, Settings

**Files:**
- Modify: `src/renderer/screens/PcmScreen.tsx` (11 style blocks; `var(--tp)` at line ~47)
- Modify: `src/renderer/screens/EcuBusScreen.tsx` (213 style blocks; do it last in this task, possibly as several commits by tab)
- Modify: `src/renderer/screens/CompareScreen.tsx` (59; 1 hex at line ~246)
- Modify: `src/renderer/screens/FreezeFrameScreen.tsx` (31)
- Modify: `src/renderer/screens/LogsScreen.tsx` (25)
- Modify: `src/renderer/screens/AssistantScreen.tsx` (65)
- Modify: `src/renderer/screens/SettingsScreen.tsx` (23, hard-coded JetBrains font at line ~45)

- [ ] **Step 1: PcmScreen.** Apply S1–S7. Line ~47 `color: 'var(--tp)'` becomes `color: 'var(--label)'`. Identity fields (VIN, HW/SW IDs, calibration IDs) are `DataRow`s with `NUMERIC` values and the `selectable` class. The read-only notice stays as `AlertBanner variant="info"`. S6: Read IDs shows progress and then the results.
- [ ] **Step 2: CompareScreen.** Apply S1–S7. Line ~246 `'#000'` on an accent button becomes `Button variant="primary" disabled={!hasLive}`. The mode switch becomes a `SegmentedControl`. S6: select a snapshot, compare to live, and delete a snapshot.
- [ ] **Step 3: FreezeFrameScreen.** Apply S1–S7. With no frames, show `<EmptyState icon="ti-camera" title="No freeze frames" message="Frames are captured automatically when a new fault code appears." />`. S6: open a frame, filter by code, delete.
- [ ] **Step 4: LogsScreen.** Apply S1–S7. Log lines use `NUMERIC` timestamps, level `Badge`s and the `selectable` class. S6: level filter and Export log.
- [ ] **Step 5: AssistantScreen.** Apply S1–S7.
  - Message bubbles: user messages on `var(--accent)` with `var(--on-accent)` text; assistant messages on `var(--grouped)` with a 1px separator. Radius 12.
  - The composer is a `textarea` using the global input style, with a `Button variant="primary" icon="ti-send"`.
  - The model picker uses a `select`.
  - S6: with no key, the key prompt shows. With a key (if available), send a message and watch it stream, test Cancel, and Export chat. The Claude-config panel saves.
- [ ] **Step 6: SettingsScreen.** Apply S1–S7. Line ~45's hard-coded `fontFamily: "'JetBrains Mono','Roboto Mono',monospace"` becomes `...NUMERIC`. The storage-backend toggle becomes a `SegmentedControl<'local' | 'sqlite'>` wired to the existing `handleToggle`. The migration confirmation becomes `AlertBanner variant="warn"` plus `Button`s. S6: switch backend and confirm, switch and cancel, Open data folder, and the Appearance control from Task 5.
- [ ] **Step 7: EcuBusScreen.** Apply S1–S7, committing per tab or section if the diff gets large (`git commit -m "style(renderer): restyle EcuBus <tab> for macOS design"`).
  - The tab strip becomes a `SegmentedControl`.
  - Frame tables use `NUMERIC` for IDs and data bytes at `TYPE.caption`, zebra-free, with hairline row dividers via `DataRow` or a `<table>` using `borderBottom: '1px solid var(--separator)' // style-ok: table cell divider`.
  - Replace `WaveBar` with a `Badge`.
  - S6: every tab renders, and TX/RX counters update in simulator mode, if supported. Otherwise note it in `code-review-notes.md`.

---

### Task 13: Cleanup (remove legacy aliases, wrappers and fonts)

**Files:**
- Modify: `src/renderer/theme/theme.ts` (delete `LEGACY_ALIASES`, the `FONTS.body`/`FONTS.display` aliases, and the alias `declare(...)` call)
- Modify: `src/renderer/theme/theme.test.ts` (drop the legacy-alias test; assert no `--tm:` in CSS)
- Modify: `src/renderer/theme/globalStyles.ts` (delete `LEGACY_CSS`)
- Modify: `src/renderer/App.tsx` (stop injecting `LEGACY_CSS`)
- Delete: `src/renderer/components/ui/legacy.tsx`
- Modify: `src/renderer/components/layout/UIComponents.tsx` (drop the legacy export line)
- Modify: `src/renderer/components/ui/barrel.test.ts` (expect the legacy names to be absent)
- Modify: `src/renderer/components/ui/containers.tsx` (drop `accentColor` from `CardProps`)
- Modify: `src/renderer/components/ui/controls.tsx` (drop `'ghost' | 'danger'` and `normalize`)
- Modify: `src/renderer/store/appStore.ts` (delete `isDarkMode`, `toggleDarkMode`: lines ~72, 108, 221, 373)
- Modify: `src/renderer/index.html` (CSP: remove `https://fonts.googleapis.com https://fonts.gstatic.com`)

- [ ] **Step 1: Update the tests first**

In `theme.test.ts`, replace the `'every legacy alias points at a defined token'` test with:

```ts
test('no legacy variable names remain', () => {
  const css = buildThemeCSS();
  for (const old of ['--bg:', '--bg2:', '--tw:', '--tm:', '--pp:', '--sg:', '--sa:', '--sr:', '--gb:', '--br:']) {
    assert.ok(!css.includes(old), old);
  }
});
```

Also remove `LEGACY_ALIASES` from its import line, and the `/--tm: var\(--label-2\);/` assertion.

In `barrel.test.ts`, replace the test body with:

```ts
test('barrel exports the new components and no legacy wrappers', () => {
  for (const name of ['Grid', 'ScrollPane', 'SectionHeader', 'Card', 'Tooltip', 'TipContent', 'Badge', 'AlertBanner',
    'DataRow', 'Button', 'Sparkline', 'Metric', 'Gauge', 'SegmentedControl', 'EmptyState', 'Divider']) {
    assert.equal(typeof (UI as Record<string, unknown>)[name], 'function', name);
  }
  for (const gone of ['MetricTile', 'HeroCard', 'DenseMetricTile', 'ArcGauge', 'CompactArcGauge', 'WaveBar', 'StatusBar']) {
    assert.equal((UI as Record<string, unknown>)[gone], undefined, gone);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL on `--tm:` and on `MetricTile`.

- [ ] **Step 3: Delete the legacy code** listed under Files, then run:

`grep -rnE "var\(--(bg|bg2|bg3|bg4|br|bs|tw|tm|tp|pp|gb|sg|sa|sr)\)|FONTS\.(body|display)|isDarkMode|toggleDarkMode|variant=\"(ghost|danger)\"" src/renderer`

Expected: no output. Fix any hit per the Sweep mapping table.

- [ ] **Step 4: Lint the whole renderer**

Run: `node scripts/check-styles.mjs src/renderer/screens/*.tsx src/renderer/App.tsx src/renderer/components/shell/*.tsx`
Expected: `0 violations`.

The `components/ui/*` files legitimately set borders. They're the only place allowed to, so they're excluded.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm test && npm run build && node scripts/capture-screens.mjs .screens/final`

Open every `.screens/final/*-light.png` and `*-dark.png` (38 files) and apply the S5 checklist to each. Then run `npx electron .` for a final smoke test: connect in simulator mode, visit every screen via the sidebar, use ⌃⌘S and ⌘,, and switch the theme through System, Light and Dark.

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer
git commit -m "refactor(renderer): remove legacy theme aliases, wrappers and web fonts"
```

---

### Task 14: Docs

**Files:**
- Modify: `../.kiro/steering/tech.md`, section "UI / styling"
- Modify: `../README.md`, screenshots section
- Replace: `../docs/screenshots/{live,health,dtc,modules,draw}.png`

- [ ] **Step 1: Update the steering doc.** Replace the "UI / styling" section of `../.kiro/steering/tech.md` with:

```markdown
## UI / styling

macOS-native design (reference: Xcode, Instruments, Activity Monitor). Spec: `docs/superpowers/specs/2026-09-26-macos-redesign-design.md`.

- Inline React style objects + CSS custom properties. No CSS modules, Tailwind, or styled-components.
- Tokens live in `renderer/theme/theme.ts` (`LIGHT`/`DARK` palettes, `TYPE`, `NUMERIC`, `SPACE`, `RADIUS`, `MOTION`, `STATUS_TEXT`/`STATUS_FILL`). CSS is generated by `buildThemeCSS()` under `prefers-color-scheme`; global pseudo-class CSS is in `theme/globalStyles.ts`.
- Appearance: main process sets `nativeTheme.themeSource` from the saved override (`main/appearance.ts`); Settings → Theme (System / Light / Dark).
- Screens compose components from `components/layout/UIComponents.tsx` (implementations in `components/ui/`). Screens never set colours, font families, letter-spacing, text-transform, or borders — enforced by `npm run lint:styles <files>`.
- Fonts: SF Pro via `-apple-system`; SF Mono (`NUMERIC`) only for numbers, VINs, hex and PIDs. No web fonts — the app works offline.
- Status colour appears only for warn/crit; normal readings are neutral.
- Icons: Tabler Icons webfont, bundled locally, 16px in chrome.
- Visual checks: `npm run build && node scripts/capture-screens.mjs <dir>` writes light + dark PNGs of every screen.
```

- [ ] **Step 2: Refresh the README screenshots.** Run `npx electron .` in simulator mode, then capture the Live, Health, DTC, Modules and Parasitic draw screens. Use `screencapture -w` (click the window) so the native sidebar material is included, and save over the five files in `../docs/screenshots/`. Check that `../README.md` still references those five filenames.

- [ ] **Step 3: Commit**

```bash
git add ../.kiro/steering/tech.md ../README.md ../docs/screenshots
git commit -m "docs: document macOS design system and refresh screenshots"
```
