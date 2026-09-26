// Compatibility wrappers: old component names and props, rendered with the new
// components. Screens migrate off these in Tasks 7–12; file deleted in Task 13.

import React from 'react';
import { Metric } from './Metric';
import { Gauge } from './Gauge';
import { statusFromLegacyColor } from './logic';

type Legacy = { valueColor?: string; barColor?: string };
const statusOf = (p: Legacy) => statusFromLegacyColor(p.valueColor);
const barOf = (p: Legacy) => (p.barColor ? statusFromLegacyColor(p.barColor) : undefined);

export function MetricTile(p: {
  label: string; value: string | number; unit?: string; subtext?: string; barPercent?: number; barColor?: string;
  valueColor?: string; accentColor?: string; tooltip?: React.ReactNode; staleAt?: number; staleAfterMs?: number;
  prominence?: 'normal' | 'hero';
}): React.ReactElement {
  const hero = p.prominence === 'hero';
  return <Metric label={p.label} value={p.value} unit={p.unit} subtext={p.subtext} barPercent={p.barPercent}
    barStatus={barOf(p)} status={statusOf(p)} tooltip={p.tooltip} staleAt={p.staleAt} staleAfterMs={p.staleAfterMs}
    size={hero ? 'hero' : 'regular'} span={hero ? 2 : 1} />;
}

export function HeroCard(p: {
  label: string; value: string | number; unit?: string; subtext?: string; valueColor?: string;
  accentBorder?: string; pid: string; sparkColor: string; staleAt?: number;
}): React.ReactElement {
  return <Metric size="hero" label={p.label} value={p.value} unit={p.unit} subtext={p.subtext}
    status={statusOf(p)} staleAt={p.staleAt} spark={{ pid: p.pid, color: p.sparkColor }} />;
}

export function DenseMetricTile(p: {
  label: string; value: string | number; unit?: string; subtext?: string; subtextColor?: string;
  barPercent?: number; barColor?: string; valueColor?: string; accentBorder?: string; tooltip?: React.ReactNode;
}): React.ReactElement {
  return <Metric size="compact" label={p.label} value={p.value} unit={p.unit} subtext={p.subtext}
    subtextStatus={statusFromLegacyColor(p.subtextColor)} barPercent={p.barPercent} barStatus={barOf(p)}
    status={statusOf(p)} tooltip={p.tooltip} />;
}

export function ArcGauge(p: {
  value: number; min: number; max: number; label: string; unit: string; size?: number; maxSize?: number;
  color?: string; warnLow?: number; warnHigh?: number; critLow?: number; critHigh?: number; isDark?: boolean;
  staleAt?: number; staleAfterMs?: number;
}): React.ReactElement {
  return <Gauge label={p.label} value={p.value} min={p.min} max={p.max} unit={p.unit} color={p.color}
    warnLow={p.warnLow} warnHigh={p.warnHigh} critLow={p.critLow} critHigh={p.critHigh}
    staleAt={p.staleAt} staleAfterMs={p.staleAfterMs} />;
}

export function CompactArcGauge(p: { label: string; value: number; max: number; unit: string; color: string }): React.ReactElement {
  return <Gauge size="compact" label={p.label} value={p.value} max={p.max} unit={p.unit} color={p.color} />;
}

/** Was an animated bar; now a status dot that pulses while active. */
export function WaveBar({ color = 'var(--accent)', active = true }: { color?: string; active?: boolean }): React.ReactElement {
  return <span className={active ? 'pulse' : undefined} aria-hidden
    style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: active ? color : 'var(--label-4)' }} />;
}

/** Its content moved to the toolbar connection popover (Task 5). */
export function StatusBar(): null {
  return null;
}
