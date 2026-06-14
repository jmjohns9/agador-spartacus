// Hand-curated DTC catalog for 2004 GMT800 / Vortec 5.3L OBD-II platforms.
// Covers SAE J2012 generic P0/B0/C0/U0 codes and GM-enhanced P1/P2/B1/B2/B3/
// C1/U1/U2 manufacturer-specific codes applicable to the LM7/L59 5.3L V8 and
// GMT800 platform modules: PCM, BCM, IPC, EBCM, TCM, SDM, HVAC, TCCM.
//
// Sources: SAE J2012 DA (2002 ed.), GM SI for 2003–2005 GMT800,
// ALLDATA DTC reference, NASTF GMT800 service procedures.
//
// Regenerate from xlsx (when available): npm run gen:dtcs
// Full causes/repair on high-frequency GMT800 codes; stub entries for the rest.

export interface DTCRecord {
  description: string;
  causes?: string[];
  repair?: string;
  module?: 'PCM' | 'BCM' | 'IPC' | 'EBCM' | 'TCM' | 'SDM' | 'HVAC' | 'TCCM' | 'Network' | string;
}

export const DTC_CATALOG: Record<string, DTCRecord> = {

  // ═══════════════════════════════════════════════════════════════════════════
  // P0xxx — SAE J2012 Generic Powertrain
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── MAF ─────────────────────────────────────────────────────────────────

  'P0100': {
    description: 'Mass Air Flow (MAF) sensor circuit malfunction',
    causes: [
      'Contaminated or damaged MAF sensor element',
      'Wiring open/short between MAF and PCM',
      'Loose or corroded MAF connector',
    ],
    repair: 'Inspect MAF sensor wiring and connector. Clean sensor with MAF-safe cleaner. Replace sensor if signal voltage is out of range at idle (~0.9 V) or WOT (~4.5 V).',
    module: 'PCM',
  },
  'P0101': {
    description: 'Mass Air Flow (MAF) sensor circuit range/performance',
    causes: [
      'Dirty or oil-contaminated MAF sensor (common after oiled aftermarket filter use)',
      'Air intake leak between MAF and throttle body',
      'Restricted air filter',
      'MAF frequency out of expected range',
    ],
    repair: 'Clean MAF sensor with electrical contact cleaner. Inspect intake boots and clamps for leaks. Compare MAF g/s to expected values at idle (3–6 g/s) and WOT.',
    module: 'PCM',
  },
  'P0102': {
    description: 'Mass Air Flow (MAF) sensor circuit low input',
    causes: [
      'Open or high-resistance in MAF signal wire',
      'Failed MAF sensor',
      'Sensor ground fault',
    ],
    repair: 'Check MAF signal wire continuity to PCM. Verify 5 V reference and ground at MAF connector. Replace sensor if wiring checks out.',
    module: 'PCM',
  },
  'P0103': {
    description: 'Mass Air Flow (MAF) sensor circuit high input',
    causes: [
      'Short to voltage in MAF signal wire',
      'Failed MAF sensor outputting high signal',
    ],
    repair: 'Inspect MAF signal wire for short to power. Replace MAF sensor if wiring is intact.',
    module: 'PCM',
  },

  // ─── MAP ──────────────────────────────────────────────────────────────────

  'P0105': { description: 'Manifold Absolute Pressure (MAP) / barometric pressure sensor circuit', module: 'PCM' },
  'P0106': {
    description: 'MAP/barometric pressure sensor circuit range/performance',
    causes: [
      'Vacuum leak at MAP sensor port or hose',
      'Clogged MAP sensor vacuum port',
      'Sensor output not matching BARO at key-on (should be ~4.5–4.8 V at sea level)',
    ],
    repair: 'Verify vacuum hose to MAP sensor is intact. Compare MAP voltage to BARO voltage at key-on with engine off — values must match. Replace sensor if biased.',
    module: 'PCM',
  },
  'P0107': { description: 'MAP sensor circuit low input (below 0.1 V)', module: 'PCM' },
  'P0108': { description: 'MAP sensor circuit high input (above 4.9 V)', module: 'PCM' },

  // ─── IAT ─────────────────────────────────────────────────────────────────

  'P0110': { description: 'Intake Air Temperature (IAT) sensor circuit malfunction', module: 'PCM' },
  'P0111': { description: 'IAT sensor circuit range/performance', module: 'PCM' },
  'P0112': { description: 'IAT sensor circuit low input (below −38 °C equivalent)', module: 'PCM' },
  'P0113': { description: 'IAT sensor circuit high input (above 149 °C equivalent)', module: 'PCM' },

  // ─── ECT ─────────────────────────────────────────────────────────────────

  'P0115': { description: 'Engine Coolant Temperature (ECT) sensor circuit malfunction', module: 'PCM' },
  'P0116': {
    description: 'ECT sensor circuit range/performance',
    causes: [
      'ECT sensor slow to reach operating temperature',
      'Coolant leak causing low coolant level or air pocket near sensor',
      'Failing thermostat (stuck open)',
    ],
    repair: 'Monitor ECT warm-up rate — should reach 185–210 °F within 5–7 minutes of cold start. Replace thermostat if coolant temperature fails to reach regulating temp. Bleed cooling system for air pockets.',
    module: 'PCM',
  },
  'P0117': { description: 'ECT sensor circuit low input (shorted to ground / reading above 150 °C)', module: 'PCM' },
  'P0118': { description: 'ECT sensor circuit high input (open circuit / reading below −38 °C)', module: 'PCM' },

  // ─── TPS ─────────────────────────────────────────────────────────────────

  'P0120': { description: 'Throttle/Pedal Position sensor A circuit malfunction', module: 'PCM' },
  'P0121': {
    description: 'Throttle Position (TP) sensor A circuit range/performance',
    causes: [
      'TP sensor A voltage not correlating with TP sensor B (TAC system)',
      'Carbon build-up on throttle plate affecting spring return',
      'TAC motor wear causing commanded vs. actual mismatch',
    ],
    repair: 'Monitor TP sensor A and B simultaneously in live data — they should track proportionally (A increases as B decreases). Clean throttle body and plate. Perform TP relearn after cleaning. Replace throttle body assembly if sensors diverge.',
    module: 'PCM',
  },
  'P0122': { description: 'Throttle Position sensor A circuit low input (below 0.17 V)', module: 'PCM' },
  'P0123': { description: 'Throttle Position sensor A circuit high input (above 4.8 V)', module: 'PCM' },
  'P0125': {
    description: 'Insufficient coolant temperature for closed-loop fuel control',
    causes: [
      'Failing thermostat (stuck open or opening too early)',
      'ECT sensor inaccurate',
    ],
    repair: 'Compare ECT reading to infrared thermometer on engine block. Replace thermostat if coolant temp stays below 160 °F at steady highway cruise. Do not use a lower-rated thermostat.',
    module: 'PCM',
  },
  'P0128': {
    description: 'Coolant temperature below thermostat regulating temperature',
    causes: [
      'Thermostat stuck open or failing early',
      'ECT sensor biased low (rare)',
    ],
    repair: 'Replace engine thermostat with OE-spec 195 °F unit. Confirm with scanner that ECT reaches 195–210 °F and holds steady at highway cruise. Do NOT use a lower-rated thermostat — the PCM requires the factory setpoint to enter and maintain closed-loop operation.',
    module: 'PCM',
  },

  // ─── O2 Sensors — Bank 1 ─────────────────────────────────────────────────

  'P0130': { description: 'Heated O2 sensor (HO2S) circuit — Bank 1, Sensor 1 (upstream, driver side)', module: 'PCM' },
  'P0131': {
    description: 'HO2S circuit low voltage — Bank 1, Sensor 1',
    causes: [
      'Exhaust leak upstream of O2 sensor introducing false lean signal',
      'Failed O2 sensor stuck at low voltage',
      'Open heater circuit preventing sensor warm-up',
      'Lean fuel condition (confirm P0171 present)',
    ],
    repair: 'Check for exhaust leaks at manifold or flex pipe upstream of sensor. Verify heater circuit resistance (5–20 Ω). Monitor O2 switching frequency — should switch 2–5× per second at warm idle. Replace sensor if lazy or stuck below 200 mV.',
    module: 'PCM',
  },
  'P0132': { description: 'HO2S circuit high voltage — Bank 1, Sensor 1', causes: ['Rich fuel condition (P0172 present)', 'Sensor stuck at high voltage', 'Short to voltage in signal wire'], repair: 'Confirm P0172 rich condition first. If fuel trim is normal, replace O2 sensor.', module: 'PCM' },
  'P0133': {
    description: 'HO2S circuit slow response — Bank 1, Sensor 1',
    causes: [
      'Aged or contaminated O2 sensor (common above 100 k miles)',
      'Coolant or oil contamination from leaking head gasket or valve seals',
      'Silicon or phosphorus poisoning from silicone sealants or phosphate coolant',
    ],
    repair: 'Inspect for coolant leaks into combustion. Monitor O2 switching speed — should transition from rich to lean in under 100 ms on a healthy sensor. Replace upstream O2 sensor if response is slow.',
    module: 'PCM',
  },
  'P0134': { description: 'HO2S circuit no activity detected — Bank 1, Sensor 1 (stuck in mid-range)', module: 'PCM' },
  'P0135': { description: 'HO2S heater circuit — Bank 1, Sensor 1', causes: ['Open heater element in O2 sensor (measure ~5–8 Ω across heater pins)', 'No 12V feed to heater circuit', 'PCM heater driver fault'], repair: 'Measure heater resistance across heater pins — open means failed sensor. Verify 12V supply to heater wire. Replace sensor if heater element is open.', module: 'PCM' },
  'P0137': { description: 'HO2S circuit low voltage — Bank 1, Sensor 2 (downstream)', module: 'PCM' },
  'P0138': { description: 'HO2S circuit high voltage — Bank 1, Sensor 2 (downstream)', module: 'PCM' },
  'P0139': { description: 'HO2S circuit slow response — Bank 1, Sensor 2 (downstream)', module: 'PCM' },
  'P0140': { description: 'HO2S circuit no activity detected — Bank 1, Sensor 2 (downstream)', module: 'PCM' },
  'P0141': { description: 'HO2S heater circuit — Bank 1, Sensor 2 (downstream)', module: 'PCM' },

  // ─── O2 Sensors — Bank 2 ─────────────────────────────────────────────────

  'P0150': { description: 'HO2S circuit — Bank 2, Sensor 1 (upstream, passenger side)', module: 'PCM' },
  'P0151': { description: 'HO2S circuit low voltage — Bank 2, Sensor 1', module: 'PCM' },
  'P0152': { description: 'HO2S circuit high voltage — Bank 2, Sensor 1', module: 'PCM' },
  'P0153': { description: 'HO2S circuit slow response — Bank 2, Sensor 1', module: 'PCM' },
  'P0154': { description: 'HO2S circuit no activity detected — Bank 2, Sensor 1', module: 'PCM' },
  'P0155': { description: 'HO2S heater circuit — Bank 2, Sensor 1', module: 'PCM' },
  'P0157': { description: 'HO2S circuit low voltage — Bank 2, Sensor 2 (downstream)', module: 'PCM' },
  'P0158': { description: 'HO2S circuit high voltage — Bank 2, Sensor 2 (downstream)', module: 'PCM' },
  'P0159': { description: 'HO2S circuit slow response — Bank 2, Sensor 2 (downstream)', module: 'PCM' },
  'P0160': { description: 'HO2S circuit no activity detected — Bank 2, Sensor 2 (downstream)', module: 'PCM' },
  'P0161': { description: 'HO2S heater circuit — Bank 2, Sensor 2 (downstream)', module: 'PCM' },

  // ─── Fuel Trim ───────────────────────────────────────────────────────────

  'P0171': {
    description: 'Fuel system too lean — Bank 1',
    causes: [
      'Vacuum leak at intake manifold gasket (notorious on Vortec 5.3L, especially after 80 k mi)',
      'Dirty or contaminated MAF sensor',
      'EVAP purge valve stuck open flooding manifold with fuel vapors causing oscillating lean/rich',
      'Low fuel pressure (weak pump, clogged fuel filter)',
      'Failed or lazy upstream O2 sensor Bank 1',
      'Cracked intake boot between MAF and throttle body',
    ],
    repair: 'First smoke-test intake for vacuum leaks — focus on lower intake manifold gaskets. Clean MAF sensor. Check LTFT: values above +10% indicate a lean condition. Verify fuel pressure at rail (58–62 psi key-on, 52–55 psi at idle). Test EVAP purge valve for stuck-open condition.',
    module: 'PCM',
  },
  'P0172': {
    description: 'Fuel system too rich — Bank 1',
    causes: [
      'Leaking fuel injector(s) on Bank 1',
      'Failing fuel pressure regulator (high pressure)',
      'ECT sensor biased cold (engine running open-loop rich)',
      'EVAP purge solenoid passing excessive flow',
    ],
    repair: 'Monitor STFT — values below −10% confirm rich. Check for raw fuel smell at oil dipstick (injector leak-down). Test fuel pressure regulator for diaphragm failure (fuel in vacuum line). Perform injector leak-down test.',
    module: 'PCM',
  },
  'P0174': {
    description: 'Fuel system too lean — Bank 2',
    causes: [
      'Vacuum leak at intake manifold gasket — Bank 2 (passenger side)',
      'Dirty MAF sensor (affects both banks)',
      'Low fuel pressure',
      'Cracked or loose intake ducting downstream of MAF',
    ],
    repair: 'Same diagnosis as P0171. When P0171 and P0174 both present together, start with MAF sensor and intake manifold gaskets. If only P0174, focus on passenger-side intake gasket and Bank 2 injectors.',
    module: 'PCM',
  },
  'P0175': {
    description: 'Fuel system too rich — Bank 2',
    causes: [
      'Leaking fuel injector(s) on Bank 2 (cylinders 2, 4, 6, 8)',
      'High fuel pressure',
      'Faulty MAP sensor reading low (PCM commands excess fuel)',
    ],
    repair: 'Monitor STFT Bank 2 — confirm rich condition. Perform injector balance/leak-down test on Bank 2 cylinders. Check fuel pressure.',
    module: 'PCM',
  },

  // ─── Injector Circuits ───────────────────────────────────────────────────

  'P0201': { description: 'Injector circuit open or shorted — Cylinder 1', causes: ['Open wiring harness to injector', 'Corroded injector connector', 'Failed fuel injector coil (measure ~12–16 Ω)'], repair: 'Measure injector resistance. Check wiring for open or short. Replace injector if coil is open.', module: 'PCM' },
  'P0202': { description: 'Injector circuit open or shorted — Cylinder 2', module: 'PCM' },
  'P0203': { description: 'Injector circuit open or shorted — Cylinder 3', module: 'PCM' },
  'P0204': { description: 'Injector circuit open or shorted — Cylinder 4', module: 'PCM' },
  'P0205': { description: 'Injector circuit open or shorted — Cylinder 5', module: 'PCM' },
  'P0206': { description: 'Injector circuit open or shorted — Cylinder 6', module: 'PCM' },
  'P0207': { description: 'Injector circuit open or shorted — Cylinder 7', module: 'PCM' },
  'P0208': { description: 'Injector circuit open or shorted — Cylinder 8', module: 'PCM' },
  'P0230': { description: 'Fuel pump primary circuit malfunction', module: 'PCM' },
  'P0231': { description: 'Fuel pump secondary circuit low voltage', module: 'PCM' },
  'P0232': { description: 'Fuel pump secondary circuit high voltage', module: 'PCM' },

  // ─── Misfires ────────────────────────────────────────────────────────────

  'P0300': {
    description: 'Random / multiple cylinder misfire detected',
    causes: [
      'Worn or fouled spark plugs (AC Delco 41-932 platinum, replace every 100 k mi)',
      'Failing ignition coil(s) — coil-near-plug, one per cylinder on 5.3L',
      'Lean fuel trim amplifying misfires (confirm P0171/P0174)',
      'Low compression in multiple cylinders',
      'Vacuum leak causing lean stumble',
    ],
    repair: 'Pull all 8 plugs — look for fouling pattern. Swap suspect ignition coil to a different cylinder; if misfire follows the coil, replace it. Check STFT/LTFT for lean condition. Perform relative compression test.',
    module: 'PCM',
  },
  'P0301': {
    description: 'Cylinder 1 misfire detected',
    causes: [
      'Fouled or worn spark plug — Cylinder 1',
      'Failed ignition coil — Cylinder 1',
      'Leaking or stuck fuel injector — Cylinder 1',
      'Low compression — Cylinder 1',
    ],
    repair: 'Swap Cylinder 1 coil with an adjacent cylinder coil. If misfire moves, replace coil. Inspect spark plug. Perform cylinder balance test and compression test on Cylinder 1.',
    module: 'PCM',
  },
  'P0302': { description: 'Cylinder 2 misfire detected', module: 'PCM' },
  'P0303': { description: 'Cylinder 3 misfire detected', module: 'PCM' },
  'P0304': { description: 'Cylinder 4 misfire detected', module: 'PCM' },
  'P0305': { description: 'Cylinder 5 misfire detected', module: 'PCM' },
  'P0306': { description: 'Cylinder 6 misfire detected', module: 'PCM' },
  'P0307': { description: 'Cylinder 7 misfire detected', module: 'PCM' },
  'P0308': { description: 'Cylinder 8 misfire detected', module: 'PCM' },
  'P0315': {
    description: 'Crankshaft Position (CKP) System Variation Not Learned',
    causes: [
      'CKP reluctor ring variation learn procedure never performed after PCM replacement',
      'PCM replaced without CASE (Crank Angle Sensor Error) learn',
    ],
    repair: 'Perform CKP variation learn procedure with a Tech II or equivalent scanner. Engine must be fully warm, transmission in Park/Neutral, A/C off.',
    module: 'PCM',
  },

  // ─── Ignition / Knock / CKP / CMP ────────────────────────────────────────

  'P0320': { description: 'Ignition/engine speed input circuit malfunction (no RPM signal)', module: 'PCM' },
  'P0327': {
    description: 'Knock sensor 1 circuit low input — Bank 1',
    causes: [
      'Failed knock sensor (flat single-wire piezoelectric sensor on Vortec 5.3L)',
      'Wiring open between knock sensor and PCM',
      'Water intrusion at sensor connector under intake manifold',
    ],
    repair: 'Remove intake manifold to access knock sensors (they are under the lower intake on the 5.3L). Measure sensor resistance (3,300–4,500 Ω). Inspect wiring harness for chafing. Replace sensor if resistance is out of range.',
    module: 'PCM',
  },
  'P0328': { description: 'Knock sensor 1 circuit high input — Bank 1', causes: ['Short to voltage in knock sensor signal wire', 'Failed knock sensor'], repair: 'Inspect signal wire for short. Replace knock sensor if wiring is intact.', module: 'PCM' },
  'P0332': { description: 'Knock sensor 2 circuit low input — Bank 2', module: 'PCM' },
  'P0333': { description: 'Knock sensor 2 circuit high input — Bank 2', module: 'PCM' },
  'P0336': {
    description: 'CKP sensor A circuit range/performance',
    causes: [
      'Damaged or cracked CKP reluctor ring (58-tooth ring on Gen III 5.3L)',
      'Excessive crankshaft end play affecting reluctor-to-sensor gap',
      'Intermittent CKP sensor signal',
    ],
    repair: 'Check CKP sensor air gap (0.5–1.5 mm). Inspect reluctor ring for damaged or missing teeth. Monitor CKP signal with a lab scope.',
    module: 'PCM',
  },
  'P0337': { description: 'CKP sensor A circuit low input', module: 'PCM' },
  'P0338': { description: 'CKP sensor A circuit high input', module: 'PCM' },
  'P0339': { description: 'CKP sensor A circuit intermittent signal', module: 'PCM' },
  'P0340': {
    description: 'Camshaft Position (CMP) sensor A circuit — Bank 1',
    causes: [
      'Failed CMP sensor (Hall-effect sensor on driver-side timing cover)',
      'Wiring fault to PCM',
      'Damaged reluctor wheel on camshaft',
    ],
    repair: 'Inspect CMP sensor and wiring. Check 5 V reference and ground at sensor connector. Replace sensor if reference and ground are present.',
    module: 'PCM',
  },
  'P0341': { description: 'CMP sensor A circuit range/performance — Bank 1', module: 'PCM' },
  'P0342': { description: 'CMP sensor A circuit low input — Bank 1', module: 'PCM' },
  'P0343': { description: 'CMP sensor A circuit high input — Bank 1', module: 'PCM' },

  // ─── Catalysts ───────────────────────────────────────────────────────────

  'P0420': {
    description: 'Catalyst system efficiency below threshold — Bank 1',
    causes: [
      'Failed or depleted catalytic converter — Bank 1 (driver side)',
      'Exhaust leak upstream of downstream O2 sensor skewing comparison',
      'Downstream O2 sensor (Bank 1, Sensor 2) lazy or contaminated',
      'Rich-running engine overloading catalyst with unburned fuel',
    ],
    repair: 'Compare upstream vs. downstream O2 waveforms — downstream should be flat (< 0.2 V swing) on a good catalyst. Inspect for exhaust leaks near downstream sensor. Address any P0171/P0172 first. Replace catalytic converter if downstream O2 is active/switching.',
    module: 'PCM',
  },
  'P0430': {
    description: 'Catalyst system efficiency below threshold — Bank 2',
    causes: [
      'Failed or depleted catalytic converter — Bank 2 (passenger side)',
      'Exhaust leak upstream of Bank 2 downstream O2 sensor',
      'Downstream O2 sensor (Bank 2, Sensor 2) lazy or contaminated',
    ],
    repair: 'Same diagnosis as P0420. Both cats often fail together on high-mileage trucks running lean conditions. Address underlying fuel trim codes first.',
    module: 'PCM',
  },

  // ─── EVAP ────────────────────────────────────────────────────────────────

  'P0440': { description: 'Evaporative Emission Control (EVAP) system malfunction — general', module: 'PCM' },
  'P0441': {
    description: 'EVAP Control System incorrect purge flow',
    causes: [
      'EVAP purge solenoid stuck closed (no flow when commanded)',
      'Kinked or collapsed EVAP purge hose to intake manifold',
      'PCM purge command circuit fault',
    ],
    repair: 'Verify purge solenoid clicks when commanded by scanner. Check hose routing from purge valve to intake manifold. Apply vacuum to purge solenoid — should hold when de-energized.',
    module: 'PCM',
  },
  'P0442': {
    description: 'EVAP Control System leak detected — small leak (≤ 0.020 in orifice)',
    causes: [
      'Loose, missing, or cracked fuel filler cap (most common on GMT800)',
      'Cracked EVAP hose or canister fitting',
      'EVAP vent solenoid not fully sealing',
      'Fuel filler neck O-ring degraded',
    ],
    repair: 'Tighten or replace fuel cap first — clear code and retest. If leak persists, perform EVAP smoke test with vent solenoid commanded closed. Inspect all EVAP hoses from tank to purge valve. Common leak points: fuel cap gasket, EVAP vent solenoid at tank.',
    module: 'PCM',
  },
  'P0443': { description: 'EVAP purge control valve circuit malfunction', causes: ['Open or shorted circuit to purge solenoid', 'Failed purge solenoid coil'], repair: 'Measure purge solenoid resistance (~22–30 Ω). Verify 12V on one terminal and PCM ground switching on the other. Replace solenoid if resistance is out of spec.', module: 'PCM' },
  'P0446': {
    description: 'EVAP Control System vent control circuit malfunction',
    causes: [
      'Failed EVAP vent solenoid (located at canister near spare tire on GMT800)',
      'Open wiring to vent solenoid',
      'Wiring harness chafing on frame near rear axle',
    ],
    repair: 'Locate EVAP vent solenoid at charcoal canister (rear frame rail, driver side). Measure solenoid resistance (~22–40 Ω). Inspect long wiring run for chafing on frame. Command solenoid open/closed with scanner and verify vacuum response.',
    module: 'PCM',
  },
  'P0449': {
    description: 'EVAP system vent valve/solenoid circuit malfunction',
    causes: [
      'Failed EVAP vent solenoid coil (open circuit)',
      'Corroded connector at vent solenoid (exposed rear-frame location)',
      'Broken wire in rear harness run',
    ],
    repair: 'Inspect vent solenoid connector for corrosion. Measure resistance across solenoid terminals. Check continuity of wiring back to PCM. Replace solenoid if coil is open.',
    module: 'PCM',
  },
  'P0452': { description: 'Fuel Tank Pressure (FTP) sensor circuit low input', module: 'PCM' },
  'P0453': { description: 'Fuel Tank Pressure (FTP) sensor circuit high input', module: 'PCM' },
  'P0455': {
    description: 'EVAP Control System large leak detected (> 0.080 in orifice)',
    causes: [
      'Missing, stripped, or cracked fuel filler cap',
      'Disconnected or split large-diameter EVAP hose at canister',
      'EVAP vent solenoid stuck open (venting to atmosphere during test)',
      'Loose fuel filler neck-to-tank connection',
    ],
    repair: 'Replace fuel filler cap first. If code returns, smoke-test EVAP system with vent solenoid commanded closed. A large leak will be visible as smoke exiting the fault point.',
    module: 'PCM',
  },
  'P0461': { description: 'Fuel Level sensor circuit range/performance', module: 'PCM' },
  'P0462': { description: 'Fuel Level sensor circuit low input', module: 'PCM' },
  'P0463': { description: 'Fuel Level sensor circuit high input (gauge always reads full)', module: 'PCM' },
  'P0496': {
    description: 'EVAP system — high purge flow during non-purge condition',
    causes: [
      'EVAP purge solenoid stuck open (allowing constant manifold vacuum to pull vapors)',
      'Purge valve contaminated with fuel or debris preventing full closure',
    ],
    repair: 'Command purge valve closed with scanner. If idle quality improves, the valve is stuck open. Apply vacuum to purge port while valve is de-energized — should hold vacuum if properly closed. Replace purge valve if it leaks.',
    module: 'PCM',
  },

  // ─── Vehicle Speed / Idle ─────────────────────────────────────────────────

  'P0500': { description: 'Vehicle Speed Sensor (VSS) circuit malfunction', module: 'PCM' },
  'P0501': { description: 'VSS circuit range/performance', module: 'PCM' },
  'P0502': { description: 'VSS circuit low input', module: 'PCM' },
  'P0503': { description: 'VSS circuit intermittent/erratic/high', module: 'PCM' },
  'P0506': {
    description: 'Idle Control System RPM too low — actual idle below target',
    causes: ['Throttle body carbon build-up restricting airflow at idle', 'Vacuum leak causing PCM to reduce IAC below minimum'],
    repair: 'Clean throttle body and idle air passages. Perform throttle position relearn after cleaning.',
    module: 'PCM',
  },
  'P0507': {
    description: 'Idle Control System RPM too high — actual idle above target',
    causes: ['Vacuum leak (unmetered air raising idle)', 'IAC valve stuck open', 'Throttle plate not fully closing'],
    repair: 'Smoke-test for vacuum leaks. Check IAC valve and passages. Verify throttle blade fully closes at idle.',
    module: 'PCM',
  },

  // ─── System Voltage ───────────────────────────────────────────────────────

  'P0560': { description: 'System voltage malfunction — PCM detected abnormal voltage', module: 'PCM' },
  'P0562': {
    description: 'System voltage low — PCM supply below 10 V for extended period',
    causes: ['Weak battery', 'Failing alternator', 'High-resistance connection in charging circuit'],
    repair: 'Test battery (CCA) and charging output (13.5–14.8 V at idle). Inspect alternator output terminal and battery cables.',
    module: 'PCM',
  },
  'P0563': {
    description: 'System voltage high — PCM supply above 16 V',
    causes: ['Overcharging alternator — voltage regulator failure', 'Damaged PCM power supply circuit'],
    repair: 'Measure charging voltage at battery. Above 15 V indicates a failed voltage regulator inside the alternator. Replace alternator.',
    module: 'PCM',
  },

  // ─── Computer / Output ───────────────────────────────────────────────────

  'P0601': { description: 'PCM internal memory check sum error', causes: ['PCM EEPROM corruption', 'Flash programming interrupted'], repair: 'Reprogram PCM with latest calibration file using Tech II or equivalent. Replace PCM if reprogramming fails.', module: 'PCM' },
  'P0602': { description: 'PCM programming error — module not programmed', module: 'PCM' },
  'P0603': { description: 'PCM Keep Alive Memory (KAM) error', module: 'PCM' },
  'P0604': { description: 'PCM Random Access Memory (RAM) error', module: 'PCM' },
  'P0605': { description: 'PCM Read Only Memory (ROM) error', module: 'PCM' },
  'P0606': {
    description: 'PCM processor fault — internal watchdog triggered',
    causes: ['PCM internal failure', 'Power or ground supply to PCM intermittent'],
    repair: 'Verify all PCM grounds (engine block, firewall). Confirm PCM supply voltage. Replace PCM if grounds and power are confirmed good.',
    module: 'PCM',
  },
  'P0620': { description: 'Generator (alternator) control circuit malfunction', module: 'PCM' },
  'P0621': { description: 'Generator lamp control circuit (L terminal) fault', module: 'PCM' },
  'P0622': { description: 'Generator field terminal (F terminal) circuit fault', module: 'PCM' },
  'P0641': {
    description: 'Sensor 5 V reference A circuit open — multiple sensors may read erratic',
    causes: ['Shorted sensor on 5V reference circuit (MAP, TPS, FTP)', 'Open circuit in 5V reference wire'],
    repair: 'Disconnect sensors one at a time to find which one is pulling reference low. Repair short or replace affected sensor.',
    module: 'PCM',
  },
  'P0642': { description: 'Sensor 5 V reference A circuit low', module: 'PCM' },
  'P0643': { description: 'Sensor 5 V reference A circuit high', module: 'PCM' },
  'P0651': { description: 'Sensor 5 V reference B circuit open', module: 'PCM' },
  'P0652': { description: 'Sensor 5 V reference B circuit low', module: 'PCM' },
  'P0653': { description: 'Sensor 5 V reference B circuit high', module: 'PCM' },

  // ─── Transmission (4L60E / 4L80E) ────────────────────────────────────────

  'P0700': { description: 'Transmission Control System malfunction — check for TCM-specific codes', module: 'TCM' },
  'P0703': { description: 'Brake switch B input circuit fault', module: 'PCM' },
  'P0705': {
    description: 'Transmission range sensor (PRNDL input) circuit malfunction',
    causes: ['Failed transmission range sensor (TRS) inside transmission', 'Open or shorted wiring to TRS', 'Manual shift linkage misadjusted'],
    repair: 'Verify TRS signal matches actual gear selection with scanner. Adjust linkage if range displayed is off by one position. Replace TRS if adjustment does not resolve.',
    module: 'TCM',
  },
  'P0706': { description: 'Transmission range sensor circuit range/performance', module: 'TCM' },
  'P0711': { description: 'Transmission fluid temperature (TFT) sensor circuit range/performance', module: 'TCM' },
  'P0712': { description: 'TFT sensor circuit low input (reading extremely hot)', module: 'TCM' },
  'P0713': { description: 'TFT sensor circuit high input (reading extremely cold)', module: 'TCM' },
  'P0715': { description: 'Input/turbine speed sensor A circuit malfunction', module: 'TCM' },
  'P0716': { description: 'Input/turbine speed sensor A circuit range/performance', module: 'TCM' },
  'P0717': { description: 'Input/turbine speed sensor A circuit no signal', module: 'TCM' },
  'P0719': { description: 'Brake switch B circuit low', module: 'PCM' },
  'P0720': { description: 'Output speed sensor (OSS) circuit malfunction', module: 'TCM' },
  'P0721': { description: 'Output speed sensor range/performance', module: 'TCM' },
  'P0722': { description: 'Output speed sensor no signal', module: 'TCM' },
  'P0724': { description: 'Brake switch B circuit high', module: 'PCM' },
  'P0730': { description: 'Incorrect gear ratio — ratio does not match commanded gear', module: 'TCM' },
  'P0731': { description: 'Gear 1 incorrect gear ratio', module: 'TCM' },
  'P0732': { description: 'Gear 2 incorrect gear ratio', module: 'TCM' },
  'P0733': { description: 'Gear 3 incorrect gear ratio', module: 'TCM' },
  'P0734': { description: 'Gear 4 incorrect gear ratio', module: 'TCM' },
  'P0740': { description: 'Torque Converter Clutch (TCC) circuit malfunction', module: 'TCM' },
  'P0741': {
    description: 'Torque Converter Clutch (TCC) circuit performance or stuck off',
    causes: [
      'Failed TCC solenoid inside 4L60E valve body (most common on GMT800)',
      'Worn TCC clutch friction material',
      'Low line pressure preventing TCC apply',
      'TCC solenoid control circuit open or high resistance',
    ],
    repair: 'Monitor TCC slip speed — should approach 0 RPM when locked. Check TCC solenoid resistance (~20–30 Ω on 4L60E). Perform line pressure test. Replace TCC solenoid or rebuild valve body if solenoid resistance and wiring are OK.',
    module: 'TCM',
  },
  'P0742': { description: 'TCC circuit stuck on — converter locked unintentionally', module: 'TCM' },
  'P0748': { description: 'Pressure Control (PC) solenoid A electrical fault', module: 'TCM' },
  'P0751': { description: 'Shift solenoid A (1-2 shift) performance or stuck off', module: 'TCM' },
  'P0752': { description: 'Shift solenoid A stuck on', module: 'TCM' },
  'P0753': {
    description: 'Shift solenoid A (1-2 shift) electrical fault — 4L60E',
    causes: [
      'Failed 1-2 shift solenoid inside valve body (common failure on high-mileage 4L60E)',
      'Open or shorted solenoid wiring inside transmission',
      'Intermittent connector issue at transmission external wiring harness connector',
    ],
    repair: 'Measure solenoid resistance at transmission external connector (~20–30 Ω). Drop the transmission pan to access valve body and inspect internal wiring connector. Replace solenoid or valve body assembly if solenoid is open or shorted.',
    module: 'TCM',
  },
  'P0756': { description: 'Shift solenoid B (2-3 shift) performance or stuck off', module: 'TCM' },
  'P0757': { description: 'Shift solenoid B stuck on', module: 'TCM' },
  'P0758': {
    description: 'Shift solenoid B (2-3 shift) electrical fault — 4L60E',
    causes: [
      'Failed 2-3 shift solenoid inside valve body',
      'Open internal wiring harness connector inside transmission pan',
      'Cracked solenoid body from thermal cycling',
    ],
    repair: 'Same procedure as P0753. Measure resistance, drop pan, inspect solenoid and internal connector.',
    module: 'TCM',
  },
  'P0785': { description: 'Shift/timing solenoid malfunction', module: 'TCM' },

  // ═══════════════════════════════════════════════════════════════════════════
  // P1xxx — GM Manufacturer-Specific Powertrain (GMT800)
  // ═══════════════════════════════════════════════════════════════════════════

  'P1106': { description: 'MAP sensor circuit intermittent high voltage', module: 'PCM' },
  'P1107': { description: 'MAP sensor circuit intermittent low voltage', module: 'PCM' },
  'P1111': { description: 'IAT sensor circuit intermittent high voltage', module: 'PCM' },
  'P1112': { description: 'IAT sensor circuit intermittent low voltage', module: 'PCM' },
  'P1114': { description: 'ECT sensor circuit intermittent low voltage', module: 'PCM' },
  'P1115': { description: 'ECT sensor circuit intermittent high voltage', module: 'PCM' },
  'P1120': { description: 'Throttle Position (TP) sensor A circuit — GM enhanced', module: 'PCM' },
  'P1121': { description: 'TP sensor A circuit intermittent high voltage', module: 'PCM' },
  'P1122': { description: 'TP sensor A circuit intermittent low voltage', module: 'PCM' },
  'P1125': {
    description: 'Accelerator Pedal Position (APP) system fault — all three APP sensors cross-check failed',
    causes: [
      'APP sensor assembly failure inside accelerator pedal (sensor is integral, replace pedal)',
      'Wiring fault to APP connector under dash',
    ],
    repair: 'Monitor all three APP sensor voltages in live data. If any two diverge, the pedal assembly has failed. Replace accelerator pedal assembly.',
    module: 'PCM',
  },
  'P1133': {
    description: 'HO2S insufficient switching — Bank 1, Sensor 1 (upstream switches too slowly)',
    causes: [
      'Aged upstream O2 sensor with slow response (most common above 80 k miles)',
      'Coolant or oil contamination poisoning the sensor',
    ],
    repair: 'Count O2 crosscounts over 10 seconds — healthy sensor should switch 10+ times. Replace upstream O2 sensor Bank 1 if switching rate is low.',
    module: 'PCM',
  },
  'P1134': { description: 'HO2S transition time ratio too high or too low — Bank 1, Sensor 1', module: 'PCM' },
  'P1153': { description: 'HO2S insufficient switching — Bank 2, Sensor 1 (upstream, passenger side)', module: 'PCM' },
  'P1154': { description: 'HO2S transition time ratio — Bank 2, Sensor 1', module: 'PCM' },
  'P1171': { description: 'Fuel system lean during power enrichment — Bank 1', causes: ['Low fuel pressure dropping under WOT load', 'Restricted fuel filter', 'Injector flow restriction on Bank 1'], repair: 'Test fuel pressure under WOT — must maintain ≥ 55 psi. Replace fuel filter. Perform injector flow test.', module: 'PCM' },
  'P1174': { description: 'Fuel system lean during power enrichment — Bank 2', module: 'PCM' },
  'P1220': { description: 'Serial data link fault between PCM and Throttle Actuator Control (TAC) module', module: 'PCM' },
  'P1258': {
    description: 'Engine coolant overtemperature — PCM entered protection mode (reduced power / fuel cut)',
    causes: [
      'Actual engine overtemperature (low coolant, thermostat, water pump, head gasket)',
      'ECT sensor biased high triggering false protection mode',
    ],
    repair: 'Verify actual coolant temperature with infrared. Inspect coolant level, thermostat, water pump, and cooling fan operation. Protection mode reduces power and retards timing to prevent detonation damage.',
    module: 'PCM',
  },
  'P1271': { description: 'A/F sensor 1 rich-to-lean response slow or missing — Bank 1, Sensor 1', module: 'PCM' },
  'P1272': { description: 'A/F sensor 1 lean-to-rich response slow or missing — Bank 1, Sensor 1', module: 'PCM' },
  'P1275': { description: 'A/F sensor 1 rich-to-lean response slow or missing — Bank 2, Sensor 1', module: 'PCM' },
  'P1276': { description: 'A/F sensor 1 lean-to-rich response slow or missing — Bank 2, Sensor 1', module: 'PCM' },
  'P1280': { description: 'A/F sensor 1 heater performance — Bank 1, Sensor 1', module: 'PCM' },
  'P1283': { description: 'A/F sensor 1 heater performance — Bank 2, Sensor 1', module: 'PCM' },
  'P1285': { description: 'A/F sensor 1 signal voltage too high — Bank 1, Sensor 1', module: 'PCM' },
  'P1288': { description: 'A/F sensor 1 signal voltage too high — Bank 2, Sensor 1', module: 'PCM' },
  'P1345': {
    description: 'Crankshaft Position (CKP) to Camshaft Position (CMP) correlation fault',
    causes: [
      'Camshaft timing off due to stretched or jumped timing chain (common on high-mileage 5.3L)',
      'CMP or CKP sensor inconsistency',
      'Incorrect camshaft or crankshaft position after engine work',
    ],
    repair: 'Check camshaft timing with a scan tool — PCM monitors CKP-to-CMP phase angle. Verify timing chain stretch using slack indicator procedure in GM SI. A stretched chain is the most common cause above 150 k mi on the LM7/L59.',
    module: 'PCM',
  },
  'P1351': { description: 'Ignition Control (IC) circuit — high voltage at PCM IC input', module: 'PCM' },
  'P1361': { description: 'Ignition Control (IC) circuit low voltage — from ICM to PCM', module: 'PCM' },
  'P1362': { description: 'Ignition Control (IC) circuit high voltage — from ICM to PCM', module: 'PCM' },
  'P1380': {
    description: 'ABS rough road data error — EBCM reporting rough road; may suppress misfire detection',
    causes: ['ABS fault preventing rough-road compensation signal to PCM', 'Actual ABS fault on vehicle'],
    repair: 'Address any EBCM codes first. The rough road signal from EBCM prevents false misfire detection on rough surfaces.',
    module: 'PCM',
  },
  'P1381': { description: 'ABS misfire detected — no EBCM communication for rough road compensation', module: 'PCM' },
  'P1441': { description: 'EVAP system flow during non-purge condition (GM enhanced equivalent of P0496)', module: 'PCM' },
  'P1442': { description: 'EVAP system small leak — 0.020 in orifice equivalent (GM enhanced resolution)', module: 'PCM' },
  'P1484': { description: 'Catalytic converter protection active — PCM enrichened mixture to protect overheating catalyst', module: 'PCM' },
  'P1514': {
    description: 'TAC system high airflow detected — actual airflow exceeds commanded throttle position',
    causes: ['Throttle body stuck open or binding', 'TAC motor or gear stripped inside throttle body assembly'],
    repair: 'Inspect throttle body for mechanical binding. Check TAC motor gear mesh. Replace throttle body assembly if TAC cannot control plate position.',
    module: 'PCM',
  },
  'P1515': { description: 'Commanded vs. actual throttle body position mismatch', module: 'PCM' },
  'P1516': {
    description: 'TAC module — throttle actuator position performance',
    causes: [
      'Carbon build-up on throttle plate preventing return to idle position',
      'Throttle return spring broken or weakened',
      'TAC motor failure',
    ],
    repair: 'Clean throttle body thoroughly. Check throttle spring tension. Perform throttle position relearn after cleaning. Replace throttle body if TAC motor does not respond.',
    module: 'PCM',
  },
  'P1517': { description: 'TAC module ignition relay control circuit fault', module: 'PCM' },
  'P1518': { description: 'TAC module serial data communication fault', module: 'PCM' },
  'P1519': { description: 'TAC module spring performance — throttle not returning to rest position', module: 'PCM' },
  'P1520': { description: 'Park/Neutral Position (PNP) switch circuit fault', module: 'PCM' },
  'P1571': {
    description: 'Traction Control System torque reduction request circuit — PCM not receiving TCS request from EBCM',
    causes: ['EBCM communication fault on Class II bus', 'Wiring fault between EBCM and PCM'],
    repair: 'Check EBCM for related Class II codes. Verify Class II bus integrity. Diagnose EBCM first.',
    module: 'PCM',
  },
  'P1600': { description: 'PCM to TCM serial data link malfunction', module: 'PCM' },
  'P1601': { description: 'Serial data link malfunction — internal PCM communication fault', module: 'PCM' },
  'P1602': {
    description: 'PCM not programmed — replacement PCM installed but VIN/calibration not written',
    repair: 'Program PCM with VIN, calibration file, and perform CKP variation learn and TCC learn using Tech II or J2534 pass-thru device.',
    module: 'PCM',
  },
  'P1621': { description: 'PCM long-term memory performance — KAM data lost repeatedly', module: 'PCM' },
  'P1626': {
    description: 'Passlock II Theft Deterrent — fuel enable signal lost with correct code received',
    causes: [
      'Ignition switch lock cylinder Passlock sensor failure',
      'Passlock wiring harness fault between ignition lock and BCM',
      'BCM fuel enable circuit fault',
    ],
    repair: 'Perform Passlock relearn (10-minute timer method). If relearn fails, check resistance of Passlock sensor in ignition lock cylinder. Inspect yellow 3-pin Passlock connector at steering column.',
    module: 'PCM',
  },
  'P1629': {
    description: 'Passlock II Theft Deterrent — fuel enable signal not received from BCM',
    causes: [
      'BCM not sending fuel enable after ignition',
      'Passlock sensor resistance out of range for current PCM learned value',
      'Wiring fault between BCM and PCM',
    ],
    repair: 'Perform Passlock relearn. Check Passlock wiring between ignition lock, BCM, and PCM. This code often accompanies a no-start condition.',
    module: 'PCM',
  },
  'P1631': { description: 'Passlock II — fuel enable signal received but incorrect resistance class mismatch', module: 'PCM' },
  'P1632': {
    description: 'Passlock II Theft Deterrent — PCM has disabled fuel injection',
    causes: [
      'Multiple failed start attempts without correct Passlock signal',
      'Passlock sensor failed mid-ignition cycle',
      'Wire break in yellow Passlock circuit',
    ],
    repair: 'Perform Passlock emergency relearn: turn key to RUN (not Start), wait 10 minutes for Security light to extinguish, cycle key off, then restart. May require 3 cycles. Address underlying Passlock fault to prevent recurrence.',
    module: 'PCM',
  },
  'P1635': { description: '5-Volt reference 1 circuit fault (GM-specific reference voltage code)', module: 'PCM' },
  'P1639': { description: '5-Volt reference 2 circuit fault', module: 'PCM' },
  'P1641': { description: 'Fan control relay 1 (engine cooling fan low speed) circuit fault', module: 'PCM' },
  'P1651': { description: 'Fan control relay 2 (engine cooling fan high speed) circuit fault', module: 'PCM' },
  'P1652': { description: 'Fan control relay 3 circuit fault', module: 'PCM' },
  'P1683': { description: 'TAC module serial data redundancy fault (pedal/throttle ECU cross-check)', module: 'PCM' },
  'P1686': { description: 'PCM not programmed — alternate code', module: 'PCM' },

  // ═══════════════════════════════════════════════════════════════════════════
  // P2xxx — SAE J2012 Generic (newer standard; applicable to 2004 TAC system)
  // ═══════════════════════════════════════════════════════════════════════════

  'P2101': {
    description: 'Throttle Actuator Control (TAC) motor circuit range/performance',
    causes: ['TAC motor failure inside throttle body', 'Throttle plate binding mechanically', 'TAC motor circuit wiring fault'],
    repair: 'Inspect throttle body for physical binding. Check TAC motor connector. Replace throttle body assembly if motor does not respond to commands.',
    module: 'PCM',
  },
  'P2108': { description: 'TAC module performance — processor internal fault', module: 'PCM' },
  'P2119': { description: 'Throttle closed position performance — plate not fully closing at idle', module: 'PCM' },
  'P2120': { description: 'Throttle/Pedal Position sensor D circuit malfunction', module: 'PCM' },
  'P2121': { description: 'Throttle/Pedal Position sensor D circuit range/performance', module: 'PCM' },
  'P2122': { description: 'Throttle/Pedal Position sensor D circuit low input', module: 'PCM' },
  'P2123': { description: 'Throttle/Pedal Position sensor D circuit high input', module: 'PCM' },
  'P2125': { description: 'Throttle/Pedal Position sensor E circuit malfunction', module: 'PCM' },
  'P2127': { description: 'Throttle/Pedal Position sensor E circuit low input', module: 'PCM' },
  'P2128': { description: 'Throttle/Pedal Position sensor E circuit high input', module: 'PCM' },
  'P2135': {
    description: 'Throttle/Pedal Position sensor A/B voltage correlation fault',
    causes: [
      'TP sensor A and B not tracking correctly (should be inverse — A high = B low)',
      'Carbon on throttle plate causing inconsistent position',
      'Failed throttle body assembly',
    ],
    repair: 'Monitor TP sensor A and B live. Clean throttle body. Replace throttle body if sensors diverge after cleaning.',
    module: 'PCM',
  },
  'P2138': {
    description: 'APP sensor D/E voltage correlation fault — two accelerator pedal sensors disagree',
    causes: ['Accelerator pedal position sensor assembly failure', 'Wiring fault to APP sensor connector'],
    repair: 'Replace accelerator pedal assembly — the sensor is integral and not separately serviceable on GMT800.',
    module: 'PCM',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // B0xxx — SAE J2012 Generic Body / Sensing & Diagnostic Module (SDM/airbag)
  // ═══════════════════════════════════════════════════════════════════════════

  'B0001': { description: 'Driver frontal Stage 1 airbag deployment control — squib circuit fault', module: 'SDM' },
  'B0002': { description: 'Driver frontal Stage 2 airbag deployment control — squib circuit fault', module: 'SDM' },
  'B0006': { description: 'Driver side airbag (side impact) squib circuit fault', module: 'SDM' },
  'B0011': { description: 'Driver side deployment loop Stage 1 circuit fault', module: 'SDM' },
  'B0012': { description: 'Driver side deployment loop Stage 2 circuit fault', module: 'SDM' },
  'B0014': { description: 'Passenger frontal Stage 1 airbag deployment control — squib fault', module: 'SDM' },
  'B0016': { description: 'Passenger frontal Stage 2 airbag deployment control — squib fault', module: 'SDM' },
  'B0021': { description: 'Passenger side deployment loop Stage 1 circuit fault', module: 'SDM' },
  'B0026': { description: 'Right roof rail (side curtain) deployment loop Stage 1 fault', module: 'SDM' },
  'B0028': { description: 'Driver seatbelt pretensioner deployment control circuit fault', module: 'SDM' },
  'B0032': { description: 'Passenger seatbelt pretensioner deployment control circuit fault', module: 'SDM' },
  'B0051': { description: 'Airbag warning lamp circuit — SDM cannot control SRS telltale', module: 'SDM' },
  'B0056': { description: 'Driver seat position sensor — circuit fault or out of range for suppression logic', module: 'SDM' },
  'B0076': { description: 'Passenger seat position sensor — out of range or circuit fault', module: 'SDM' },
  'B0081': { description: 'Frontal crash sensor signal line circuit fault', module: 'SDM' },
  'B0083': { description: 'Deployment commanded — SDM has detected a deployment event in history', module: 'SDM' },
  'B0086': { description: 'Second row left deployment loop Stage 1 circuit fault', module: 'SDM' },

  // ═══════════════════════════════════════════════════════════════════════════
  // B1xxx / B2xxx / B3xxx — GM Manufacturer-Specific Body
  // ═══════════════════════════════════════════════════════════════════════════

  'B1000': { description: 'Electronic Control Unit (ECU) fault — module hardware or calibration failure', module: 'BCM' },
  'B1001': {
    description: 'Option configuration error — BCM options do not match installed hardware',
    causes: ['BCM replaced without reprogramming to match vehicle options (seats, HVAC, towing package)', 'Incorrect RPO codes loaded into BCM'],
    repair: 'Reprogram BCM with correct option content using Tech II. Match all RPO codes to vehicle build sheet.',
    module: 'BCM',
  },
  'B1004': { description: 'BCM Keep Alive Memory (KAM) error — non-volatile memory lost', module: 'BCM' },
  'B1007': { description: 'BCM EEPROM fault — stored configuration data corrupted', module: 'BCM' },
  'B1009': { description: 'BCM configuration error — module configuration invalid', module: 'BCM' },
  'B1325': { description: 'Device power circuit 1 low — BCM switched supply below threshold', module: 'BCM' },
  'B1327': { description: 'Device power circuit 2 low — BCM secondary supply below threshold', module: 'BCM' },
  'B1328': { description: 'Device power circuit 2 high — BCM secondary supply above threshold', module: 'BCM' },
  'B1450': { description: 'Turn signal / hazard flasher circuit fault', module: 'BCM' },
  'B1517': {
    description: 'Battery voltage low — BCM supply voltage below 10.5 V',
    causes: ['Weak or discharged 12 V battery', 'Parasitic draw discharging battery overnight', 'Failing alternator not maintaining charge'],
    repair: 'Load-test battery. Measure charge voltage. Perform parasitic draw test if battery discharges when parked.',
    module: 'BCM',
  },
  'B1780': {
    description: 'Retained Accessory Power (RAP) relay circuit — BCM RAP relay or circuit fault',
    causes: [
      'RAP relay failure inside BCM or in IPFB',
      'Short or open in RAP circuit keeping accessories on beyond normal timeout',
    ],
    repair: 'RAP should cut power to radio/windows 10 minutes after ignition off or when door is opened. If accessories stay on indefinitely, diagnose BCM RAP relay circuit. A common cause of parasitic drain on GMT800.',
    module: 'BCM',
  },
  'B1982': {
    description: 'Instrument Panel Cluster (IPC) — loss of Class II serial data from Body Control Module',
    causes: [
      'BCM (0x28) not communicating on Class II bus',
      'Class II bus high resistance or open between BCM and IPC',
      'Ground integrity fault at IPC connector C2',
      'Parasitic draw keeping Class II bus active and causing bus corruption',
      'Failed BCM',
    ],
    repair: 'Check Class II bus voltage at DLC pin 2 (should be ~7 V idle, ~12 V during active data transfer). Inspect IPC connector C2 ground — firewall-to-engine ground strap must measure < 0.1 Ω. If bus is active with key off, diagnose parasitic draw starting with TBC BATT fuse. Pull IPC and BCM codes together — they cross-reference the fault.',
    module: 'IPC',
  },
  'B2000': { description: 'Passenger Restraint Module (SDM) fault', module: 'SDM' },
  'B2005': { description: 'Passenger side air bag sensor fault', module: 'SDM' },
  'B2007': { description: 'Passenger seat position sensor out of allowable range', module: 'SDM' },
  'B2420': {
    description: 'HVAC actuator position out of range — mode or blend door actuator',
    causes: [
      'Broken blend door actuator gear (common failure on GMT800 HVAC)',
      'Actuator feedback potentiometer worn',
      'Mechanical binding of door',
    ],
    repair: 'Remove glove box or HVAC case access panel to reach actuator. Rotate actuator by hand to check for binding. Replace actuator if gears are stripped.',
    module: 'HVAC',
  },
  'B2429': { description: 'Heated seat module fault — driver or passenger seat heater circuit', module: 'BCM' },
  'B2490': { description: 'Fuel door release solenoid circuit fault', module: 'BCM' },
  'B2750': { description: 'Rear window defogger circuit fault — grid not energizing or relay fault', module: 'BCM' },
  'B2960': { description: 'Security sensor data circuit low (Passlock sensor)', module: 'BCM' },
  'B2961': { description: 'Security sensor data circuit high (Passlock sensor)', module: 'BCM' },
  'B3001': { description: 'HVAC mode door actuator circuit fault', module: 'HVAC' },
  'B3033': { description: 'HVAC air inlet (recirculation) actuator circuit fault', module: 'HVAC' },
  'B3055': { description: 'HVAC temperature door actuator circuit fault', module: 'HVAC' },
  'B3059': { description: 'HVAC air mix door actuator performance — feedback disagrees with commanded position', module: 'HVAC' },
  'B3101': {
    description: 'HVAC blower motor control circuit fault',
    causes: ['Failed blower motor speed controller (resistor block)', 'Blower motor winding open', 'BCM/HVAC module blower driver fault'],
    repair: 'Test blower motor resistance. Check power feed and ground at blower. Inspect resistor block in HVAC plenum for burn marks.',
    module: 'HVAC',
  },
  'B3105': { description: 'HVAC high-side refrigerant pressure sensor — circuit or range fault', module: 'HVAC' },
  'B3109': { description: 'HVAC A/C compressor clutch control circuit fault', module: 'HVAC' },

  // ═══════════════════════════════════════════════════════════════════════════
  // C0xxx — SAE J2012 Generic Chassis (EBCM / ABS)
  // ═══════════════════════════════════════════════════════════════════════════

  'C0035': {
    description: 'Left front wheel speed sensor circuit fault',
    causes: [
      'Damaged wheel speed sensor or tone ring (common after off-roading or heavy rust)',
      'Open or shorted wiring in wheel speed sensor harness',
      'Corroded sensor connector at wheel end',
      'Cracked or missing teeth on ABS tone ring (pressed onto hub)',
    ],
    repair: 'Inspect wheel speed sensor air gap (< 1.5 mm) and tone ring for missing or corroded teeth. Measure sensor resistance (900–2000 Ω for passive sensors). Check harness routing for chafing against caliper or suspension.',
    module: 'EBCM',
  },
  'C0036': { description: 'Left front wheel speed sensor circuit range/performance — erratic signal', module: 'EBCM' },
  'C0040': { description: 'Right front wheel speed sensor circuit fault', module: 'EBCM' },
  'C0041': { description: 'Right front wheel speed sensor circuit range/performance', module: 'EBCM' },
  'C0045': { description: 'Left rear wheel speed sensor circuit fault', module: 'EBCM' },
  'C0046': { description: 'Left rear wheel speed sensor circuit range/performance', module: 'EBCM' },
  'C0050': { description: 'Right rear wheel speed sensor circuit fault', module: 'EBCM' },
  'C0051': { description: 'Right rear wheel speed sensor circuit range/performance', module: 'EBCM' },
  'C0060': { description: 'Left front ABS inlet solenoid circuit fault', module: 'EBCM' },
  'C0065': { description: 'Left front ABS outlet solenoid circuit fault', module: 'EBCM' },
  'C0070': { description: 'Right front ABS inlet solenoid circuit fault', module: 'EBCM' },
  'C0075': { description: 'Right front ABS outlet solenoid circuit fault', module: 'EBCM' },
  'C0080': { description: 'Left rear ABS inlet solenoid circuit fault', module: 'EBCM' },
  'C0085': { description: 'Left rear ABS outlet solenoid circuit fault', module: 'EBCM' },
  'C0090': { description: 'Right rear ABS inlet solenoid circuit fault', module: 'EBCM' },
  'C0095': { description: 'Right rear ABS outlet solenoid circuit fault', module: 'EBCM' },
  'C0110': {
    description: 'ABS pump motor circuit malfunction — hydraulic pump not responding',
    causes: ['Failed ABS pump motor inside BPMV assembly', 'Pump motor relay fault', 'Open wiring to pump motor'],
    repair: 'Listen for pump motor self-test on start-up. Test pump relay. Measure motor resistance. Pump motor failure requires replacement of BPMV (Brake Pressure Modulator Valve) assembly.',
    module: 'EBCM',
  },
  'C0121': { description: 'ABS valve relay circuit malfunction — solenoid relay fault in EBCM', module: 'EBCM' },
  'C0131': { description: 'ABS/TCS system pressure circuit malfunction', module: 'EBCM' },
  'C0141': { description: 'Left front TCS (traction control) solenoid 1 circuit fault', module: 'EBCM' },
  'C0146': { description: 'Left front TCS solenoid 2 circuit fault', module: 'EBCM' },
  'C0151': { description: 'Right front TCS solenoid 1 circuit fault', module: 'EBCM' },
  'C0156': { description: 'Right front TCS solenoid 2 circuit fault', module: 'EBCM' },
  'C0161': {
    description: 'ABS/TCS brake switch circuit malfunction — EBCM not seeing brake switch input',
    causes: ['Failed or misadjusted brake lamp switch', 'Open wiring from brake switch to EBCM', 'EBCM brake switch circuit fault'],
    repair: 'Verify brake lights illuminate. Measure voltage at EBCM brake input — should see 12V when pedal pressed. Adjust or replace brake lamp switch.',
    module: 'EBCM',
  },
  'C0175': { description: 'Engine coolant temperature circuit — EBCM ECT input for TCS warm-up logic', module: 'EBCM' },
  'C0176': { description: 'Vehicle Stability Enhancement System (VSES) — sensor plausibility fault', module: 'EBCM' },
  'C0186': {
    description: 'Lateral accelerometer circuit fault — EBCM internal lateral g-sensor',
    causes: ['EBCM internal lateral accelerometer failure', 'EBCM power or ground issue preventing sensor initialization'],
    repair: 'Verify EBCM power and grounds first. If lateral g-sensor fault persists, EBCM must be replaced.',
    module: 'EBCM',
  },
  'C0187': { description: 'Lateral accelerometer circuit range/performance', module: 'EBCM' },
  'C0196': { description: 'Yaw rate sensor circuit fault — EBCM internal yaw sensor', module: 'EBCM' },
  'C0197': { description: 'Yaw rate sensor range/performance fault', module: 'EBCM' },
  'C0226': { description: 'EBCM ROM failure — internal memory fault', module: 'EBCM' },
  'C0244': { description: 'PWM delivered torque fault — EBCM not receiving torque signal from PCM for TCS', module: 'EBCM' },
  'C0245': {
    description: 'Wheel speed sensor frequency error — signal outside expected frequency range',
    causes: ['Damaged tone ring with irregular tooth spacing', 'Metallic debris on tone ring from worn bearing'],
    repair: 'Inspect tone ring for bent, missing, or corroded teeth. Check wheel bearing for play or roughness that could wobble the ring.',
    module: 'EBCM',
  },
  'C0265': {
    description: 'EBCM relay circuit malfunction — internal solenoid relay fault',
    causes: ['EBCM internal relay failure', 'ABS fuse blown (typically 40 A in UHFRC)', 'Voltage drop on EBCM supply circuit'],
    repair: 'Verify ABS fuse. Measure EBCM supply voltage — must be > 10 V. If fuse and voltage are good, the EBCM relay circuit has failed internally — replace EBCM.',
    module: 'EBCM',
  },
  'C0266': { description: 'EBCM relay circuit fault — alternate relay fault code', module: 'EBCM' },
  'C0267': { description: 'Pump motor circuit open or shorted to ground', module: 'EBCM' },
  'C0268': { description: 'Pump motor circuit shorted to voltage', module: 'EBCM' },
  'C0269': { description: 'Excessive dump/isolation time — left front channel', module: 'EBCM' },
  'C0271': { description: 'EBCM fault — general internal EBCM hardware fault', module: 'EBCM' },
  'C0274': { description: 'Excessive dump/isolation time during ABS event', module: 'EBCM' },
  'C0281': { description: 'Brake switch circuit fault — TCS torque reduction input', module: 'EBCM' },
  'C0283': { description: 'TCS torque reduction request circuit fault — PCM not responding to EBCM request', module: 'EBCM' },
  'C0286': { description: 'ABS indicator lamp circuit shorted to battery', module: 'EBCM' },
  'C0287': { description: 'ABS indicator lamp circuit shorted to ground', module: 'EBCM' },
  'C0290': { description: 'Lost communication with PCM — from EBCM perspective on Class II bus', module: 'EBCM' },
  'C0291': { description: 'Lost communication with BCM — from EBCM perspective', module: 'EBCM' },
  'C0292': { description: 'Lost communication with IPC — from EBCM perspective', module: 'EBCM' },
  'C0297': { description: 'Powertrain control module input missing — EBCM not receiving PCM data', module: 'EBCM' },
  'C0298': { description: 'Powertrain torque request fault — EBCM TCS request not honored by PCM', module: 'EBCM' },

  // ─── Transfer Case / 4WD (4WD GMT800 models) ─────────────────────────────

  'C0300': { description: 'Rear propshaft speed sensor circuit fault — TCCM input (4WD models)', module: 'TCCM' },
  'C0305': { description: 'Front axle speed sensor circuit fault (4WD models)', module: 'TCCM' },
  'C0306': { description: 'Transfer case shift motor relay circuit fault', module: 'TCCM' },
  'C0307': { description: 'Transfer case shift motor relay circuit range/performance', module: 'TCCM' },
  'C0315': { description: 'AWD/4WD shift motor relay circuit fault', module: 'TCCM' },
  'C0321': { description: 'Transfer case mode switch circuit fault (4Hi/4Lo selector)', module: 'TCCM' },
  'C0322': { description: 'Transfer case position switch circuit fault — shift motor position feedback', module: 'TCCM' },
  'C0327': {
    description: 'Transfer case encoder circuit fault — encoder not reporting position',
    causes: ['Failed transfer case encoder motor/position sensor (NVG 246/NP246 encoder)', 'Open wiring in encoder circuit'],
    repair: 'Access transfer case encoder motor at rear of TCCM motor on transfer case. Measure encoder resistance. Replace encoder motor assembly if internal.',
    module: 'TCCM',
  },
  'C0369': { description: 'Transfer case encoder voltage reference fault', module: 'TCCM' },
  'C0374': {
    description: 'Transfer case general failure — TCCM cannot isolate to a specific circuit',
    causes: ['Transfer case mechanical failure preventing shift', 'Low fluid in transfer case', 'Encoder motor seized'],
    repair: 'Check transfer case fluid level and condition. Attempt shift to all positions. If mechanical engagement is confirmed lost, inspect encoder motor and shift fork.',
    module: 'TCCM',
  },
  'C0376': { description: 'Transfer case unable to transition — requested mode cannot be achieved', module: 'TCCM' },
  'C0379': { description: 'Front axle actuator system fault (IFS front axle engagement)', module: 'TCCM' },
  'C0550': { description: 'EBCM ECU performance — internal processor fault', module: 'EBCM' },
  'C0560': { description: 'EBCM system voltage malfunction — supply voltage outside range', module: 'EBCM' },
  'C0710': { description: 'Steering position signal fault — EBCM steering angle sensor input (VSES-equipped)', module: 'EBCM' },

  // ─── C1xxx — GM Manufacturer-Specific Chassis ────────────────────────────

  'C1233': { description: 'Left front wheel speed sensor circuit open', module: 'EBCM' },
  'C1234': { description: 'Right front wheel speed sensor circuit open', module: 'EBCM' },
  'C1235': { description: 'Right rear wheel speed sensor circuit open', module: 'EBCM' },
  'C1236': { description: 'Right rear wheel speed sensor circuit low', module: 'EBCM' },
  'C1237': { description: 'Left rear wheel speed sensor circuit open', module: 'EBCM' },
  'C1238': { description: 'Right rear wheel speed sensor circuit open — alternate code', module: 'EBCM' },
  'C1283': {
    description: 'VSES steering angle sensor fault — out of range or not calibrated',
    causes: ['Steering angle sensor not calibrated after alignment', 'Failed steering angle sensor in clock spring or column'],
    repair: 'Perform steering angle sensor calibration with a scanner (drive straight line calibration). Replace sensor if calibration fails.',
    module: 'EBCM',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // U0xxx — SAE J2012 Generic Network / Communication
  // ═══════════════════════════════════════════════════════════════════════════

  'U0001': { description: 'High speed CAN communication bus fault — bus off condition detected', module: 'Network' },
  'U0073': { description: 'Control module communication bus off — module dropped off bus', module: 'Network' },
  'U0100': {
    description: 'Lost communication with ECM/PCM — module at 0x10 not responding on Class II bus',
    causes: [
      'BCM or IPC preventing Class II bus from sleeping (common GMT800 parasitic draw cause)',
      'Faulty firewall-to-engine ground strap disrupting PCM communication',
      'PCM supply voltage fault',
      'Wiring fault on Class II bus (DLC pin 2)',
    ],
    repair: 'Measure bus voltage at DLC pin 2 — should be ~7 V idle. Inspect firewall ground strap and engine block grounds (target < 0.1 Ω). Diagnose any bus-active-with-key-off condition before blaming the PCM.',
    module: 'Network',
  },
  'U0101': { description: 'Lost communication with TCM — transmission module at 0x60 not responding', module: 'Network' },
  'U0102': { description: 'Lost communication with Transfer Case Control Module', module: 'Network' },
  'U0121': {
    description: 'Lost communication with ABS Control Module (EBCM at 0x40)',
    causes: ['EBCM fuse blown', 'EBCM internal failure', 'Wiring fault on Class II bus to EBCM'],
    repair: 'Check ABS fuse. Verify EBCM power and ground. Attempt EBCM communication with scanner.',
    module: 'Network',
  },
  'U0131': { description: 'Lost communication with Power Steering Control Module', module: 'Network' },
  'U0140': {
    description: 'Lost communication with Body Control Module (BCM at 0x28)',
    causes: ['BCM power or ground fault', 'BCM internal failure', 'Class II bus wiring fault between BCM and DLC'],
    repair: 'Verify BCM fuses (TBC BATT and BODY CTRL fuses in IPFB). Inspect BCM ground. Attempt BCM communication with scanner.',
    module: 'Network',
  },
  'U0141': { description: 'Lost communication with BCM Bus A — BCM not responding on primary bus segment', module: 'Network' },
  'U0155': {
    description: 'Lost communication with Instrument Panel Cluster (IPC at 0xE0)',
    causes: ['IPC power or ground fault', 'IPC internal failure', 'Class II bus wiring fault between IPC and DLC'],
    repair: 'Verify IPC fuses (IPC B+ in IPFB). Inspect IPC connector C2 for poor ground. Use scanner to test IPC bus communication.',
    module: 'Network',
  },
  'U0167': { description: 'Lost communication with Vehicle Immobilizer Control Module (Passlock)', module: 'Network' },
  'U0168': { description: 'Lost communication with Vehicle Security Control Module', module: 'Network' },
  'U0184': { description: 'Lost communication with Radio Control Module at 0xC0', module: 'Network' },
  'U0190': { description: 'Lost communication with Lighting Control Module', module: 'Network' },
  'U0193': { description: 'Lost communication with Driver Seat Control Module', module: 'Network' },
  'U0199': { description: 'Lost communication with Door Control Module A', module: 'Network' },

  // ═══════════════════════════════════════════════════════════════════════════
  // U1xxx / U2xxx — GM Manufacturer-Specific Network (Class II VPW)
  // ═══════════════════════════════════════════════════════════════════════════

  'U1000': {
    description: 'Class II serial data communication fault — general bus error on GM VPW (J1850) bus',
    causes: [
      'Module holding Class II bus voltage above normal idle voltage (bus conflict)',
      'Short to ground or voltage on DLC pin 2 (Class II bus wire)',
      'Faulty module transmitting corrupted data',
      'BCM or IPC parasitic draw preventing bus sleep',
    ],
    repair: 'Check Class II bus voltage at DLC pin 2 — normal is ~7 V with key off. Unplug modules one at a time to find the one disrupting the bus. Common culprits: BCM (0x28), IPC (0xE0).',
    module: 'Network',
  },
  'U1016': {
    description: 'Loss of communication with PCM on Class II bus — reported by IPC or BCM',
    causes: ['PCM not transmitting on Class II bus (0x10 address absent)', 'PCM supply voltage too low to operate', 'PCM ground fault'],
    repair: 'Confirm PCM is powered. Check PCM grounds at engine block. Verify CKP sensor signal — PCM cannot communicate without RPM input on a running engine.',
    module: 'Network',
  },
  'U1040': { description: 'Loss of communication with EBCM on Class II bus — set by IPC/BCM/PCM', module: 'Network' },
  'U1041': { description: 'Loss of communication with EBCM — alternate module detection', module: 'Network' },
  'U1064': {
    description: 'Loss of communication with BCM on Class II bus — set by IPC or PCM',
    causes: ['BCM not transmitting on bus (0x28 address absent)', 'BCM fuse blown (TBC BATT or BODY CTRL)', 'BCM internal failure'],
    repair: 'Pull TBC BATT fuse and BODY CTRL fuse — verify BCM has power. Check BCM ground at left cowl area. Replace BCM if power, ground, and bus wiring are all confirmed good.',
    module: 'Network',
  },
  'U1096': {
    description: 'Loss of communication with IPC on Class II bus — set by BCM or PCM',
    causes: ['IPC not transmitting on bus (0xE0 address absent)', 'IPC fuse blown (IPC B+ in IPFB)', 'IPC internal failure', 'Ground fault at IPC connector C2'],
    repair: 'Verify IPC B+ fuse. Check IPC connector C2 ground integrity. Test Class II bus voltage with IPC disconnected — if bus clears, IPC is the fault.',
    module: 'Network',
  },
  'U1152': { description: 'UART communication fault between BCM and external module (Class II enhanced)', module: 'Network' },
  'U1255': {
    description: 'Class II serial link fault — detected by multiple modules simultaneously',
    causes: [
      'Physical fault on the single-wire Class II bus (DLC pin 2)',
      'Short to ground or voltage on Class II wire',
    ],
    repair: 'Probe DLC pin 2 with DVOM — normal is pulsing ~7 V with key on. A steady 12 V means short to power; 0 V means short to ground. Trace Class II wire through firewall to find the short.',
    module: 'Network',
  },
  'U1262': { description: 'Serial data communication malfunction — non-specific bus communication fault', module: 'Network' },
  'U1300': {
    description: 'Class II serial data link — short to ground',
    causes: ['Class II bus wire (DLC pin 2) shorted to chassis ground', 'Failed module pulling bus to ground'],
    repair: 'Unplug all Class II modules one at a time while monitoring DLC pin 2 voltage. When bus voltage rises above 0 V after a module is unplugged, that module is shorting the bus.',
    module: 'Network',
  },
  'U1301': {
    description: 'Class II serial data link — short to battery voltage',
    causes: ['Class II bus wire shorted to 12 V supply', 'Failed module with internal short driving bus high'],
    repair: 'DLC pin 2 should never reach battery voltage — it idles at ~7 V. Unplug modules one at a time to find the offending module driving voltage high.',
    module: 'Network',
  },
  'U2003': { description: 'Loss of communication with audio/radio system', module: 'Network' },
  'U2100': { description: 'Initial configuration not complete — module requires programming after replacement', module: 'Network' },
  'U2104': { description: 'CAN bus reset counter overrun — bus resets exceeding allowable limit', module: 'Network' },
  'U2106': { description: 'CAN bus not responding — no response on high-speed CAN segment', module: 'Network' },
  'U2108': { description: 'Loss of CAN communication — CAN segment offline', module: 'Network' },
  'U2111': { description: 'Traction Control System configuration fault — TCS option mismatch between PCM and EBCM', module: 'Network' },

};

export const DTC_CATALOG_SIZE = Object.keys(DTC_CATALOG).length;
