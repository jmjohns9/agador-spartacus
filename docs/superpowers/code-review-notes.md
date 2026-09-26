# Issues noticed during the macOS redesign

Recorded for the code review. Fixed here only where the redesign had to touch the line anyway.

| Where | Issue | Status |
|---|---|---|
| `files/src/renderer/index.html` | `<script src="renderer.bundle.js">` — webpack emits `renderer.js` and HtmlWebpackPlugin injects it; this tag 404s | open |
| `files/src/renderer/index.html` | CSP allows fonts.googleapis.com / fonts.gstatic.com, no longer used after the redesign | removed in cleanup task |
| `files/src/renderer/screens/PcmScreen.tsx:47` | `var(--tp)` was never defined | aliased to `--label` (Task 1), removed in PCM sweep |
| `files/src/renderer/App.tsx` (old) | Connected chip hard-coded "OBDLink MX+" regardless of adapter | fixed by shell (uses `adapterInfo`) |
| `files/src/renderer/App.tsx` (old) | Status-bar selector recomputed on every PID reading | fixed by shell (computed only while popover open) |
