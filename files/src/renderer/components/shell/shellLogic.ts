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
