import { VehicleProfile, FuseCircuit, ModuleState } from '../shared/types';

// ─── 2004 Chevrolet Silverado 1500 Z71 — VIN 1GCEK19T04E ─────────────────────
//
// VIN decode:
//   1        — Country: USA
//   G        — Manufacturer: General Motors
//   C        — Division: Chevrolet
//   E        — Vehicle type: Multipurpose Passenger / Truck
//   K        — Restraint: Active belts, dual front airbags
//   1        — Series: C/K 1500 (half-ton)
//   9        — Body: Extended cab pickup
//   T        — Engine: 5.3 L Vortec V8 LM7 (VIN T)
//   0        — Check digit
//   4        — Model year: 2004
//   E        — Assembly plant: Oshawa, Ontario, Canada
//   XXXXXX   — Production sequence number

export const SILVERADO_PROFILE: VehicleProfile = {
  vin: '1GCEK19T04E',
  year: 2004,
  make: 'Chevrolet',
  model: 'Silverado 1500',
  trim: 'Z71 Extended Cab',
  engine: '5.3 L Vortec V8 LM7 (VIN code T)',
  transmission: '4L60-E 4-speed automatic',
  platform: 'GMT800',
  protocol: 'SAE_J1850_VPW',  // 10.4 kbps GM Class II serial data bus
  supportedPIDs: [],           // filled at runtime by discovery scan
};

// ─── GM Class II Module Address Map — GMT800 ──────────────────────────────────

export const GMT800_MODULES: ModuleState[] = [
  {
    address: '0x10',
    name: 'Powertrain Control Module (PCM)',
    status: 'unknown',
    lastResponseMs: 0,
    latencyMs: 0,
    minutesAwakePostEngineOff: 0,
    busActivity: [],
  },
  {
    address: '0xE0',
    name: 'Instrument Panel Cluster (IPC)',
    status: 'unknown',
    lastResponseMs: 0,
    latencyMs: 0,
    minutesAwakePostEngineOff: 0,
    busActivity: [],
  },
  {
    address: '0x28',
    name: 'Body Control Module (BCM)',
    status: 'unknown',
    lastResponseMs: 0,
    latencyMs: 0,
    minutesAwakePostEngineOff: 0,
    busActivity: [],
  },
  {
    address: '0x60',
    name: 'Transmission Control Module (TCM)',
    status: 'unknown',
    lastResponseMs: 0,
    latencyMs: 0,
    minutesAwakePostEngineOff: 0,
    busActivity: [],
  },
  {
    address: '0x40',
    name: 'Anti-lock Brake / Electronic Brake Control (ABS)',
    status: 'unknown',
    lastResponseMs: 0,
    latencyMs: 0,
    minutesAwakePostEngineOff: 0,
    busActivity: [],
  },
  {
    address: '0xA0',
    name: 'HVAC Control Module',
    status: 'unknown',
    lastResponseMs: 0,
    latencyMs: 0,
    minutesAwakePostEngineOff: 0,
    busActivity: [],
  },
  {
    address: '0xC0',
    name: 'Radio / Head Unit',
    status: 'unknown',
    lastResponseMs: 0,
    latencyMs: 0,
    minutesAwakePostEngineOff: 0,
    busActivity: [],
  },
];

// ─── Fuse Panel Data — 2004 Silverado 1500 ────────────────────────────────────

export const IPFB_FUSES: FuseCircuit[] = [
  {
    id: 'TBC_BATT',
    name: 'TBC Battery Feed',
    amperage: 10,
    panel: 'IPFB',
    feeds: ['Body Control Module', 'Instrument Panel Cluster', 'Interior dome lights', 'Door courtesy lights'],
    status: 'unknown',
    estimatedDrawAmps: undefined,
    notes: '#1 known parasitic culprit on GMT800 trucks. Pull first when diagnosing drain.',
    relatedDTCs: ['B1982', 'U0100'],
    relatedModules: ['0x28', '0xE0'],
  },
  {
    id: 'RADIO',
    name: 'Radio',
    amperage: 15,
    panel: 'IPFB',
    feeds: ['Factory Delco radio', 'Aftermarket head unit'],
    status: 'unknown',
    notes: '#2 common culprit. Aftermarket radio installations with incorrect memory wire wiring cause continuous draw.',
    relatedDTCs: [],
    relatedModules: ['0xC0'],
  },
  {
    id: 'IPC_BPLUS',
    name: 'Instrument Cluster Power (IPC B+)',
    amperage: 10,
    panel: 'IPFB',
    feeds: ['Instrument Panel Cluster main power'],
    status: 'unknown',
    notes: 'Separate from TBC BATT. Pull this after TBC BATT if drain persists.',
    relatedDTCs: ['B1982'],
    relatedModules: ['0xE0'],
  },
  {
    id: 'BODY_CTRL',
    name: 'Body Control Module',
    amperage: 10,
    panel: 'IPFB',
    feeds: ['Body Control Module primary supply'],
    status: 'unknown',
    notes: '',
    relatedDTCs: ['B1982', 'U0100'],
    relatedModules: ['0x28'],
  },
  {
    id: 'CIGS',
    name: 'Cigarette Lighter / Accessory',
    amperage: 20,
    panel: 'IPFB',
    feeds: ['Cigarette lighter socket', 'Accessory power outlet'],
    status: 'unknown',
    notes: 'Accessory items left plugged in can cause drain.',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'DOOR_LOCKS',
    name: 'Door Locks',
    amperage: 20,
    panel: 'IPFB',
    feeds: ['Power door lock actuators — all four doors'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'PWR_WINDOWS',
    name: 'Power Windows — Driver',
    amperage: 30,
    panel: 'IPFB',
    feeds: ['Driver power window motor', 'Window switches'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'PWR_MIRRORS',
    name: 'Power Mirrors',
    amperage: 10,
    panel: 'IPFB',
    feeds: ['Power folding / adjusting mirrors'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: [],
  },
];

export const UHFRC_FUSES: FuseCircuit[] = [
  {
    id: 'BATT1',
    name: 'Battery Main Feed 1',
    amperage: 60,
    panel: 'UHFRC',
    feeds: ['Main battery distribution'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'BATT2',
    name: 'Battery Main Feed 2',
    amperage: 60,
    panel: 'UHFRC',
    feeds: ['Main battery distribution'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'BATT3',
    name: 'Battery Main Feed 3',
    amperage: 40,
    panel: 'UHFRC',
    feeds: ['Main battery distribution'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'IGN1',
    name: 'Ignition Feed 1',
    amperage: 40,
    panel: 'UHFRC',
    feeds: ['Ignition switch downstream circuits'],
    status: 'unknown',
    notes: 'Internal ignition switch short can cause drain on this circuit.',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'IGN2',
    name: 'Ignition Feed 2',
    amperage: 30,
    panel: 'UHFRC',
    feeds: ['Ignition switch downstream circuits'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: [],
  },
  {
    id: 'ABS_FUSE',
    name: 'Anti-lock Brake System',
    amperage: 40,
    panel: 'UHFRC',
    feeds: ['ABS / Electronic Brake Control Module'],
    status: 'unknown',
    notes: '',
    relatedDTCs: ['C0265'],
    relatedModules: ['0x40'],
  },
  {
    id: 'BLOWER',
    name: 'HVAC Blower Motor',
    amperage: 40,
    panel: 'UHFRC',
    feeds: ['HVAC blower motor'],
    status: 'unknown',
    notes: '',
    relatedDTCs: [],
    relatedModules: ['0xA0'],
  },
  {
    id: 'HTD_SEAT',
    name: 'Heated Seats',
    amperage: 30,
    panel: 'UHFRC',
    feeds: ['Driver and passenger heated seat elements'],
    status: 'unknown',
    notes: '',
    relatedDTCs: ['B0429'],
    relatedModules: [],
  },
];

// ─── GMT800 Parasitic Draw Diagnostic Checklist ────────────────────────────────

export const PARASITIC_CHECKLIST_TEMPLATE = [
  { id: 'step01', step: 1,  description: 'Confirm battery resting open-circuit voltage is at or above 12.6 V.' },
  { id: 'step02', step: 2,  description: 'Close all doors, hood, and trunk. Confirm dome and courtesy lights are off.' },
  { id: 'step03', step: 3,  description: 'Turn off all accessories. Ignition off. Start session timer.' },
  { id: 'step04', step: 4,  description: 'Wait 10–15 minutes for all modules to enter sleep mode. Monitor the Module Wake screen.' },
  { id: 'step05', step: 5,  description: 'Record ATRV baseline voltage after module sleep.' },
  { id: 'step06', step: 6,  description: 'Pull the TBC Battery Feed fuse (10 A) from the Instrument Panel Fuse Block. Observe voltage for stabilization.' },
  { id: 'step07', step: 7,  description: 'Pull the Radio fuse (15 A). Observe voltage change.' },
  { id: 'step08', step: 8,  description: 'Pull the Instrument Cluster Power fuse (10 A). Observe voltage.' },
  { id: 'step09', step: 9,  description: 'Pull the Body Control Module fuse (10 A). Observe voltage.' },
  { id: 'step10', step: 10, description: 'Record which fuse circuit caused voltage to stabilize. This is the draw source.' },
  { id: 'step11', step: 11, description: 'If Instrument Cluster circuit: inspect connector pins C1 and C2. Check ground strap resistance at firewall (target: below 0.1 Ω).' },
  { id: 'step12', step: 12, description: 'If Radio circuit: inspect aftermarket radio harness wiring. Verify memory wire is on a switched circuit, not constant battery.' },
  { id: 'step13', step: 13, description: 'If Body Control Module circuit: scan BCM DTCs via GM-LAN. Check dome light switch on all door jambs.' },
  { id: 'step14', step: 14, description: 'Reinstall all fuses. Retest with all fuses installed to confirm repair.' },
];
