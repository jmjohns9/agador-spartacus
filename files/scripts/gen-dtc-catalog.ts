// Usage:  npm run gen:dtcs
//
// Reads files/data/dtc-catalog.xlsx (produced by the `dtc-catalog-builder`
// Claude skill) and emits files/src/core/dtcCatalog.generated.ts.
//
// The skill's primary tab is "DTC Inventory" with one row per code. The
// generator is column-name driven (not column-index) so non-breaking column
// additions on the skill side don't break this script.
//
// Required columns (case-insensitive, trimmed):
//   - code | dtc | dtc code
//   - description | fault description | concise description
// Optional, in priority order — the first one found wins:
//   - module | ecu | owning module
//   - causes | likely causes | root causes      (semicolon- OR newline-separated list)
//   - repair | repair summary | corrective action

import ExcelJS from 'exceljs';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT  = resolve(__dirname, '..');
const XLSX_PATH  = resolve(REPO_ROOT, 'data', 'dtc-catalog.xlsx');
const OUTPUT     = resolve(REPO_ROOT, 'src', 'core', 'dtcCatalog.generated.ts');
const PRIMARY_TAB_HINTS = ['dtc inventory', 'inventory', 'dtcs', 'catalog'];

interface DTCRecord {
  description: string;
  causes?: string[];
  repair?: string;
  module?: string;
}

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase();

const findColumn = (headers: string[], candidates: string[]): number => {
  const normed = headers.map(norm);
  for (const c of candidates) {
    const idx = normed.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
};

const splitList = (raw: unknown): string[] | undefined => {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  // Try newline first (the skill seems to emit one cause per line in some sheets),
  // fall back to semicolons.
  const parts = (s.includes('\n') ? s.split(/\n+/) : s.split(/;\s*/))
    .map(p => p.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
};

async function main(): Promise<void> {
  if (!existsSync(XLSX_PATH)) {
    console.error(`ERROR: ${XLSX_PATH} not found.`);
    console.error('Run the `dtc-catalog-builder` Claude skill and save its xlsx to that path, then re-run.');
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  const sheet =
    wb.worksheets.find(s => PRIMARY_TAB_HINTS.includes(norm(s.name))) ??
    wb.worksheets[0];
  if (!sheet) {
    console.error(`ERROR: ${XLSX_PATH} has no worksheets.`);
    process.exit(1);
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  // cell.text, not String(cell.value): rich-text, formula and hyperlink cells
  // are objects and stringify as "[object Object]"
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => { headers[col - 1] = cell.text ?? ''; });

  const colCode    = findColumn(headers, ['code', 'dtc', 'dtc code']);
  const colDesc    = findColumn(headers, ['description', 'fault description', 'concise description']);
  const colModule  = findColumn(headers, ['module', 'ecu', 'owning module']);
  const colCauses  = findColumn(headers, ['causes', 'likely causes', 'root causes']);
  const colRepair  = findColumn(headers, ['repair', 'repair summary', 'corrective action']);

  if (colCode < 0 || colDesc < 0) {
    console.error(`ERROR: sheet "${sheet.name}" is missing required columns (code, description).`);
    console.error(`  Headers seen: ${headers.filter(Boolean).join(', ')}`);
    process.exit(1);
  }

  const catalog: Record<string, DTCRecord> = {};
  const rejected: string[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = (row.getCell(colCode + 1).text ?? '').trim().toUpperCase();
    const desc = (row.getCell(colDesc + 1).text ?? '').trim();
    if (!code || !desc) return;
    if (!/^[PCBU][0-9A-F]{4}$/.test(code)) { rejected.push(`row ${rowNumber}: "${code}"`); return; }

    const rec: DTCRecord = { description: desc };
    if (colModule >= 0) {
      const m = (row.getCell(colModule + 1).text ?? '').trim();
      if (m) rec.module = m;
    }
    if (colCauses >= 0) {
      const c = splitList(row.getCell(colCauses + 1).text);
      if (c) rec.causes = c;
    }
    if (colRepair >= 0) {
      const r = (row.getCell(colRepair + 1).text ?? '').trim();
      if (r) rec.repair = r;
    }
    catalog[code] = rec;
  });

  if (rejected.length) console.warn(`Skipped ${rejected.length} rows with invalid codes: ${rejected.slice(0, 10).join(', ')}`);
  const count = Object.keys(catalog).length;   // duplicate rows count once
  if (count === 0) {
    console.error(`ERROR: no usable rows found in "${sheet.name}". Check the column headers.`);
    process.exit(1);
  }

  const banner = `// AUTO-GENERATED — do not edit by hand.
// Source: ${XLSX_PATH.replace(REPO_ROOT + '/', '')}
// Generated: ${new Date().toISOString()}
// Codes:    ${count}
// Regenerate via \`npm run gen:dtcs\`.\n`;

  const body =
    banner +
    `\nexport interface DTCRecord {
  description: string;
  causes?: string[];
  repair?: string;
  module?: 'PCM' | 'BCM' | 'IPC' | 'EBCM' | 'TCM' | 'Network' | string;
}\n
export const DTC_CATALOG: Record<string, DTCRecord> = ${JSON.stringify(catalog, null, 2)};

export const DTC_CATALOG_SIZE = Object.keys(DTC_CATALOG).length;
`;

  // The checked-in catalog is hand-curated (comments, module assignments).
  // Never replace it silently: write alongside it unless --force is given.
  const curated = existsSync(OUTPUT) && !readFileSync(OUTPUT, 'utf-8').startsWith('// AUTO-GENERATED');
  const target = curated && !process.argv.includes('--force') ? `${OUTPUT}.new` : OUTPUT;
  writeFileSync(target, body, 'utf-8');
  console.log(`Wrote ${target} (${count} codes from "${sheet.name}").`);
  if (target !== OUTPUT) {
    console.log('The existing catalog is hand-curated, so it was left alone. Compare the two files,');
    console.log('then re-run with --force to replace it.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
