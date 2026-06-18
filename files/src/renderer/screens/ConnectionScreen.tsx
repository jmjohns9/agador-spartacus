import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore, VehicleProfile, vehicleDisplayName } from '../store/appStore';
import {
  Card, SectionHeader, Badge, AlertBanner, ScrollPane, Button,
} from '../components/layout/UIComponents';

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

  const field = (key: keyof VehicleProfile, label: string, placeholder: string, flex = 1) => (
    <div style={{ flex, minWidth: 90 }}>
      <div style={{
        fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
        letterSpacing: 1.2, textTransform: 'uppercase',
        color: 'var(--tm)', marginBottom: 3,
      }}>
        {label}
      </div>
      <input
        type="text"
        value={draft[key]}
        placeholder={placeholder}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        style={{
          width: '100%', padding: '6px 8px', fontSize: 12,
          background: 'var(--bg4)', border: '2px solid var(--br)', borderRadius: 0,
          color: 'var(--tw)', fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
          outline: 'none',
        }}
      />
    </div>
  );

  return (
    <>
      <SectionHeader>Vehicle</SectionHeader>
      <Card>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <i className="ti ti-car" style={{ fontSize: 22, color: 'var(--pp)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--tw)', letterSpacing: 0.5 }}>
                {vehicleDisplayName(vehicle)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {field('year',  'Year',  '2004', 0.6)}
              {field('make',  'Make',  'Chevrolet')}
              {field('model', 'Model', 'Silverado 1500', 1.4)}
              {field('engine','Engine','5.3L V8')}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {field('vin',      'VIN (optional)',      '1GCEK19T04E…', 1.2)}
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
            <div style={{ display: 'flex', gap: 10 }}>
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
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
          color: 'var(--tm)', fontSize: 10, fontFamily: "'Inter','Roboto',system-ui,sans-serif",
          fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase',
        }}
      >
        <div style={{ flex: 1, height: 1, background: 'var(--br)' }} />
        <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 10 }} />
        <span>ELM327 init reference</span>
        <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 10 }} />
        <div style={{ flex: 1, height: 1, background: 'var(--br)' }} />
      </button>
      {open && (
        <Card padding={0}>
          {CMDS.map(({ cmd, desc }, i) => (
            <div
              key={cmd}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '6px 12px', borderBottom: i < CMDS.length - 1 ? '1px solid var(--bg3)' : 'none',
              }}
            >
              <span style={{ fontFamily: "'JetBrains Mono','Roboto Mono',monospace", fontSize: 11, color: 'var(--pp)', width: 48, flexShrink: 0 }}>
                {cmd}
              </span>
              <span style={{ fontSize: 11, color: 'var(--tm)' }}>{desc}</span>
            </div>
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

  // ── Status color / label ──────────────────────────────────────────────────

  const statusColor = {
    disconnected: 'var(--tm)',
    scanning:     'var(--sa)',
    connecting:   'var(--sa)',
    initializing: 'var(--sa)',
    connected:    'var(--sg)',
    error:        'var(--sr)',
  }[connectionStatus];

  const statusLabel = {
    disconnected: 'Disconnected',
    scanning:     'Scanning…',
    connecting:   'Connecting…',
    initializing: 'Initializing ELM327…',
    connected:    'Connected',
    error:        'Connection error',
  }[connectionStatus];

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
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: isConnected ? 'rgba(0,230,118,0.08)' : 'var(--bg4)',
            border: `2px solid ${statusColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: isBusy ? 'blink 1.2s infinite' : 'none',
          }}>
            <i
              className={`ti ${isConnected ? 'ti-plug-connected' : isBusy ? 'ti-loader' : 'ti-plug'}`}
              style={{ fontSize: 20, color: statusColor }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontWeight: 700,
              fontSize: 15, color: statusColor, letterSpacing: 0.5,
            }}>
              {statusLabel}
            </div>
            {isConnected && protocol && (
              <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 3 }}>
                {protocol}
                {adapterInfo && ` · ${adapterInfo}`}
              </div>
            )}
            {isConnected && batteryVoltage > 0 && (
              <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 13, color: 'var(--pp)', marginTop: 4 }}>
                Battery: {batteryVoltage.toFixed(2)} V
              </div>
            )}
          </div>

          {isConnected && (
            <Button variant="danger" icon="ti-plug-x" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
        </div>
      </Card>

      {/* ── ELM327 Initialization guide ───────────────────────────────── */}
      {isConnected && (
        <>
          <SectionHeader>Adapter details</SectionHeader>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Adapter',        value: adapterInfo || 'OBDLink MX+' },
                { label: 'Protocol',       value: protocol    || '—' },
                { label: 'Battery at OBD', value: batteryVoltage > 0 ? `${batteryVoltage.toFixed(3)} V` : '—' },
                { label: 'BT Signal (RSSI)', value: btRSSI !== null ? `${btRSSI} dBm` : '—', color: btRSSI !== null ? (btRSSI > -60 ? 'var(--sg)' : btRSSI > -80 ? 'var(--sa)' : 'var(--sr)') : undefined },
                { label: 'BT Distance',     value: btDistance !== null ? `~${btDistance} m` : '—' },
                { label: 'Signal Quality',   value: btRSSI !== null ? (btRSSI > -60 ? 'Excellent' : btRSSI > -70 ? 'Good' : btRSSI > -80 ? 'Fair' : 'Weak') : '—', color: btRSSI !== null ? (btRSSI > -60 ? 'var(--sg)' : btRSSI > -70 ? 'var(--pp)' : btRSSI > -80 ? 'var(--sa)' : 'var(--sr)') : undefined },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{
                    fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                    letterSpacing: 1.2, textTransform: 'uppercase',
                    color: 'var(--tm)', marginBottom: 4,
                  }}>
                    {label}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 13, color: (color as string) ?? 'var(--tw)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ── Bluetooth / Serial port scanner ──────────────────────────── */}
      {!isConnected && (
        <>
          <SectionHeader>Bluetooth adapter — OBDLink MX+</SectionHeader>

          {/* Step guide */}
          <Card>
            <div style={{ fontSize: 11, color: 'var(--tm)', marginBottom: 10, lineHeight: 1.6 }}>
              Before scanning, pair the adapter in macOS:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {[
                'Plug the OBDLink MX+ into the vehicle OBD-II port under the dash (driver side)',
                'Turn the ignition key to ON — engine does not need to start',
                'Open System Settings → Bluetooth and pair "OBDLink MX+"',
                'Return here and click Scan Ports — the adapter appears as /dev/tty.OBDLink-… or /dev/tty.OBDII',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg4)', border: '2px solid var(--br)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 10,
                    color: 'var(--pp)', fontWeight: 700,
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.5 }}>{step}</span>
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
              <div style={{
                padding: '8px 12px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
              }}>
                <span style={{
                  fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                  letterSpacing: 1.2, textTransform: 'uppercase',
                  color: 'var(--tm)',
                }}>
                  {visiblePorts.length} {visiblePorts.length === 1 ? 'adapter' : 'adapters'} found
                </span>
              </div>

              {visiblePorts.map((port, i) => (
                <button
                  key={port.path}
                  onClick={() => setSelectedPort(port.path)}
                  aria-pressed={selectedPort === port.path}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    padding: '10px 12px', cursor: 'pointer',
                    borderBottom: i < visiblePorts.length - 1 ? '1px solid var(--bg3)' : 'none',
                    background: 'transparent',
                    border: selectedPort === port.path ? '2px solid var(--pp)' : '2px solid var(--br)',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Selection radio */}
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${selectedPort === port.path ? 'var(--pp)' : 'var(--br)'}`,
                    background: selectedPort === port.path ? 'var(--pp)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selectedPort === port.path && (
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#000' }} />
                    )}
                  </div>

                  <i
                    className={`ti ${port.isOBD ? 'ti-bluetooth-connected' : 'ti-usb'}`}
                    style={{ fontSize: 16, color: port.isOBD ? 'var(--pp)' : 'var(--tm)', flexShrink: 0 }}
                  />

                  <div style={{ flex: 1, minWidth: 0 }} title={port.path /* full path on hover for debugging */}>
                    <div style={{
                      fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 14,
                      color: 'var(--tw)', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', fontWeight: 700, letterSpacing: 0.3,
                    }}>
                      {friendlyPortName(port)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 2 }}>
                      {port.isOBD
                        ? 'Bluetooth · OBD-II adapter'
                        : port.path.startsWith('/dev/cu.') || port.path.startsWith('/dev/tty.')
                          ? (port.path.includes('Bluetooth') || port.path.toLowerCase().includes('bt') ? 'Bluetooth device' : 'Serial device')
                          : 'Connected device'}
                      {port.serialNumber && ` · ${port.serialNumber}`}
                    </div>
                  </div>

                  <Badge label="OBD adapter" variant="ok" />
                </button>
              ))}
            </Card>
            );
          })()}

          {/* Empty state — split into "nothing at all" vs "no adapter among devices" */}
          {!scanning && !scanError && ports.filter(p => p.isOBD).length === 0 && (
            <Card>
              <div style={{ padding: '14px 12px', textAlign: 'center', fontSize: 12, color: 'var(--tm)', lineHeight: 1.6 }}>
                <i className="ti ti-bluetooth-off" style={{ fontSize: 22, color: 'var(--tm)', display: 'block', marginBottom: 8 }} />
                {ports.length === 0
                  ? <>No devices found — pair the OBDLink adapter in macOS Bluetooth settings, then scan again.</>
                  : <>No OBD adapter found. Pair the OBDLink in macOS Bluetooth settings and scan again.</>}
              </div>
            </Card>
          )}

          {/* Connect button — primary action on the screen */}
          {(() => {
            const ready = !!effectivePort && !isBusy;
            return (
              <button
                onClick={() => handleConnect(effectivePort)}
                disabled={!effectivePort || isBusy}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  width: '100%', padding: '16px', cursor: ready ? 'pointer' : 'not-allowed',
                  background: ready ? 'var(--pp)' : 'var(--bg4)',
                  border: `1px solid ${ready ? 'var(--pp)' : 'var(--br)'}`,
                  borderRadius: 0,
                  color: ready ? '#0B0B0B' : 'var(--tm)',
                  fontSize: 15, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontWeight: 700,
                  letterSpacing: 0.8, textTransform: 'uppercase',

                  transition: 'transform 0.08s, box-shadow 0.12s, background 0.12s',
                }}
                onMouseEnter={e => { if (ready) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
              >
                <i className={`ti ${isBusy ? 'ti-loader' : 'ti-plug-connected'}`} style={{ fontSize: 20, animation: isBusy ? 'spin 1s linear infinite' : 'none' }} />
                {isBusy
                  ? 'Connecting…'
                  : effectivePort
                    ? `Connect to ${friendlyPortName(ports.find(p => p.path === effectivePort) ?? { path: effectivePort, manufacturer: '', serialNumber: '', isOBD: false })}`
                    : 'Select a device above'}
              </button>
            );
          })()}

          {/* ── Built-in Emulator ─────────────────────────────────────── */}
          <SectionHeader>Built-in Emulator</SectionHeader>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              {/* Icon */}
              <div style={{
                width: 44, height: 44, flexShrink: 0,
                background: 'rgba(63,185,80,0.08)',
                border: '1px solid rgba(63,185,80,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className="ti ti-cpu" style={{ fontSize: 22, color: 'var(--gb)' }} />
              </div>

              {/* Description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  fontWeight: 700, fontSize: 14, color: 'var(--tw)', marginBottom: 4,
                }}>
                  2004 Silverado 1500 Z71 — J1850 VPW
                </div>
                <div style={{ fontSize: 11, color: 'var(--tm)', lineHeight: 1.6, marginBottom: 10 }}>
                  Runs a full OBD-II session in-process — no adapter required. Sensor
                  values drift realistically, battery voltage decays over time, and the
                  session pre-loads three fault codes to exercise the DTC scanner.
                </div>

                {/* Spec chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {[
                    { icon: 'ti-alert-triangle', label: 'B1982 · P0300 · U0100', color: 'var(--sr)', bg: 'rgba(248,81,73,0.08)' },
                    { icon: 'ti-battery-2',      label: '12.89 V → 11.8 V drain', color: 'var(--sa)', bg: 'rgba(210,153,34,0.08)' },
                    { icon: 'ti-engine',          label: 'RPM · Temps · Trims · O₂', color: 'var(--pp)', bg: 'rgba(33,136,255,0.08)' },
                    { icon: 'ti-clock',           label: 'IPC awake after engine-off', color: 'var(--gb)', bg: 'rgba(63,185,80,0.08)' },
                  ].map(({ icon, label, color, bg }) => (
                    <div key={label} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px',
                      background: bg,
                      border: `1px solid ${color}30`,
                    }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 11, color }} />
                      <span style={{
                        fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
                        fontSize: 10, color,
                      }}>
                        {label}
                      </span>
                    </div>
                  ))}
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
