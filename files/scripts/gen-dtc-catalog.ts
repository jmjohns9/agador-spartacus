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
import { writeFileSync, existsSync } from 'fs';
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
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => { headers[col - 1] = String(cell.value ?? ''); });

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
  let parsedRows = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = String(row.getCell(colCode + 1).value ?? '').trim().toUpperCase();
    const desc = String(row.getCell(colDesc + 1).value ?? '').trim();
    if (!code || !desc) return;

    const rec: DTCRecord = { description: desc };
    if (colModule >= 0) {
      const m = String(row.getCell(colModule + 1).value ?? '').trim();
      if (m) rec.module = m;
    }
    if (colCauses >= 0) {
      const c = splitList(row.getCell(colCauses + 1).value);
      if (c) rec.causes = c;
    }
    if (colRepair >= 0) {
      const r = String(row.getCell(colRepair + 1).value ?? '').trim();
      if (r) rec.repair = r;
    }
    catalog[code] = rec;
    parsedRows += 1;
  });

  if (parsedRows === 0) {
    console.error(`ERROR: no usable rows found in "${sheet.name}". Check the column headers.`);
    process.exit(1);
  }

  const banner = `// AUTO-GENERATED — do not edit by hand.
// Source: ${XLSX_PATH.replace(REPO_ROOT + '/', '')}
// Generated: ${new Date().toISOString()}
// Codes:    ${parsedRows}
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

  writeFileSync(OUTPUT, body, 'utf-8');
  console.log(`Wrote ${OUTPUT} (${parsedRows} codes from "${sheet.name}").`);
}

main().catch((err) => { console.error(err); process.exit(1); });
