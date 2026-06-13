import { FuseCircuit, ModuleState } from '../../shared/types';

// ─── Platform profile — per-make/era reference data ──────────────────────────
//
// The app is vehicle-agnostic at the protocol level (any OBD-II vehicle), but
// some screens benefit from platform-specific reference data: module address
// maps, fuse panel layouts, and parasitic-draw checklists. A PlatformProfile
// bundles that data; the registry resolves one from the user's vehicle profile,
// falling back to a generic OBD-II profile when nothing matches.

export interface ChecklistTemplateItem {
  id: string;
  step: number;
  description: string;
}

export interface PlatformProfile {
  /** Stable identifier, e.g. 'gmt800' or 'generic' */
  id: string;
  /** Human-readable name shown in the UI, e.g. 'GM GMT800 (1999–2007 trucks/SUVs)' */
  name: string;
  /** True if this platform applies to the given vehicle */
  matches: (v: { make: string; model: string; year: string }) => boolean;
  /** Known module address map for the bus (empty = discover at runtime) */
  modules: ModuleState[];
  /** Interior fuse panel circuits, ordered by parasitic-draw likelihood */
  ipfbFuses: FuseCircuit[];
  /** Under-hood fuse/relay center circuits */
  uhfrcFuses: FuseCircuit[];
  /** Step-by-step parasitic draw protocol */
  parasiticChecklist: ChecklistTemplateItem[];
}
