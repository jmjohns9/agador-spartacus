import type { PIDReading } from '../../shared/types';
import { statusFor } from '../theme/theme';
import type { Status } from '../theme/theme';
import { PID_MAP } from '../../core/pidCatalog';

// ─── Screen verdicts ──────────────────────────────────────────────────────────
//
// Pure logic behind the status colours and verdict text on the screens, kept
// out of JSX so it can be tested. Every threshold here is in the unit shown.

export interface Point { t: number; v: number }

const MIN = 60_000;

/** A value that is really a reading: 0 °F and negative trims count. */
export const isReading = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Battery voltage points from the store's history. History only gets a point
 * when the value changes, so the current reading is added as the latest
 * point: a value that has held for an hour is an hour of evidence.
 */
export function voltageSeries(history: readonly PIDReading[], current?: PIDReading): Point[] {
  const pts = history.filter(r => isReading(r.value)).map(r => ({ t: r.timestamp, v: r.value as number }));
  if (current && isReading(current.value) && (!pts.length || current.timestamp > pts[pts.length - 1].t)) {
    pts.push({ t: current.timestamp, v: current.value });
  }
  return pts;
}

export function windowMinutes(pts: readonly Point[]): number {
  return pts.length < 2 ? 0 : Math.round((pts[pts.length - 1].t - pts[0].t) / MIN);
}

// Above this the alternator is charging; the battery then settles for a while
// after the engine stops, which is surface charge, not a parasitic draw.
const CHARGING_V = 13.2;
const SETTLE_MS = 10 * MIN;
// A real ELM327 reports ATRV in 0.1 V steps, so a drain rate is only
// meaningful over a long window.
const WINDOW_MS = 30 * MIN;
const MIN_SPAN_MS = 10 * MIN;

/**
 * Resting voltage drop in mV per minute (positive = falling), as a
 * least-squares slope over the last 30 minutes, ignoring charging and the
 * settle period after it. Null when there are fewer than 10 minutes of
 * resting data.
 */
export function dropMvPerMin(pts: readonly Point[]): number | null {
  if (pts.length < 2) return null;
  const end = pts[pts.length - 1].t;
  let lastCharging = -Infinity;
  for (const p of pts) if (p.v > CHARGING_V) lastCharging = p.t;
  const from = Math.max(end - WINDOW_MS, lastCharging + SETTLE_MS);
  const use = pts.filter(p => p.t >= from);
  if (use.length < 2 || use[use.length - 1].t - use[0].t < MIN_SPAN_MS) return null;

  const n = use.length;
  const mt = use.reduce((a, p) => a + p.t, 0) / n;
  const mv = use.reduce((a, p) => a + p.v, 0) / n;
  let num = 0, den = 0;
  for (const p of use) { num += (p.t - mt) * (p.v - mv); den += (p.t - mt) ** 2; }
  if (den === 0) return null;
  return -(num / den) * MIN * 1000;
}

export function dischargeStatus(mvPerMin: number | null): Status {
  if (mvPerMin === null) return 'neutral';
  if (mvPerMin > 5) return 'crit';
  if (mvPerMin > 1) return 'warn';
  return 'neutral';
}

export function voltageTrend(pts: readonly Point[]): 'stable' | 'dropping' | 'critical' {
  const s = dischargeStatus(dropMvPerMin(pts));
  return s === 'crit' ? 'critical' : s === 'warn' ? 'dropping' : 'stable';
}

/** Status from the PID catalog's warn/crit limits, so every screen agrees. */
export function pidStatus(pid: string, value: number): Status {
  const def = PID_MAP.get(pid);
  return def ? statusFor(value, def) : 'neutral';
}

/**
 * State of charge from resting voltage (lead-acid, engine off for a while):
 * 12.65 V full, 12.45 V 75 %, 12.24 V 50 %, 12.06 V 25 %.
 */
export function batterySoC(v: number): string {
  if (!isReading(v) || v <= 0) return '—';
  if (v >= 12.65) return 'Fully charged';
  if (v >= 12.45) return '75% charged';
  if (v >= 12.24) return '50% charged';
  if (v >= 12.06) return '25% charged';
  return 'Discharged';
}

/** Fuel trim status: ±5 % is normal, beyond ±10 % critical. */
export function trimStatus(pct: number): Status {
  const a = Math.abs(pct);
  return a > 10 ? 'crit' : a > 5 ? 'warn' : 'neutral';
}

/** MAP verdict in psi (0B decodes to psi): idle vacuum reads well below 10 psi. */
export function mapVerdict(psi: number): string {
  if (!isReading(psi)) return '—';
  return psi < 10 ? 'Low — good vacuum' : 'Rising — under load';
}

// ─── I/M readiness, Mode 01 PID 01 (SAE J1979) ────────────────────────────────

export interface Monitor { name: string; status: 'ready' | 'incomplete' }

const CONTINUOUS = ['Misfire', 'Fuel system', 'Comprehensive components'];
const SPARK = ['Catalyst', 'Heated catalyst', 'Evaporative system', 'Secondary air',
  'A/C refrigerant', 'O2 sensor', 'O2 sensor heater', 'EGR system'];
const COMPRESSION = ['NMHC catalyst', 'NOx/SCR aftertreatment', '', 'Boost pressure',
  '', 'Exhaust gas sensor', 'PM filter', 'EGR/VVT system'];

/**
 * A: MIL (bit 7) and stored-code count. B: continuous monitors (bits 0-2
 * available, 4-6 incomplete) and ignition type (bit 3). C/D: available /
 * incomplete bits for the non-continuous monitors. Only supported monitors
 * are listed.
 */
export function readinessMonitors(b: readonly number[]):
  { milOn: boolean; dtcCount: number; monitors: Monitor[] } | null {
  if (b.length < 4) return null;
  const monitors: Monitor[] = [];
  CONTINUOUS.forEach((name, i) => {
    if (b[1] & (1 << i)) monitors.push({ name, status: b[1] & (1 << (i + 4)) ? 'incomplete' : 'ready' });
  });
  const table = b[1] & 0x08 ? COMPRESSION : SPARK;
  table.forEach((name, i) => {
    if (name && b[2] & (1 << i)) monitors.push({ name, status: b[3] & (1 << i) ? 'incomplete' : 'ready' });
  });
  return { milOn: (b[0] & 0x80) !== 0, dtcCount: b[0] & 0x7F, monitors };
}
