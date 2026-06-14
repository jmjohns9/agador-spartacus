// AUTO-GENERATED — do not edit by hand.
// Regenerate via `npm run gen:dtcs` against files/data/dtc-catalog.xlsx
// (produced by the dtc-catalog-builder Claude skill). The initial seed below
// was migrated from the hand-coded DTC_DB previously embedded in
// obdProtocolManager.ts; replace it by running the generator.

export interface DTCRecord {
  description: string;
  causes?: string[];
  repair?: string;
  module?: 'PCM' | 'BCM' | 'IPC' | 'EBCM' | 'TCM' | 'Network' | string;
}

export const DTC_CATALOG: Record<string, DTCRecord> = {
  'B1982': {
    description: 'Instrument Cluster — loss of Class II serial data from Body Control Module',
    causes: [
      'Class II bus disruption or high resistance',
      'Ground integrity at Instrument Cluster connector C2',
      'Battery circuit draw keeping bus awake',
      'Faulty Body Control Module',
    ],
    repair: 'Inspect Class II bus wiring. Check Instrument Cluster connector C2 ground. Test firewall-to-engine ground strap resistance — target below 0.1 Ω. Check TBC BATT fuse circuit for parasitic draw.',
    module: 'IPC',
  },
  'P0300': {
    description: 'Random / multiple cylinder misfire detected',
    causes: [
      'Worn or fouled spark plugs',
      'Failed ignition coils or wires',
      'Lean fuel trim amplifying misfires (P0171/P0174)',
      'Low fuel pressure',
    ],
    repair: 'Inspect and replace spark plugs. Inspect ignition wires and coil packs. Address fuel trim lean condition first.',
    module: 'PCM',
  },
  'P0171': {
    description: 'Fuel system lean — Bank 1',
    causes: [
      'Vacuum leak at intake manifold gasket',
      'Dirty or failed Mass Air Flow sensor',
      'Evaporative Emission Control purge valve stuck open',
      'Low fuel pressure',
    ],
    repair: 'Check all intake manifold gaskets and vacuum lines for leaks. Clean or replace Mass Air Flow sensor. Test Evaporative Emission Control purge valve.',
    module: 'PCM',
  },
  'U0100': {
    description: 'Lost communication with Engine Control Module on the data bus',
    causes: [
      'Body Control Module or Instrument Cluster preventing bus sleep',
      'Faulty ground strap at firewall',
      'Wiring fault on the data bus',
    ],
    repair: 'Diagnose bus parasitic draw first. Inspect Instrument Cluster and Body Control Module circuits.',
    module: 'Network',
  },
  'B0429': { description: 'Heated seat module — driver seat temperature fault', module: 'BCM' },
  'P0301': { description: 'Cylinder 1 misfire detected', module: 'PCM' },
  'P0302': { description: 'Cylinder 2 misfire detected', module: 'PCM' },
  'P0174': { description: 'Fuel system lean — Bank 2', module: 'PCM' },
  'P0446': { description: 'Evaporative Emission Control vent control circuit fault', module: 'PCM' },
  'P0442': { description: 'Evaporative Emission Control system — small leak detected', module: 'PCM' },
  'P0449': { description: 'Evaporative Emission Control vent solenoid circuit fault', module: 'PCM' },
  'P0128': { description: 'Coolant temperature below thermostat regulating temperature', module: 'PCM' },
  'P0420': { description: 'Catalyst efficiency below threshold — Bank 1', module: 'PCM' },
  'P0430': { description: 'Catalyst efficiency below threshold — Bank 2', module: 'PCM' },
  'U1000': { description: 'Class II communication fault — general bus error', module: 'Network' },
  'C0265': { description: 'Anti-lock Brake Control Module relay circuit fault', module: 'EBCM' },
  'P0741': { description: 'Torque converter clutch circuit — stuck off', module: 'TCM' },
  'P0753': { description: 'Shift solenoid A — electrical fault', module: 'TCM' },
  'P0758': { description: 'Shift solenoid B — electrical fault', module: 'TCM' },
};

// Counts come in handy for the assistant context + future health screens.
export const DTC_CATALOG_SIZE = Object.keys(DTC_CATALOG).length;
