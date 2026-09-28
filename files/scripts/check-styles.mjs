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
