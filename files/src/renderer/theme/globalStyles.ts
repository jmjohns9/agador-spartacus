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
