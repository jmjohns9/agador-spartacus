const path = require('path');
const fs = require('fs');

// Use globally-installed docx
const docxPath = '/Users/joshuajohnson/.npm-global/lib/node_modules/docx';
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, LevelFormat, PageOrientation,
  Header, Footer, BorderStyle,
} = require(docxPath);

const FONT = 'Arial';

const p = (text, opts = {}) => new Paragraph({
  spacing: { after: 100, ...(opts.spacing || {}) },
  alignment: opts.alignment,
  children: [new TextRun({ text, font: FONT, size: 20, ...(opts.run || {}) })],
});

const richP = (runs, opts = {}) => new Paragraph({
  spacing: { after: 100, ...(opts.spacing || {}) },
  alignment: opts.alignment,
  children: runs.map(r => new TextRun({ font: FONT, size: 20, ...r })),
});

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 200, after: 120 },
  children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: 'FF8000' })],
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 160, after: 80 },
  children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: '003D7A' })],
});

const bullet = (runs) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  spacing: { after: 60 },
  children: runs.map(r => typeof r === 'string'
    ? new TextRun({ text: r, font: FONT, size: 20 })
    : new TextRun({ font: FONT, size: 20, ...r })),
});

const numbered = (runs) => new Paragraph({
  numbering: { reference: 'numbers', level: 0 },
  spacing: { after: 60 },
  children: runs.map(r => typeof r === 'string'
    ? new TextRun({ text: r, font: FONT, size: 20 })
    : new TextRun({ font: FONT, size: 20, ...r })),
});

const code = (text) => new TextRun({
  text, font: 'Consolas', size: 18,
  shading: { type: 'clear', fill: 'F2F2F2', color: 'auto' },
});

const doc = new Document({
  creator: 'Claude',
  title: 'Silverado DX — One-Page Summary',
  styles: {
    default: {
      document: { run: { font: FONT, size: 20 } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } },
        }],
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: 'Silverado DX — Project Summary',
            font: FONT, size: 16, color: '888888',
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: '2004 Chevrolet Silverado 1500 Z71 • GMT800 • J1850 VPW',
            font: FONT, size: 16, color: '888888',
          })],
        })],
      }),
    },
    children: [
      // Title
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({
          text: 'Silverado DX', font: FONT, size: 40, bold: true, color: 'FF8000',
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
          text: 'OBD-II Parasitic Draw Diagnostic Suite — One-Page Summary',
          font: FONT, size: 22, italics: true, color: '003D7A',
        })],
      }),

      // What it does
      h1('What it does'),
      p('A macOS desktop diagnostic application targeted at a single vehicle: a 2004 Chevrolet Silverado 1500 Z71 (GMT800 platform, 5.3 L Vortec V8 LM7, J1850 VPW bus). It connects to an OBD-II adapter and provides live telemetry, fault-code reading, module monitoring, and — its centerpiece — a guided parasitic battery draw diagnostic suite built around the well-known GMT800 “instrument cluster won’t sleep” failure mode.'),
      p('Top-level screens: Live telemetry, Health overview, full PID browser, Engine, Electrical, HVAC, Transmission, DTCs, Modules (wake monitor), Parasite (draw analysis), Compare (live vs. historic), and Logs.'),

      // Technology
      h1('Technology stack'),
      bullet([{ text: 'Shell: ', bold: true }, 'Electron 31 with a main / preload / renderer split and secure ', code('contextBridge'), ' IPC.']),
      bullet([{ text: 'UI: ', bold: true }, 'React 18 + TypeScript, bundled with webpack; global state in Zustand.']),
      bullet([{ text: 'Theme: ', bold: true }, 'Custom McLaren-inspired CSS variable system (Papaya orange + Gulf Blue), Barlow Condensed and JetBrains Mono.']),
      bullet([{ text: 'Adapter I/O: ', bold: true }, 'OBDLink MX+ over Bluetooth RFCOMM via the ', code('serialport'), ' module; ELM327 v1.5 AT command engine.']),
      bullet([{ text: 'Protocol: ', bold: true }, 'SAE J1850 VPW (10.4 kbps GM Class II) auto-locked via ', code('ATSP0'), ' + ', code('010C'), ' ping.']),
      bullet([{ text: 'PID engine: ', bold: true }, 'SAE J1979 decode formulas; 3-tier polling loop (100 ms / 500 ms / 2000 ms).']),
      bullet([{ text: 'Offline mode: ', bold: true }, 'Built-in ELM327 simulator that emulates a full session — including a 12.89 V → 11.8 V drift over 4 h and the IPC-won’t-sleep bug — so the app boots without hardware.']),
      bullet([{ text: 'Persistence: ', bold: true }, code('better-sqlite3'), ' for session and history logs.']),
      bullet([{ text: 'Packaging: ', bold: true }, code('npm run dist'), ' → ', code('Silverado DX-1.0.0.dmg'), '.']),

      // Parasitic feature
      h1('Parasitic Electrical Feature'),
      p('This is the reason the app exists: a 2004 Silverado that goes dead overnight. The feature is split across two screens — Electrical for live signals and Parasite (Phase 4) for the guided diagnostic — sharing the vehicle’s fuse map, module map, and checklist from a single vehicle profile.'),

      h2('What it does'),
      bullet([{ text: 'Streams battery voltage continuously via the ELM327 ' }, code('ATRV'), ' command and the ECM rail PID ', code('0142'), '.']),
      bullet(['Plots an SVG voltage timeline against four reference lines (12.6 Full / 12.4 50% / 12.0 Crit / 11.8 Dead) and computes drift over the visible window.']),
      bullet(['Calculates a discharge rate in mV/min from the last ten samples and classifies it (Normal / Moderate / High) against published parasitic-current thresholds (<25 mA normal → 500+ mA severe).']),
      bullet(['Compares battery voltage to the ECM supply rail to flag high wiring drop (>0.3 V) — a tell-tale of ground-strap or cable resistance.']),
      bullet(['Watches the GM Class II bus through a Module Wake Monitor across seven modules (PCM 0x10, IPC 0xE0, BCM 0x28, TCM 0x60, ABS 0x40, HVAC 0xA0, Radio 0xC0). Each module’s minutes-awake-post-engine-off and bus activity are tracked so the IPC-not-sleeping bug surfaces directly.']),
      bullet(['Surfaces the 2004 fuse map (IPFB + UHFRC panels) with each circuit’s amperage, downstream loads, related DTCs, and related modules. The TBC Battery Feed is pre-flagged as the #1 GMT800 culprit.']),

      h2('How it finds the parasitic loss'),
      p('A 14-step guided protocol drives the user through a fuse-pull bisection while the app records the voltage response in real time:'),
      numbered(['Confirm resting open-circuit voltage ≥ 12.6 V, close all doors / hood / trunk, kill accessories, and start the session timer.']),
      numbered(['Wait 10–15 minutes for modules to sleep — the Module Wake screen shows which modules actually do. Any module still chattering on the bus is the prime suspect.']),
      numbered([{ text: 'Record an ' }, code('ATRV'), ' baseline once the bus quiets.']),
      numbered(['Pull fuses in priority order — TBC Battery Feed (10 A) → Radio (15 A) → IPC B+ (10 A) → BCM (10 A) — and watch the timeline. The voltage trace flattening (drift collapsing toward 0 V/min) on a given pull identifies the offending circuit.']),
      numbered(['Branch into circuit-specific follow-ups: IPC → inspect C1/C2 connectors and verify the firewall ground strap is below 0.1 Ω; Radio → audit aftermarket head-unit memory wire; BCM → scan BCM DTCs over GM-LAN and check door-jamb dome switches.']),
      numbered(['Reinstall all fuses and retest with everything installed to confirm the repair.']),
      p('The diagnostic is corroborated by DTC cross-references on each fuse (e.g., B1982 and U0100 linked to TBC BATT / IPC / BCM) and by the simulator, which reproduces the exact failure pattern offline so the workflow can be rehearsed before touching the truck.', { spacing: { after: 80 } }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = '/Users/joshuajohnson/projects/obd/Silverado_DX_Summary.docx';
  fs.writeFileSync(out, buf);
  console.log('Wrote ' + out + ' (' + buf.length + ' bytes)');
});
