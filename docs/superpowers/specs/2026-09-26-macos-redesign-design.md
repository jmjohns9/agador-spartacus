# macOS-Native Visual Redesign — Design

**Date:** 2026-09-26
**Status:** Approved in brainstorming; pending written-spec review
**Scope:** Renderer styling + app shell. No logic, IPC, or store changes.

## Goal

Make Project Agador Spartacus look and feel like a first-party macOS pro app (reference points: Xcode, Instruments, Activity Monitor). Today the UI reads as a terminal: all-caps letter-spaced labels, monospace everywhere, 0 radius, 2px borders, GitHub-dark palette, a cramped 84px icon rail, and small gauges with ~6px text.

## Decisions

| Decision | Choice |
|---|---|
| Visual direction | Native macOS pro app |
| Scope | Restyle + app shell (screens keep their layout and features) |
| Styling approach | Keep inline React styles + CSS custom properties; rebuild tokens and shared components; sweep screens |
| Appearance | Follows macOS system appearance; Settings offers System / Light / Dark override |
| Sequencing | A separate full code review (own spec/plan) runs **before** this redesign is executed |

Rejected: moving to CSS/class-based styling (breaks the project convention, touches every JSX line), adopting a component library such as Radix/shadcn (web look, requires Tailwind, heaviest dependency change).

## Section 1 — Design tokens (`files/src/renderer/theme/theme.ts`)

### Typography
- UI text: `-apple-system, BlinkMacSystemFont, system-ui, sans-serif` (SF Pro).
- Data values only (numbers, VINs, hex, PID IDs): `ui-monospace, 'SF Mono', Menlo, monospace` with `font-variant-numeric: tabular-nums`.
- Remove the Google Fonts `@import` (Plus Jakarta Sans, JetBrains Mono). The app must render correctly offline.
- Type scale (px): caption 11, body 13, headline 15, title3 17, title2 22, title1 28, display 34.
- Weights: 400, 510, 590, 700.
- No uppercase transforms and no letter-spacing on labels or headers. Section headers are sentence case.

### Color
Semantic tokens, each with light and dark values based on Apple system colors:
- Backgrounds: `window`, `content`, `grouped` (cards), `elevated` (popovers/tooltips).
- Text: `label`, `secondaryLabel`, `tertiaryLabel`, `quaternaryLabel`.
- `separator` (1px hairline).
- Accent: systemBlue — light `#007AFF`, dark `#0A84FF`.
- Status: systemGreen / systemOrange / systemRed — dark `#30D158` / `#FF9F0A` / `#FF453A`, light `#34C759` / `#FF9500` / `#FF3B30`. Light-mode status *text* uses Apple's accessible variants — `#248A3D` / `#C93400` / `#D70015` — which meet WCAG AA on the grouped background.
- Data series: systemTeal, systemIndigo, systemPurple, systemPink.
- Tint helper: status/accent colors at low alpha for badge and callout backgrounds.

### Shape and spacing
- 4pt grid: 4, 8, 12, 16, 20, 24, 32.
- Radius: controls 6, cards 10, panels 12. `BORDER_RADIUS = 0` and `BORDER_WIDTH = 2` are removed.
- Borders are 1px `separator`. Shadows only on floating surfaces (popovers, tooltips).

### Motion
- 150–250ms ease-out transitions. Remove the blur-in screen animation and spring/bounce easings.
- Honour `prefers-reduced-motion: reduce` (disable non-essential transitions).

### Appearance
- Renderer resolves theme from `prefers-color-scheme` unless the user override is Light or Dark.
- Main process reads `nativeTheme` for the window `backgroundColor` so there is no wrong-colour flash at launch.

### Migration
- Existing CSS variable names (`--bg`, `--bg2`, `--pp`, `--sg`, `--sa`, `--sr`, `--tw`, `--tm`, `--br`, …) remain as aliases of the new tokens during the sweep so every unswept screen still renders. Aliases are removed in the cleanup step.

## Section 2 — App shell (`App.tsx`, `main/main.ts`)

### Window
- Keep `titleBarStyle: 'hiddenInset'`; set `trafficLightPosition` so the traffic lights are vertically centred in the 52px toolbar.
- `vibrancy: 'sidebar'` for the sidebar region; the content area stays opaque.
- `backgroundColor` derived from `nativeTheme.shouldUseDarkColors` (replaces hardcoded `#0D1117`).

### Sidebar
- 220px source list replacing the 84px icon rail.
- Rows: 28px, 16px Tabler icon + full label (e.g. "Live telemetry"). Selected row: rounded accent-tint fill; no gradient or inset glow.
- Group headers unchanged in grouping (Overview, Subsystems, Diagnostic, Advanced, Records); sentence case, 11px semibold, tertiary label colour.
- Connect and Claude in the top, un-headed group. Settings pinned to the sidebar bottom and also opened by ⌘,.
- Collapsible via toolbar button and ⌃⌘S; collapsed state persisted in `localStorage` (try/catch guarded).
- DTC row shows a red count badge when active codes exist.

### Unified toolbar (52px, `-webkit-app-region: drag`)
- Left: sidebar toggle, vehicle name as title, "VIN · engine" subtitle.
- Right: connection item (status dot, adapter, protocol; click opens a popover with read rate, live PID count, and Disconnect), battery voltage (status-coloured), CEL count (click navigates to DTC), session timer.
- Interactive elements inside the toolbar use `-webkit-app-region: no-drag`.
- The theme toggle moves to Settings.
- Remove per-screen duplicate titles (e.g. "AGADOR SPARTACUS — LIVE TELEMETRY") and the screen tab strip.

### Bottom status bar
- Removed; its PROTO / PIDs / RATE fields move into the connection popover.

### Icons
- Keep Tabler Icons (bundled, offline). Standardise at 16px, 1.5 stroke.

## Section 3 — Component library (`components/layout/UIComponents.tsx`)

### Containers
- `Card`: grouped background, 10px radius, 1px separator border, 16px padding. `accentColor` left bar removed.
- `SectionHeader`: 13px semibold, sentence case, optional trailing action slot. No rule line.
- `Grid`, `ScrollPane`: API unchanged; default gap 12.

### Metrics
- `Metric` replaces `HeroCard`, `MetricTile`, `DenseMetricTile`; prop `size: 'hero' | 'regular' | 'compact'`.
  - Label 11px secondary sans. Value SF Mono tabular in `label` colour; switches to status colour **only** at warn/crit.
  - Unit smaller, secondary, baseline-aligned with the value.
  - Range bar: 4px rounded track, subtle fill.
  - Info (ⓘ) icon visible on hover/focus only; tooltip content unchanged.
- `Gauge` replaces `ArcGauge`, `CompactArcGauge`; prop `size`. 240° sweep, 8px stroke with round caps, large centred value, min/max as quiet ticks. Minimum rendered text size 11px.
- `Sparkline`: smoothed line, gradient area fill, no axes. Data API unchanged.

### Controls
- `Button`: variants `primary` (accent fill), `secondary` (bezel), `plain` (text), `destructive`; sizes 28px and 22px; 6px radius; visible `:focus-visible` accent ring.
- New `SegmentedControl` replacing hand-rolled tab/toggle groups in screens (logger interval, compare mode, theme override).
- `Badge`: capsule, tinted background, status-coloured text.

### Feedback
- `AlertBanner`: inline callout — tinted background, icon, text, optional action button; no heavy border.
- `Tooltip`: popover style — elevated background, backdrop blur, shadow, 8px radius.
- `DataRow`: 32px list row, hairline divider, hover highlight.
- New `EmptyState`: icon + title + one line of help text, used where a PID or panel has no data instead of a bare "—".
- Removed: `WaveBar` (decorative), `StatusBar` (moved to toolbar popover).

### Rules
- Components read tokens only.
- Screens compose components and must not set colours, font families, letter-spacing, or borders directly.
- Old export names stay as thin wrappers over the new components until the cleanup step.

## Section 4 — Screen sweep and verification

### Order (one commit per step; app runs after each)
1. Tokens + app shell (aliases keep all screens rendering).
2. Component library (with compatibility wrappers).
3. Core: Live, Health, DTC, Connection, Parasite.
4. Subsystems: Engine, Electrical, HVAC, Transmission, All PIDs, Logger, Modules.
5. Advanced: PCM, then EcuBus (1,200 lines; own step).
6. Records/misc: Compare, FreezeFrame, Logs, Assistant, Settings.
7. Cleanup: remove CSS var aliases, compatibility wrappers, Google Fonts import, unused theme exports.
8. Docs: update `.kiro/steering/tech.md` styling rules and README screenshots.

### Per-screen done criteria
- Grep of the screen file finds no hex colour literals, `fontFamily`, `letterSpacing`, or `border:` style keys.
- `npm run typecheck` passes.
- App launched in simulator mode; screenshots captured in light and dark and reviewed against the pre-change screenshot.
- Every interactive control on the screen exercised in simulator mode; behaviour unchanged.

### Out of scope
- Logic, IPC, store, or `core/` changes.
- New features or screen merges.
- Bugs discovered during the sweep are recorded for the code review, not fixed here.

## Constraints carried forward
- `contextIsolation: true`, `nodeIntegration: false` unchanged.
- No new runtime dependencies.
- Nothing writes to a control module (unaffected by this work).
