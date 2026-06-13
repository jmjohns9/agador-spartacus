import { PlatformProfile } from './types';
import { GMT800 } from './gmt800';
import { GENERIC } from './generic';

export type { PlatformProfile, ChecklistTemplateItem } from './types';

// Ordered most-specific first; GENERIC matches everything and must stay last.
const REGISTRY: PlatformProfile[] = [
  GMT800,
  GENERIC,
];

/** Resolve the best platform profile for the user's vehicle. Never returns undefined. */
export function resolvePlatform(v: { make: string; model: string; year: string }): PlatformProfile {
  return REGISTRY.find(p => p.matches(v)) ?? GENERIC;
}
