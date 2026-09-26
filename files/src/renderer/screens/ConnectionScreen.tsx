import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore, VehicleProfile, vehicleDisplayName } from '../store/appStore';
import {
  Card, SectionHeader, Badge, AlertBanner, ScrollPane, Button, DataRow, EmptyState, Grid, Metric,
} from '../components/layout/UIComponents';
import { TYPE, NUMERIC, WEIGHT, RADIUS, STATUS_TEXT } from '../theme/theme';
import type { Status } from '../theme/theme';
import { connectionTone, batteryStatus } from '../components/shell/shellLogic';

// ─── Port entry type (returned by main process serialport.list()) ─────────────

interface PortInfo {
  path: string;
  manufacturer: string;
  serialNumber: string;
  isOBD: boolean;
}

// ─── VehicleEditor — describe whatever vehicle is plugged in ─────────────────

function VehicleEditor(): React.ReactElement {
  const vehicle    = useAppStore(s => s.vehicle);
  const setVehicle = useAppStore(s => s.setVehicle);
  const [editing, setEditing] = useState(() => vehicleDisplayName(vehicle) === 'No vehicle set');
  const [draft, setDraft] = useState<VehicleProfile>(vehicle);
  const [decoding, setDecoding] = useState(false);

  const decodeVIN = async () => {
    if (!draft.vin || draft.vin.length < 11) return;
    setDecoding(true);
    try {
      const result = await window.electronAPI.decodeVIN(draft.vin);
      if (result) {
        setDraft(d => ({
          ...d,
          year: d.year || result.year,
          make: d.make || result.make,
          model: d.model || result.model,
          engine: d.engine || result.engine,
        }));
      }
    } finally { setDecoding(false); }
  };

  const field = (key: keyof VehicleProfile, label: string, placeholder: string, flex = 1, numeric = false) => (
    <div style={{ flex, minWidth: 90 }}>
      <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>
        {label}
      </div>
      <input
        type="text"
        value={draft[key]}
        placeholder={placeholder}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        style={{ width: '100%', ...(numeric ? NUMERIC : {}) }}
      />
    </div>
  );

  return (
    <>
      <SectionHeader>Vehicle</SectionHeader>
      <Card>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <i className="ti ti-car" style={{ fontSize: 22, color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...TYPE.headline, color: 'var(--label)' }}>
                {vehicleDisplayName(vehicle)}
              </div>
              <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginTop: 2 }}>
                {[vehicle.vin && `VIN ${vehicle.vin}`, vehicle.engine, vehicle.nickname, vehicle.notes].filter(Boolean).join(' · ') || 'No details yet'}
              </div>
            </div>
            <Button
              size="sm"
              icon="ti-pencil"
              onClick={() => { setDraft(vehicle); setEditing(true); }}
            >
              Edit
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {field('year',  'Year',  '2004', 0.6)}
              {field('make',  'Make',  'Chevrolet')}
              {field('model', 'Model', 'Silverado 1500', 1.4)}
              {field('engine','Engine','5.3L V8')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {field('vin',      'VIN (optional)',      '1GCEK19T04E…', 1.2, true)}
              <Button
                size="sm"
                icon={decoding ? 'ti-loader' : 'ti-search'}
                onClick={decodeVIN}
                disabled={!draft.vin || draft.vin.length < 11 || decoding}
              >
                {decoding ? 'Decoding…' : 'Auto-fill from VIN'}
              </Button>
              {field('nickname', 'Nickname (optional)', 'My daily')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {field('notes', 'Notes for the assistant (known issues, mission)', 'chasing a parasitic battery drain', 1)}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => { setVehicle(draft); setEditing(false); }}
              >
                Save vehicle
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// ─── ELM327 init reference (collapsible) ─────────────────────────────────────

function ELM327Reference(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const CMDS = [
    { cmd: 'ATZ',   desc: 'Reset adapter — clears all state' },
    { cmd: 'ATE0',  desc: 'Echo off' },
    { cmd: 'ATL0',  desc: 'Linefeed off' },
    { cmd: 'ATH0',  desc: 'Headers off' },
    { cmd: 'ATS0',  desc: 'Spaces off' },
    { cmd: 'ATSP0', desc: 'Auto protocol detection' },
    { cmd: 'ATAT1', desc: 'Adaptive timing — level 1' },
    { cmd: '010C',  desc: 'Protocol ping — locks the adapter onto the vehicle bus' },
    { cmd: 'ATDP',  desc: 'Read negotiated protocol — expect SAE J1850 VPW' },
    { cmd: 'STI',   desc: 'OBDLink firmware version (OBDLink-specific)' },
    { cmd: 'STDI',  desc: 'OBDLink device info (OBDLink-specific)' },
    { cmd: 'ATRV',  desc: 'Live battery voltage — first reading' },
  ];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--separator)' }} />
        <Button
          variant="plain"
          size="sm"
          icon={open ? 'ti-chevron-up' : 'ti-chevron-down'}
          onClick={() => setOpen(o => !o)}
        >
          ELM327 init reference
        </Button>
        <div style={{ flex: 1, height: 1, background: 'var(--separator)' }} />
      </div>
      {open && (
        <Card padding={0}>
          {CMDS.map(({ cmd, desc }) => (
            <DataRow key={cmd} pid={cmd} name={desc} value="" />
          ))}
        </Card>
      )}
    </>
  );
}

// ─── ConnectionScreen ─────────────────────────────────────────────────────────

export function ConnectionScreen(): React.ReactElement {
  const connectionStatus = useAppStore(s => s.connectionStatus);
  const protocol         = useAppStore(s => s.protocol);
  const adapterInfo      = useAppStore(s => s.adapterInfo);
  const btRSSI           = useAppStore(s => s.btRSSI);
  const btDistance        = useAppStore(s => s.btDistance);
  const batteryVoltage   = useAppStore(s => {
    const v = s.liveData['ATRV']?.value;
    return typeof v === 'number' ? v : 0;
  });

  const [ports,         setPorts]         = useState<PortInfo[]>([]);
  const [scanning,      setScanning]      = useState(false);
  const [selectedPort,  setSelectedPort]  = useState('');
  const [connecting,    setConnecting]    = useState(false);
  const [scanError,     setScanError]     = useState('');

  const isConnected   = connectionStatus === 'connected';
  const isBusy        = connectionStatus === 'connecting' || connectionStatus === 'initializing' || connecting;
  const effectivePort = selectedPort;

  // Derive a human-readable device name from the raw port path. macOS device
  // paths like /dev/tty.OBDLinkMX13659 → "OBDLink MX 13659" — split CamelCase
  // and group trailing digits so users see the adapter, not the file path.
  const friendlyPortName = (p: PortInfo): string => {
    if (p.manufacturer && p.manufacturer.trim()) return p.manufacturer.trim();
    const raw  = p.path.replace(/^\/dev\/(tty|cu)\./, '').replace(/[-_]/g, ' ');
    const split = raw
      .replace(/([a-z])([A-Z])/g, '$1 $2')   // OBDLinkMX → OBDLink MX
      .replace(/([A-Za-z])(\d)/g, '$1 $2')   // MX13659 → MX 13659
      .replace(/\s+/g, ' ')
      .trim();
    return split || p.path;
  };

  // ── Scan available serial ports ────────────────────────────────────────────

  const scanPorts = useCallback(async () => {
    if (!window.electronAPI?.listPorts) {
      setScanError('listPorts API not available — ensure the app is running in Electron');
      return;
    }
    setScanning(true);
    setScanError('');
    try {
      const result = await window.electronAPI.listPorts();
      // Main process returns { error: string } if serialport threw
      if (!Array.isArray(result)) {
        setScanError(`Port scan failed: ${(result as any).error ?? 'unknown error'}`);
        return;
      }
      const list: PortInfo[] = result;
      setPorts(list);
      // Auto-select first OBD port if found
      const obdPort = list.find(p => p.isOBD);
      if (obdPort && !selectedPort) setSelectedPort(obdPort.path);
    } catch (e) {
      setScanError(`Port scan error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScanning(false);
    }
  }, [selectedPort]);

  // Scan on mount
  useEffect(() => { scanPorts(); }, []);

  // ── Connect / Disconnect ───────────────────────────────────────────────────

  const handleConnect = async (port: string) => {
    if (!window.electronAPI || isBusy || !port) return;
    localStorage.setItem('lastPort', port);
    setConnecting(true);
    try {
      await window.electronAPI.connect(port);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.electronAPI) return;
    await window.electronAPI.disconnect();
  };

  // ── Status tone / label ────────────────────────────────────────────────────

  const tone = connectionTone(connectionStatus);

  const statusLabel = {
    disconnected: 'Disconnected',
    scanning:     'Scanning…',
    connecting:   'Connecting…',
    initializing: 'Initializing ELM327…',
    connected:    'Connected',
    error:        'Connection error',
  }[connectionStatus];

  const rssiTone = (r: number): Status => (r > -60 ? 'ok' : r > -80 ? 'warn' : 'crit');
  const battRaw = batteryVoltage > 0 ? batteryStatus(batteryVoltage) : 'none';
  const battTone: Status = battRaw === 'none' ? 'neutral' : battRaw;

  return (
    <ScrollPane>

      {/* ── Vehicle profile ───────────────────────────────────────────── */}
      <VehicleEditor />

      {/* ── Current connection status ─────────────────────────────────── */}
      <SectionHeader>Connection status</SectionHeader>
      {connectionStatus === 'error' && adapterInfo && (
        <AlertBanner message={adapterInfo} variant="warn" />
      )}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0' }}>
          {/* Status indicator */}
          <div
            className={isBusy ? 'pulse' : undefined}
            style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: isConnected ? 'var(--ok-tint)' : tone === 'crit' ? 'var(--crit-tint)' : tone === 'warn' ? 'var(--warn-tint)' : 'var(--fill)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i
              className={`ti ${isConnected ? 'ti-plug-connected' : isBusy ? 'ti-loader' : 'ti-plug'}`}
              style={{ fontSize: 20, color: STATUS_TEXT[tone] }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ ...TYPE.headline, color: STATUS_TEXT[tone] }}>
              {statusLabel}
            </div>
            {isConnected && protocol && (
              <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginTop: 4 }}>
                {protocol}
                {adapterInfo && ` · ${adapterInfo}`}
              </div>
            )}
            {isConnected && batteryVoltage > 0 && (
              <div style={{ ...TYPE.body, ...NUMERIC, color: 'var(--accent-text)', marginTop: 4 }}>
                Battery: {batteryVoltage.toFixed(2)} V
              </div>
            )}
          </div>

          {isConnected && (
            <Button variant="destructive" icon="ti-plug-x" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
        </div>
      </Card>

      {/* ── Adapter details ──────────────────────────────────────────── */}
      {isConnected && (
        <>
          <SectionHeader>Adapter details</SectionHeader>
          <Grid cols={3}>
            <Metric size="compact" label="Adapter" value={adapterInfo || '—'} />
            <Metric size="compact" label="Protocol" value={protocol || '—'} />
            <Metric
              size="compact"
              label="Battery at OBD"
              value={batteryVoltage > 0 ? `${batteryVoltage.toFixed(3)} V` : '—'}
              status={batteryVoltage > 0 ? battTone : 'neutral'}
            />
            <Metric
              size="compact"
              label="BT signal (RSSI)"
              value={btRSSI !== null ? `${btRSSI} dBm` : '—'}
              status={btRSSI !== null ? rssiTone(btRSSI) : 'neutral'}
            />
            <Metric
              size="compact"
              label="BT distance"
              value={btDistance !== null ? `~${btDistance} m` : '—'}
            />
            <Metric
              size="compact"
              label="Signal quality"
              value={btRSSI !== null ? (btRSSI > -60 ? 'Excellent' : btRSSI > -70 ? 'Good' : btRSSI > -80 ? 'Fair' : 'Weak') : '—'}
              status={btRSSI !== null ? rssiTone(btRSSI) : 'neutral'}
            />
          </Grid>
        </>
      )}

      {/* ── Bluetooth / Serial port scanner ──────────────────────────── */}
      {!isConnected && (
        <>
          <SectionHeader>Bluetooth adapter — OBDLink MX+</SectionHeader>

          {/* Step guide */}
          <Card>
            <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginBottom: 8 }}>
              Before scanning, pair the adapter in macOS:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {[
                'Plug the OBDLink MX+ into the vehicle OBD-II port under the dash (driver side)',
                'Turn the ignition key to ON — engine does not need to start',
                'Open System Settings → Bluetooth and pair "OBDLink MX+"',
                'Return here and click Scan Ports — the adapter appears as /dev/tty.OBDLink-… or /dev/tty.OBDII',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--accent-tint)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...TYPE.caption, ...NUMERIC, fontWeight: WEIGHT.semibold,
                    color: 'var(--accent-text)',
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ ...TYPE.body, color: 'var(--label-2)' }}>{step}</span>
                </div>
              ))}
            </div>

            {/* Scan button */}
            <Button
              icon={scanning ? 'ti-loader' : 'ti-refresh'}
              onClick={scanPorts}
              disabled={scanning}
            >
              {scanning ? 'Scanning…' : 'Scan Ports'}
            </Button>
          </Card>

          {/* Port list */}
          {scanError && <AlertBanner message={scanError} variant="warn" />}

          {(() => {
            // Only OBD adapters get into the picker. Non-OBD serial/Bluetooth
            // devices (headsets, speakers, paired phones) are filtered out — the
            // user can't connect to them anyway and they only invite mistakes.
            const visiblePorts = ports.filter(p => p.isOBD);
            if (visiblePorts.length === 0) return null;
            return (
              <Card padding={0}>
                <div style={{ padding: '8px 12px', background: 'var(--fill)' }}>
                  <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>
                    {visiblePorts.length} {visiblePorts.length === 1 ? 'adapter' : 'adapters'} found
                  </span>
                </div>
                {visiblePorts.map(port => (
                  <DataRow
                    key={port.path}
                    pid={port.path}
                    name={friendlyPortName(port)}
                    subtext={['Bluetooth · OBD-II adapter', port.serialNumber].filter(Boolean).join(' · ')}
                    value=""
                    badge={
                      <>
                        {selectedPort === port.path && <Badge label="Selected" variant="ok" />}
                        <Badge label="OBD adapter" variant="info" />
                      </>
                    }
                    onClick={() => setSelectedPort(port.path)}
                  />
                ))}
              </Card>
            );
          })()}

          {/* Empty state — split into "nothing at all" vs "no adapter among devices" */}
          {!scanning && !scanError && ports.filter(p => p.isOBD).length === 0 && (
            <Card>
              <EmptyState
                icon="ti-bluetooth-off"
                title="No adapter found"
                message={ports.length === 0
                  ? 'No devices found — pair the OBDLink adapter in macOS Bluetooth settings, then scan again.'
                  : 'No OBD adapter found. Pair the OBDLink in macOS Bluetooth settings and scan again.'}
              />
            </Card>
          )}

          {/* Connect button — primary action on the screen */}
          {(() => {
            const ready = !!effectivePort && !isBusy;
            const label = isBusy
              ? 'Connecting…'
              : effectivePort
                ? `Connect to ${friendlyPortName(ports.find(p => p.path === effectivePort) ?? { path: effectivePort, manufacturer: '', serialNumber: '', isOBD: false })}`
                : 'Select a device above';
            return (
              <Button
                variant="primary"
                size="md"
                icon={isBusy ? 'ti-loader' : 'ti-plug-connected'}
                disabled={!ready}
                onClick={() => handleConnect(effectivePort)}
                style={{ width: '100%', height: 40 }}
              >
                {label}
              </Button>
            );
          })()}

          {/* ── Built-in Emulator ─────────────────────────────────────── */}
          <SectionHeader>Built-in emulator</SectionHeader>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Icon */}
              <div style={{
                width: 44, height: 44, flexShrink: 0, borderRadius: RADIUS.card,
                background: 'var(--ok-tint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="ti ti-cpu" style={{ fontSize: 22, color: 'var(--ok-text)' }} />
              </div>

              {/* Description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYPE.headline, color: 'var(--label)', marginBottom: 4 }}>
                  2004 Silverado 1500 Z71 — J1850 VPW
                </div>
                <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginBottom: 8 }}>
                  Runs a full OBD-II session in-process — no adapter required. Sensor
                  values drift realistically, battery voltage decays over time, and the
                  session pre-loads three fault codes to exercise the DTC scanner.
                </div>

                {/* Spec chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <Badge label="B1982 · P0300 · U0100" variant="crit" />
                  <Badge label="12.89 V → 11.8 V drain" variant="warn" />
                  <Badge label="RPM · Temps · Trims · O₂" variant="info" />
                  <Badge label="IPC awake after engine-off" variant="ok" />
                </div>

                <Button
                  variant="primary"
                  icon={isBusy ? 'ti-loader' : 'ti-play'}
                  disabled={isBusy}
                  onClick={() => handleConnect('SIMULATOR')}
                >
                  {isBusy ? 'Connecting…' : 'Launch Emulator'}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ── ELM327 init sequence reference (collapsible) ─────────────── */}
      <ELM327Reference />

    </ScrollPane>
  );
}
