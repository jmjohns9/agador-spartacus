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
