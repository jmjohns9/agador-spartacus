import type { ScreenId } from '../../store/appStore';

export interface NavItem { id: ScreenId; icon: string; label: string }

export const NAV_GROUPS: ReadonlyArray<{ title?: string; items: ReadonlyArray<NavItem> }> = [
  { items: [
    { id: 'connect',   icon: 'ti-bluetooth', label: 'Connection' },
    { id: 'assistant', icon: 'ti-sparkles',  label: 'Claude assistant' },
  ] },
  { title: 'Overview', items: [
    { id: 'health',  icon: 'ti-heart-rate-monitor', label: 'Vehicle health' },
    { id: 'live',    icon: 'ti-dashboard',          label: 'Live telemetry' },
    { id: 'allpids', icon: 'ti-list-search',        label: 'All parameters' },
    { id: 'logger',  icon: 'ti-activity',           label: 'Data logger' },
  ] },
  { title: 'Subsystems', items: [
    { id: 'engine',       icon: 'ti-engine',             label: 'Engine & fuel' },
    { id: 'electrical',   icon: 'ti-battery-automotive', label: 'Electrical' },
    { id: 'hvac',         icon: 'ti-temperature',        label: 'HVAC' },
    { id: 'transmission', icon: 'ti-manual-gearbox',     label: 'Transmission' },
  ] },
  { title: 'Diagnostic', items: [
    { id: 'dtc',      icon: 'ti-alert-triangle',   label: 'Fault codes' },
    { id: 'modules',  icon: 'ti-cpu',              label: 'Module monitor' },
    { id: 'parasite', icon: 'ti-zoom-exclamation', label: 'Parasitic draw' },
  ] },
  { title: 'Advanced', items: [
    { id: 'ecubus', icon: 'ti-circuit-diode', label: 'EcuBus-Pro' },
    { id: 'pcm',    icon: 'ti-id-badge-2',    label: 'PCM identity' },
  ] },
  { title: 'Records', items: [
    { id: 'compare',      icon: 'ti-arrows-diff', label: 'Compare' },
    { id: 'freezeframes', icon: 'ti-camera',      label: 'Freeze frames' },
    { id: 'logs',         icon: 'ti-file-text',   label: 'Session log' },
  ] },
];

export const SETTINGS_ITEM: NavItem = { id: 'settings', icon: 'ti-settings', label: 'Settings' };

export const ALL_SCREEN_IDS: ScreenId[] = [
  ...NAV_GROUPS.flatMap(g => g.items.map(i => i.id)),
  SETTINGS_ITEM.id,
];
