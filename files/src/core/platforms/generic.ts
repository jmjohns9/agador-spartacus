import { PlatformProfile } from './types';

// ─── Generic OBD-II platform — the fallback for any unmatched vehicle ─────────
//
// No fuse map or module address map: those are platform-specific and shouldn't
// be invented. The parasitic checklist is the standard multimeter-based
// procedure that works on any 12 V vehicle.

const PARASITIC_CHECKLIST = [
  { id: 'step01', step: 1,  description: 'Confirm battery resting open-circuit voltage is at or above 12.6 V.' },
  { id: 'step02', step: 2,  description: 'Close all doors, hood, and trunk (latch them so interior lights believe they are closed). Turn off all accessories.' },
  { id: 'step03', step: 3,  description: 'Ignition off, key out (or fob away from the vehicle for push-button start). Start session timer.' },
  { id: 'step04', step: 4,  description: 'Wait 15–45 minutes for all modules to enter sleep mode — newer vehicles can take longer. Watch battery voltage settle.' },
  { id: 'step05', step: 5,  description: 'Record the baseline voltage after module sleep (ATRV from this app, or a multimeter at the battery).' },
  { id: 'step06', step: 6,  description: 'Measure parasitic draw with an ammeter or amp clamp on the negative battery cable. Spec: typically under 50 mA after sleep (check the service manual).' },
  { id: 'step07', step: 7,  description: 'If the draw is high: locate the interior and under-hood fuse panels (see the owner\'s manual or fuse box lid diagram).' },
  { id: 'step08', step: 8,  description: 'Pull fuses one at a time, starting with body control, infotainment, and interior lighting circuits. Watch for the draw to drop.' },
  { id: 'step09', step: 9,  description: 'Use the millivolt-drop method as an alternative: measure mV across each fuse in place — a non-zero reading means current is flowing in that circuit.' },
  { id: 'step10', step: 10, description: 'Record which circuit carries the draw. Note everything that circuit feeds.' },
  { id: 'step11', step: 11, description: 'Common culprits to inspect: aftermarket electronics (radio, alarm, dash cam) on constant power, glovebox/trunk/hood lights staying on, stuck relays, failing modules that never sleep.' },
  { id: 'step12', step: 12, description: 'Disconnect or repair the offending component. Reinstall all fuses.' },
  { id: 'step13', step: 13, description: 'Retest the full draw to confirm it is back within spec, then recheck after a full sleep cycle.' },
];

export const GENERIC: PlatformProfile = {
  id: 'generic',
  name: 'Generic OBD-II vehicle',
  matches: () => true,
  modules: [],         // discovered at runtime from bus responses
  ipfbFuses: [],       // no fuse map without a known platform
  uhfrcFuses: [],
  parasiticChecklist: PARASITIC_CHECKLIST,
};
