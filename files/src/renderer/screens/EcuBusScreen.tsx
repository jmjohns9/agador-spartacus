import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import {
  SectionHeader, Card, Badge, Button, SegmentedControl, DataRow, EmptyState, Metric, AlertBanner, Divider,
} from '../components/layout/UIComponents';
import { TYPE, NUMERIC, WEIGHT } from '../theme/theme';
import type {
  EcuBusSubTab, CANFrame, UDSService, CANSignal, LINFrame, DoIPEntity,
} from '../../shared/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const SUB_TABS: { id: EcuBusSubTab; icon: string; label: string }[] = [
  { id: 'can',      icon: 'ti-route',          label: 'CAN Monitor' },
  { id: 'uds',      icon: 'ti-stethoscope',    label: 'UDS Client' },
  { id: 'transmit',  icon: 'ti-send',           label: 'Transmit' },
  { id: 'signals',  icon: 'ti-wave-sine',      label: 'Signals' },
  { id: 'script',   icon: 'ti-code',           label: 'Script' },
  { id: 'lin',      icon: 'ti-topology-bus',   label: 'LIN' },
  { id: 'doip',     icon: 'ti-network',        label: 'DoIP' },
];

// Read-only services only. The app never changes a control module, so reset,
// clear, security access, communication control, write, I/O control, routine
// control, download/transfer and DTC-setting services are not offered (and
// ELM327Commander refuses them if anything ever tried to send one).
const UDS_SERVICES: UDSService[] = [
  { sid: 0x10, name: 'DiagnosticSessionControl', shortName: 'DSC', description: 'Switch ECU diagnostic session',
    subFunctions: [{ id: 0x01, name: 'Default' }, { id: 0x03, name: 'Extended' }] },
  { sid: 0x19, name: 'ReadDTCInformation', shortName: 'RDTCI', description: 'Read DTC info from ECU',
    subFunctions: [{ id: 0x01, name: 'By status mask' }, { id: 0x02, name: 'By DTC mask' }, { id: 0x06, name: 'Extended record' }] },
  { sid: 0x22, name: 'ReadDataByIdentifier', shortName: 'RDBI', description: 'Read data from ECU by DID' },
  { sid: 0x23, name: 'ReadMemoryByAddress', shortName: 'RMBA', description: 'Read ECU memory at address' },
  { sid: 0x3E, name: 'TesterPresent', shortName: 'TP', description: 'Keep session alive',
    subFunctions: [{ id: 0x00, name: 'With response' }, { id: 0x80, name: 'Without response' }] },
];

const NRC_CODES: Record<number, string> = {
  0x10: 'generalReject', 0x11: 'serviceNotSupported', 0x12: 'subFunctionNotSupported',
  0x13: 'incorrectMessageLengthOrInvalidFormat', 0x14: 'responseTooLong',
  0x21: 'busyRepeatRequest', 0x22: 'conditionsNotCorrect',
  0x24: 'requestSequenceError', 0x25: 'noResponseFromSubnetComponent',
  0x26: 'failurePreventsExecutionOfRequestedAction',
  0x31: 'requestOutOfRange', 0x33: 'securityAccessDenied',
  0x35: 'invalidKey', 0x36: 'exceededNumberOfAttempts',
  0x37: 'requiredTimeDelayNotExpired', 0x70: 'uploadDownloadNotAccepted',
  0x71: 'transferDataSuspended', 0x72: 'generalProgrammingFailure',
  0x73: 'wrongBlockSequenceCounter', 0x78: 'requestCorrectlyReceivedResponsePending',
  0x7E: 'subFunctionNotSupportedInActiveSession',
  0x7F: 'serviceNotSupportedInActiveSession',
};

const COMMON_DIDS: { did: string; name: string }[] = [
  { did: 'F186', name: 'Active diagnostic session' },
  { did: 'F187', name: 'Vehicle manufacturer spare part number' },
  { did: 'F188', name: 'Vehicle manufacturer ECU software number' },
  { did: 'F189', name: 'Vehicle manufacturer ECU software version' },
  { did: 'F18A', name: 'System supplier identifier' },
  { did: 'F18B', name: 'ECU manufacturing date' },
  { did: 'F18C', name: 'ECU serial number' },
  { did: 'F190', name: 'VIN (Vehicle Identification Number)' },
  { did: 'F191', name: 'Vehicle manufacturer ECU hardware number' },
  { did: 'F192', name: 'System supplier ECU hardware number' },
  { did: 'F193', name: 'System supplier ECU hardware version' },
  { did: 'F194', name: 'System supplier ECU software number' },
  { did: 'F195', name: 'System supplier ECU software version' },
  { did: 'F197', name: 'System name or engine type' },
  { did: 'F1A0', name: 'Repair shop code or serial number' },
];

const HARDWARE_ADAPTERS = [
  { name: 'PEAK PCAN-USB', protocols: ['CAN', 'CAN-FD'], status: 'supported' as const },
  { name: 'KVASER Leaf Light', protocols: ['CAN', 'CAN-FD', 'LIN'], status: 'supported' as const },
  { name: 'Vector VN1610', protocols: ['CAN', 'CAN-FD', 'LIN'], status: 'supported' as const },
  { name: 'ZLG USBCAN-II', protocols: ['CAN', 'CAN-FD'], status: 'supported' as const },
  { name: 'SLCAN (serial)', protocols: ['CAN'], status: 'supported' as const },
  { name: 'Canable / GS_USB', protocols: ['CAN', 'CAN-FD'], status: 'supported' as const },
  { name: 'Toomotss PCAN', protocols: ['CAN', 'CAN-FD', 'LIN'], status: 'supported' as const },
  { name: 'EcuBus LinCable', protocols: ['LIN', 'PWM'], status: 'supported' as const },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexByte(b: number): string { return b.toString(16).toUpperCase().padStart(2, '0'); }
function hexWord(w: number): string { return w.toString(16).toUpperCase().padStart(4, '0'); }
function hexId(id: number, ext: boolean): string {
  return ext ? `0x${id.toString(16).toUpperCase().padStart(8, '0')}` : `0x${id.toString(16).toUpperCase().padStart(3, '0')}`;
}
function timestamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

// ─── Shared frame-table cell styles ─────────────────────────────────────────
// One hairline divider per cell — the brief's allowed exception for a data
// table too dense for <DataRow>. Defined once so no other line needs the
// style-ok escape hatch. Table cells only: non-table separators use <Divider />.
const CELL_DIVIDER: React.CSSProperties = { borderBottom: '1px solid var(--separator)' }; // style-ok: table cell divider
const TH_STYLE: React.CSSProperties = { ...TYPE.caption, ...CELL_DIVIDER, textAlign: 'left', color: 'var(--label-3)', padding: '8px 12px', fontWeight: WEIGHT.regular, whiteSpace: 'nowrap' };
const TD_STYLE: React.CSSProperties = { ...TYPE.caption, ...CELL_DIVIDER, padding: '8px 12px', verticalAlign: 'middle', color: 'var(--label)', whiteSpace: 'nowrap' };
/** A panel's title bar: label (+ optional actions). Pair with <Divider /> below it. */
const PANEL_HEADER: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' };
/** A plain caption-sized panel label, no table divider. Pair with <Divider /> below it. */
const PANEL_LABEL: React.CSSProperties = { ...TYPE.caption, color: 'var(--label-3)', padding: '8px 12px' };

// ─── Demo data generators ────────────────────────────────────────────────────

function makeDemoCANFrames(): CANFrame[] {
  const now = Date.now();
  const ids = [0x7E0, 0x7E8, 0x100, 0x200, 0x300, 0x400, 0x410, 0x500, 0x620, 0x18DAF110];
  return Array.from({ length: 50 }, (_, i) => {
    const id = ids[i % ids.length];
    const isExt = id > 0x7FF;
    const data = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
    return {
      id,
      idHex: hexId(id, isExt),
      dlc: 8,
      data,
      dataHex: data.map(hexByte).join(' '),
      timestamp: now - (50 - i) * 12,
      delta: 12 + Math.random() * 5,
      channel: 1,
      direction: i % 5 === 0 ? 'TX' as const : 'RX' as const,
      busType: 'CAN' as const,
      isExtended: isExt,
      count: Math.floor(Math.random() * 200) + 1,
    };
  });
}

function makeDemoSignals(): CANSignal[] {
  const now = Date.now();
  return [
    { name: 'EngineSpeed', messageId: 0x100, messageName: 'EngineData1', startBit: 0, length: 16, byteOrder: 'little_endian', factor: 0.25, offset: 0, min: 0, max: 8000, unit: 'rpm', value: 3241, rawValue: 12964, timestamp: now },
    { name: 'VehicleSpeed', messageId: 0x100, messageName: 'EngineData1', startBit: 16, length: 16, byteOrder: 'little_endian', factor: 0.01, offset: 0, min: 0, max: 300, unit: 'km/h', value: 62.5, rawValue: 6250, timestamp: now },
    { name: 'ThrottlePosition', messageId: 0x200, messageName: 'EngineData2', startBit: 0, length: 8, byteOrder: 'little_endian', factor: 0.39216, offset: 0, min: 0, max: 100, unit: '%', value: 24.3, rawValue: 62, timestamp: now },
    { name: 'CoolantTemp', messageId: 0x200, messageName: 'EngineData2', startBit: 8, length: 8, byteOrder: 'little_endian', factor: 1, offset: -40, min: -40, max: 215, unit: '°C', value: 92, rawValue: 132, timestamp: now },
    { name: 'IntakeAirTemp', messageId: 0x200, messageName: 'EngineData2', startBit: 16, length: 8, byteOrder: 'little_endian', factor: 1, offset: -40, min: -40, max: 215, unit: '°C', value: 34, rawValue: 74, timestamp: now },
    { name: 'MAP', messageId: 0x300, messageName: 'Pressure', startBit: 0, length: 8, byteOrder: 'little_endian', factor: 1, offset: 0, min: 0, max: 255, unit: 'kPa', value: 101, rawValue: 101, timestamp: now },
    { name: 'BatteryVoltage', messageId: 0x400, messageName: 'Electrical', startBit: 0, length: 16, byteOrder: 'little_endian', factor: 0.001, offset: 0, min: 0, max: 20, unit: 'V', value: 14.21, rawValue: 14210, timestamp: now },
    { name: 'FuelLevel', messageId: 0x410, messageName: 'BodyStatus', startBit: 0, length: 8, byteOrder: 'little_endian', factor: 0.39216, offset: 0, min: 0, max: 100, unit: '%', value: 67.8, rawValue: 173, timestamp: now },
  ];
}

function makeDemoLINFrames(): LINFrame[] {
  const now = Date.now();
  return [
    { id: 0x01, idHex: '0x01', dlc: 8, data: [0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00], dataHex: '00 00 FF FF 00 00 00 00', timestamp: now - 200, direction: 'master', checksum: 0xFE, checksumType: 'enhanced' },
    { id: 0x10, idHex: '0x10', dlc: 4, data: [0x40, 0x01, 0x82, 0x00], dataHex: '40 01 82 00', timestamp: now - 180, direction: 'slave', checksum: 0x3D, checksumType: 'enhanced' },
    { id: 0x20, idHex: '0x20', dlc: 8, data: [0xFE, 0x01, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF], dataHex: 'FE 01 00 00 00 00 FF FF', timestamp: now - 150, direction: 'slave', checksum: 0x01, checksumType: 'classic' },
    { id: 0x3C, idHex: '0x3C', dlc: 8, data: [0x01, 0x03, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF], dataHex: '01 03 FF FF FF FF FF FF', timestamp: now - 100, direction: 'master', checksum: 0xFC, checksumType: 'classic' },
    { id: 0x3D, idHex: '0x3D', dlc: 8, data: [0x01, 0x03, 0x01, 0x2E, 0x00, 0xFF, 0xFF, 0xFF], dataHex: '01 03 01 2E 00 FF FF FF', timestamp: now - 80, direction: 'slave', checksum: 0xA0, checksumType: 'classic' },
  ];
}

function makeDemoDoIPEntities(): DoIPEntity[] {
  return [
    { ip: '192.168.1.10', port: 13400, logicalAddress: 0x0001, eid: '00:1A:2B:3C:4D:5E', gid: '00:1A:2B:3C:4D:5F', vin: '1GCEK19T04E123456', entityType: 'gateway', status: 'online' },
    { ip: '192.168.1.20', port: 13400, logicalAddress: 0x0010, eid: '00:2A:3B:4C:5D:6E', gid: '00:2A:3B:4C:5D:6F', vin: '', entityType: 'node', status: 'online' },
    { ip: '192.168.1.30', port: 13400, logicalAddress: 0x0020, eid: '00:3A:4B:5C:6D:7E', gid: '00:3A:4B:5C:6D:7F', vin: '', entityType: 'node', status: 'offline' },
  ];
}

// ─── Sub-tab: CAN Monitor ────────────────────────────────────────────────────

function CANMonitorTab(): React.ReactElement {
  const ecubus = useAppStore(s => s.ecubus);
  const [frames] = useState<CANFrame[]>(() => makeDemoCANFrames());
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedFrame, setSelectedFrame] = useState<CANFrame | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const displayFrames = useMemo(() => {
    const src = ecubus.canFrames.length > 0 ? ecubus.canFrames : frames;
    if (!filter) return src;
    const f = filter.toLowerCase();
    return src.filter(fr =>
      fr.idHex.toLowerCase().includes(f) ||
      fr.dataHex.toLowerCase().includes(f) ||
      fr.direction.toLowerCase().includes(f)
    );
  }, [ecubus.canFrames, frames, filter]);

  const stats = useMemo(() => {
    const src = displayFrames;
    const uniqueIds = new Set(src.map(f => f.id)).size;
    const txCount = src.filter(f => f.direction === 'TX').length;
    const extCount = src.filter(f => f.isExtended).length;
    return { total: src.length, uniqueIds, txCount, rxCount: src.length - txCount, extCount };
  }, [displayFrames]);

  return (
    <>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        <Metric size="compact" label="Total frames" value={stats.total} />
        <Metric size="compact" label="Unique IDs" value={stats.uniqueIds} />
        <Metric size="compact" label="TX frames" value={stats.txCount} />
        <Metric size="compact" label="RX frames" value={stats.rxCount} />
        <Metric size="compact" label="Extended IDs" value={stats.extCount} />
      </div>

      {/* Toolbar */}
      <Card padding={8} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <Button size="sm" variant={paused ? 'destructive' : 'secondary'} icon={paused ? 'ti-player-play' : 'ti-player-pause'} onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="sm" icon="ti-trash" onClick={() => {}}>Clear</Button>
        <div style={{ flex: 1 }} />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by ID, data, direction…"
          style={{ width: 260, ...TYPE.caption, ...NUMERIC }}
        />
        <Badge label="CAN 2.0" variant="info" />
        <Badge label="500 kbit/s" variant="muted" />
      </Card>

      {/* Frame table */}
      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', marginTop: 12 }}>
        <div ref={tableRef} style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 116 }} /><col style={{ width: 64 }} /><col style={{ width: 104 }} />
              <col style={{ width: 56 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 68 }} /><col style={{ width: 56 }} />
            </colgroup>
            <thead>
              <tr>
                {['Time', 'Dir', 'ID', 'DLC', 'Data', 'Delta', 'Count', 'Bus'].map(h => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayFrames.map((frame, i) => (
                <tr
                  key={`${frame.timestamp}-${frame.id}-${i}`}
                  className="row-hover"
                  onClick={() => setSelectedFrame(frame)}
                  style={{
                    cursor: 'pointer',
                    background: selectedFrame === frame ? 'var(--accent-tint)' : 'transparent',
                  }}
                >
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{timestamp(frame.timestamp)}</td>
                  <td style={TD_STYLE}><Badge label={frame.direction} variant={frame.direction === 'TX' ? 'warn' : 'ok'} /></td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, fontWeight: WEIGHT.medium, color: frame.isExtended ? 'var(--teal)' : 'var(--accent-text)' }}>
                    {frame.idHex}
                  </td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{frame.dlc}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC }}>{frame.dataHex}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{frame.delta.toFixed(1)} ms</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{frame.count}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>CH{frame.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail panel */}
      {selectedFrame && (
        <Card style={{ marginTop: 12 }}>
          <SectionHeader>Frame detail — {selectedFrame.idHex}</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Arbitration ID</div>
              <div style={{ ...TYPE.headline, ...NUMERIC, color: 'var(--accent-text)' }}>{selectedFrame.idHex} ({selectedFrame.id})</div>
              <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginTop: 2 }}>
                {selectedFrame.isExtended ? '29-bit extended' : '11-bit standard'} · {selectedFrame.busType}
              </div>
            </div>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Data bytes</div>
              <div style={{ ...TYPE.headline, ...NUMERIC, color: 'var(--label)' }}>{selectedFrame.dataHex}</div>
              <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginTop: 2 }}>
                DLC: {selectedFrame.dlc} · {selectedFrame.data.map(b => String.fromCharCode(b >= 32 && b < 127 ? b : 46)).join('')}
              </div>
            </div>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Bit-level view</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {selectedFrame.data.map((b, bi) => (
                  <div key={bi} style={{ display: 'flex', gap: 1 }}>
                    {Array.from({ length: 8 }, (_, j) => (
                      <div key={j} style={{
                        width: 8, height: 12, borderRadius: 1,
                        background: (b >> (7 - j)) & 1 ? 'var(--accent)' : 'var(--fill)',
                      }} />
                    ))}
                    {bi < selectedFrame.data.length - 1 && <div style={{ width: 4 }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

// ─── Sub-tab: UDS Client ─────────────────────────────────────────────────────

function UDSClientTab(): React.ReactElement {
  const [selectedService, setSelectedService] = useState<UDSService>(UDS_SERVICES[4]); // RDBI
  const [txId, setTxId] = useState('7E0');
  const [rxId, setRxId] = useState('7E8');
  const [didInput, setDidInput] = useState('F190');
  const [subFunc, setSubFunc] = useState(0);
  const [payloadHex, setPayloadHex] = useState('');
  const [history, setHistory] = useState<{ ts: number; req: string; res: string; service: string }[]>([]);
  const [testerPresentActive, setTesterPresentActive] = useState(false);

  const handleSend = () => {
    const now = Date.now();
    let reqBytes = [selectedService.sid];
    if (selectedService.subFunctions && subFunc) reqBytes.push(subFunc);
    if (selectedService.sid === 0x22) {
      const d = parseInt(didInput, 16);
      reqBytes.push((d >> 8) & 0xFF, d & 0xFF);
    }
    if (payloadHex.trim()) {
      payloadHex.trim().split(/[\s,]+/).forEach(h => { const v = parseInt(h, 16); if (!isNaN(v)) reqBytes.push(v & 0xFF); });
    }
    const reqStr = reqBytes.map(hexByte).join(' ');

    // This tab is not connected to the adapter: record the request only.
    // It used to invent a positive reply (and a VIN), which read as if the
    // ECU had answered.
    setHistory(prev => [...prev, { ts: now, req: reqStr, res: 'Not sent (demo)', service: selectedService.shortName }]);
  };

  return (
    <>
      {/* Addressing */}
      <Card style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>TX ID (tester)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label-2)' }}>0x</span>
            <input value={txId} onChange={e => setTxId(e.target.value)} style={{ width: 60, ...NUMERIC }} />
          </div>
        </div>
        <i className="ti ti-arrow-right" style={{ fontSize: 16, color: 'var(--label-3)' }} />
        <div>
          <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>RX ID (ECU)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label-2)' }}>0x</span>
            <input value={rxId} onChange={e => setRxId(e.target.value)} style={{ width: 60, ...NUMERIC }} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge label="CAN-TP" variant="info" />
        <Badge label="ISO 15765-2" variant="muted" />
        <Button
          size="sm"
          variant={testerPresentActive ? 'primary' : 'secondary'}
          icon="ti-heartbeat"
          onClick={() => setTesterPresentActive(!testerPresentActive)}
        >
          {testerPresentActive ? 'TP active' : 'Tester present'}
        </Button>
      </Card>

      <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
        {/* Service list */}
        <Card padding={0} style={{ width: 260, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={PANEL_LABEL}>UDS services (ISO 14229)</div>
          <Divider />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {UDS_SERVICES.map((svc, i) => {
              const selected = selectedService.sid === svc.sid;
              return (
                <React.Fragment key={svc.sid}>
                  <div
                    className="row-hover"
                    onClick={() => { setSelectedService(svc); setSubFunc(svc.subFunctions?.[0]?.id ?? 0); }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      background: selected ? 'var(--accent-tint)' : 'transparent',
                      boxShadow: selected ? 'inset 3px 0 0 var(--accent)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--accent-text)' }}>0x{hexByte(svc.sid)}</span>
                      <Badge label={svc.shortName} variant="muted" />
                    </div>
                    <div style={{ ...TYPE.caption, color: 'var(--label)', marginTop: 2 }}>{svc.name}</div>
                  </div>
                  {i < UDS_SERVICES.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </div>
        </Card>

        {/* Service detail + send */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          <Card>
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...TYPE.headline, color: 'var(--label)' }}>
                <span style={{ ...NUMERIC, color: 'var(--accent-text)', marginRight: 6 }}>0x{hexByte(selectedService.sid)}</span>
                {selectedService.name}
              </div>
              <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginTop: 2 }}>{selectedService.description}</div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* Sub-function selector */}
              {selectedService.subFunctions && (
                <div>
                  <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Sub-function</div>
                  <select
                    value={subFunc}
                    onChange={e => setSubFunc(Number(e.target.value))}
                    style={{ ...NUMERIC, minWidth: 180 }}
                  >
                    {selectedService.subFunctions.map(sf => (
                      <option key={sf.id} value={sf.id}>0x{hexByte(sf.id)} — {sf.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* DID input for RDBI/WDBI */}
              {selectedService.sid === 0x22 && (
                <div>
                  <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>DID</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label-2)' }}>0x</span>
                    <input value={didInput} onChange={e => setDidInput(e.target.value)} placeholder="F190"
                      style={{ width: 60, ...NUMERIC }} />
                  </div>
                </div>
              )}

              {/* Additional payload */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Additional data (hex)</div>
                <input value={payloadHex} onChange={e => setPayloadHex(e.target.value)} placeholder="e.g. 01 02 03"
                  style={{ width: '100%', ...NUMERIC }} />
              </div>

              <Button variant="primary" icon="ti-send" onClick={handleSend}>Send</Button>
            </div>
          </Card>

          {/* Common DIDs quick-pick */}
          {(selectedService.sid === 0x22) && (
            <Card padding={0} style={{ maxHeight: 130, overflow: 'hidden' }}>
              <div style={PANEL_LABEL}>Common DIDs — click to populate</div>
              <Divider />
              <div style={{ overflowY: 'auto', maxHeight: 96, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {COMMON_DIDS.map(d => (
                  <Button
                    key={d.did}
                    size="sm"
                    variant={didInput === d.did ? 'primary' : 'secondary'}
                    title={d.name}
                    onClick={() => setDidInput(d.did)}
                  >
                    <span style={NUMERIC}>{d.did}</span>
                  </Button>
                ))}
              </div>
            </Card>
          )}

          {/* Response history */}
          <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {history.length === 0 ? (
              <EmptyState icon="ti-stethoscope" title="No UDS exchanges yet" message="Select a service and click Send." />
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: 116 }} /><col style={{ width: 84 }} /><col style={{ width: 72 }} /><col /><col />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Time', 'Service', 'Status', 'Request', 'Response'].map(h => (
                        <th key={h} style={TH_STYLE}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{timestamp(h.ts)}</td>
                        <td style={TD_STYLE}><Badge label={h.service} variant="info" /></td>
                        <td style={TD_STYLE}><Badge label="Demo" variant="muted" /></td>
                        <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.req}</td>
                        <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.res}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

// ─── Sub-tab: Transmit ───────────────────────────────────────────────────────

function TransmitTab(): React.ReactElement {
  const [frameId, setFrameId] = useState('7E0');
  const [dlc, setDlc] = useState(8);
  const [dataBytes, setDataBytes] = useState(['02', '01', '00', '00', '00', '00', '00', '00']);
  const [isCyclic, setIsCyclic] = useState(false);
  const [cycleMs, setCycleMs] = useState(100);
  const [isFD, setIsFD] = useState(false);
  const [sentLog, setSentLog] = useState<{ ts: number; id: string; data: string }[]>([]);

  const handleByteChange = (idx: number, val: string) => {
    const next = [...dataBytes];
    next[idx] = val.slice(0, 2).toUpperCase();
    setDataBytes(next);
  };

  const handleSend = () => {
    setSentLog(prev => [...prev.slice(-49), {
      ts: Date.now(),
      id: `0x${frameId}`,
      data: dataBytes.slice(0, dlc).join(' '),
    }]);
  };

  return (
    <>
      <Card>
        <SectionHeader>CAN frame transmitter</SectionHeader>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>CAN ID</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label-2)' }}>0x</span>
              <input value={frameId} onChange={e => setFrameId(e.target.value)} style={{ width: 70, ...NUMERIC }} />
            </div>
          </div>
          <div>
            <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>DLC</div>
            <select value={dlc} onChange={e => setDlc(Number(e.target.value))} style={{ width: 60, ...NUMERIC }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, ...(isFD ? [12, 16, 20, 24, 32, 48, 64] : [])].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, ...TYPE.body, color: 'var(--label)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isFD} onChange={e => setIsFD(e.target.checked)} />
              CAN-FD
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, ...TYPE.body, color: 'var(--label)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isCyclic} onChange={e => setIsCyclic(e.target.checked)} />
              Cyclic
            </label>
            {isCyclic && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input value={cycleMs} onChange={e => setCycleMs(Number(e.target.value))} type="number" style={{ width: 60, ...NUMERIC }} />
                <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Data byte grid */}
        <div style={{ marginTop: 12 }}>
          <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Data bytes</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {dataBytes.slice(0, dlc).map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ ...TYPE.caption, color: 'var(--label-3)' }}>B{i}</span>
                <input
                  value={b}
                  onChange={e => handleByteChange(i, e.target.value)}
                  maxLength={2}
                  style={{ width: 32, textAlign: 'center', ...NUMERIC, padding: 0 }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button variant="primary" icon="ti-send" onClick={handleSend}>
            {isCyclic ? 'Start cyclic TX' : 'Send frame'}
          </Button>
          <Button variant="secondary" icon="ti-eraser" onClick={() => setDataBytes(Array(8).fill('00'))}>Zero all</Button>
          <Button variant="secondary" icon="ti-maximize" onClick={() => setDataBytes(Array(8).fill('FF'))}>Fill FF</Button>
        </div>
      </Card>

      {/* Sent log */}
      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', marginTop: 12 }}>
        <div style={PANEL_LABEL}>TX log · {sentLog.length} frames sent</div>
        <Divider />
        {sentLog.length === 0 ? (
          <EmptyState icon="ti-send" title="No frames sent yet" />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sentLog.map((entry, i) => (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', gap: 12, padding: '8px 12px', alignItems: 'center' }}>
                  <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)', width: 70 }}>{timestamp(entry.ts)}</span>
                  <Badge label="TX" variant="warn" />
                  <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--accent-text)' }}>{entry.id}</span>
                  <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>{entry.data}</span>
                </div>
                {i < sentLog.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Sub-tab: Signals ────────────────────────────────────────────────────────

function SignalsTab(): React.ReactElement {
  const [signals] = useState<CANSignal[]>(() => makeDemoSignals());

  return (
    <>
      <SectionHeader>CAN signal decoder (DBC)</SectionHeader>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px' }}>
        <Button size="sm" variant="secondary" icon="ti-file-import">Load DBC</Button>
        <Button size="sm" variant="secondary" icon="ti-plus">Add signal</Button>
        <div style={{ flex: 1 }} />
        <Badge label="8 signals" variant="info" />
        <Badge label="4 messages" variant="muted" />
      </div>

      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 136 }} /><col style={{ width: 96 }} /><col style={{ width: 104 }} />
              <col style={{ width: 90 }} /><col style={{ width: 76 }} /><col style={{ width: 84 }} />
              <col style={{ width: 60 }} /><col style={{ width: 70 }} /><col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                {['Signal', 'Message ID', 'Message', 'Start bit', 'Length', 'Factor', 'Unit', 'Value', 'Raw'].map(h => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map(sig => (
                <tr key={sig.name} className="row-hover">
                  <td style={{ ...TD_STYLE, fontWeight: WEIGHT.medium }}>{sig.name}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--accent-text)' }}>0x{sig.messageId.toString(16).toUpperCase().padStart(3, '0')}</td>
                  <td style={{ ...TD_STYLE, color: 'var(--label-2)' }}>{sig.messageName}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{sig.startBit}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{sig.length} bit</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{sig.factor}</td>
                  <td style={{ ...TD_STYLE, color: 'var(--label-2)' }}>{sig.unit}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, fontWeight: WEIGHT.semibold, color: 'var(--label)' }}>{sig.value}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{sig.rawValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Signal bar chart visualization */}
      <Card style={{ marginTop: 12 }}>
        <SectionHeader>Signal bar graph</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {signals.map(sig => {
            const pct = ((sig.value - sig.min) / (sig.max - sig.min)) * 100;
            return (
              <div key={sig.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 110, ...TYPE.caption, color: 'var(--label)', textAlign: 'right' }}>{sig.name}</span>
                <div style={{ flex: 1, height: 14, background: 'var(--fill)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
                </div>
                <span style={{ width: 70, ...TYPE.caption, ...NUMERIC, color: 'var(--label)', textAlign: 'right' }}>
                  {sig.value} {sig.unit}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

// ─── Sub-tab: Script ─────────────────────────────────────────────────────────

function ScriptTab(): React.ReactElement {
  const scripts = useAppStore(s => s.ecubus.scripts);
  const updateScript = useAppStore(s => s.updateEcuBusScript);
  const [activeScript, setActiveScript] = useState(scripts[0]?.id ?? '');
  const script = scripts.find(s => s.id === activeScript) ?? scripts[0];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, margin: '0 0 12px' }}>
        <Button size="sm" variant="secondary" icon="ti-plus">New script</Button>
        <Button size="sm" variant="secondary" icon="ti-file-import">Import</Button>
        <div style={{ flex: 1 }} />
        <Badge label="TypeScript" variant="info" />
        <Badge label="CAPL-like API" variant="muted" />
      </div>

      <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
        {/* Editor */}
        <Card padding={0} style={{ flex: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={PANEL_HEADER}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-file-code" style={{ fontSize: 13, color: 'var(--accent-text)' }} />
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>
                {script?.name ?? 'untitled.ts'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="primary" icon="ti-player-play" onClick={() => updateScript(script.id, { status: 'running', output: [...script.output, `[${new Date().toLocaleTimeString()}] Script started...`, `[${new Date().toLocaleTimeString()}] VIN: 1GCEK19T04E123456`, `[${new Date().toLocaleTimeString()}] Script completed.`], lastRun: Date.now() })}>
                Run
              </Button>
              <Button size="sm" variant="secondary" icon="ti-player-stop" onClick={() => updateScript(script.id, { status: 'idle' })}>Stop</Button>
            </div>
          </div>
          <Divider />
          <textarea
            value={script?.code ?? ''}
            onChange={e => updateScript(script.id, { code: e.target.value })}
            spellCheck={false}
            style={{
              flex: 1, resize: 'none', borderWidth: 0, outline: 'none',
              background: 'transparent', color: 'var(--label)',
              ...TYPE.body, ...NUMERIC,
              lineHeight: 1.7, padding: '12px',
              tabSize: 2,
            }}
          />
        </Card>

        {/* Console output */}
        <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={PANEL_HEADER}>
            <span style={{ ...TYPE.caption, color: 'var(--label-3)' }}>Console output</span>
            <Badge label={script?.status ?? 'idle'} variant={script?.status === 'running' ? 'warn' : script?.status === 'error' ? 'crit' : script?.status === 'success' ? 'ok' : 'muted'} />
          </div>
          <Divider />
          <div style={{
            flex: 1, overflowY: 'auto', padding: 8,
            ...NUMERIC, ...TYPE.caption,
            color: 'var(--ok-text)', lineHeight: 1.8,
          }}>
            {(script?.output ?? []).length === 0 ? (
              <span style={{ color: 'var(--label-3)' }}>Run the script to see output here…</span>
            ) : (
              (script?.output ?? []).map((line, i) => (
                <div key={i}>{line}</div>
              ))
            )}
          </div>

          {/* API reference */}
          <Divider />
          <div style={{ padding: 8 }}>
            <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>
              API reference
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['CAN.send()', 'CAN.on()', 'UDS.readDID()', 'UDS.writeDID()', 'UDS.session()', 'UDS.reset()', 'LIN.send()', 'delay()', 'log()'].map(fn => (
                <Badge key={fn} label={fn} variant="muted" />
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

// ─── Sub-tab: LIN ────────────────────────────────────────────────────────────

function LINTab(): React.ReactElement {
  const [frames] = useState<LINFrame[]>(() => makeDemoLINFrames());

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <Metric size="compact" label="LIN frames" value={frames.length} />
        <Metric size="compact" label="Master frames" value={frames.filter(f => f.direction === 'master').length} />
        <Metric size="compact" label="Slave responses" value={frames.filter(f => f.direction === 'slave').length} />
        <Metric size="compact" label="Errors" value={frames.filter(f => f.error).length} status={frames.some(f => f.error) ? 'crit' : 'neutral'} />
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <Button size="sm" variant="secondary" icon="ti-file-import">Load LDF</Button>
        <Button size="sm" variant="secondary" icon="ti-file-export">Export LDF</Button>
        <Button size="sm" variant="secondary" icon="ti-test-pipe">Conformance test</Button>
        <div style={{ flex: 1 }} />
        <Badge label="LIN 2.1" variant="info" />
        <Badge label="19.2 kbit/s" variant="muted" />
      </div>

      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 116 }} /><col style={{ width: 64 }} /><col style={{ width: 56 }} />
              <col /><col style={{ width: 92 }} /><col style={{ width: 140 }} />
            </colgroup>
            <thead>
              <tr>
                {['Time', 'ID', 'DLC', 'Data', 'Direction', 'Checksum'].map(h => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {frames.map((frame, i) => (
                <tr key={i} className="row-hover">
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{timestamp(frame.timestamp)}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, fontWeight: WEIGHT.medium, color: 'var(--accent-text)' }}>{frame.idHex}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{frame.dlc}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC }}>{frame.dataHex}</td>
                  <td style={TD_STYLE}><Badge label={frame.direction} variant={frame.direction === 'master' ? 'warn' : 'ok'} /></td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>
                    0x{hexByte(frame.checksum)} ({frame.checksumType})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ─── Sub-tab: DoIP ───────────────────────────────────────────────────────────

function DoIPTab(): React.ReactElement {
  const [entities] = useState<DoIPEntity[]>(() => makeDemoDoIPEntities());
  const [selectedEntity, setSelectedEntity] = useState<DoIPEntity | null>(null);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <Metric size="compact" label="DoIP entities" value={entities.length} />
        <Metric size="compact" label="Online" value={entities.filter(e => e.status === 'online').length} />
        <Metric size="compact" label="Gateways" value={entities.filter(e => e.entityType === 'gateway').length} />
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <Button size="sm" variant="primary" icon="ti-radar">Vehicle discovery</Button>
        <div style={{ flex: 1 }} />
        <Badge label="ISO 13400" variant="info" />
        <Badge label="TCP/UDP" variant="muted" />
      </div>

      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 136 }} /><col style={{ width: 70 }} /><col style={{ width: 112 }} />
              <col /><col style={{ width: 96 }} /><col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr>
                {['IP address', 'Port', 'Logical addr', 'Entity ID', 'Type', 'Status'].map(h => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entities.map((entity, i) => (
                <tr
                  key={i}
                  className="row-hover"
                  onClick={() => setSelectedEntity(entity)}
                  style={{ cursor: 'pointer', background: selectedEntity === entity ? 'var(--accent-tint)' : 'transparent' }}
                >
                  <td style={{ ...TD_STYLE, ...NUMERIC }}>{entity.ip}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{entity.port}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--accent-text)' }}>0x{entity.logicalAddress.toString(16).toUpperCase().padStart(4, '0')}</td>
                  <td style={{ ...TD_STYLE, ...NUMERIC, color: 'var(--label-2)' }}>{entity.eid}</td>
                  <td style={TD_STYLE}><Badge label={entity.entityType} variant={entity.entityType === 'gateway' ? 'warn' : 'muted'} /></td>
                  <td style={TD_STYLE}><Badge label={entity.status} variant={entity.status === 'online' ? 'ok' : entity.status === 'busy' ? 'warn' : 'crit'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedEntity && (
        <Card style={{ marginTop: 12 }}>
          <SectionHeader>Entity detail — {selectedEntity.ip}</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Network</div>
              <div style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label)' }}>{selectedEntity.ip}:{selectedEntity.port}</div>
              <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginTop: 2 }}>Logical: 0x{selectedEntity.logicalAddress.toString(16).toUpperCase().padStart(4, '0')}</div>
            </div>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Identification</div>
              <div style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label)' }}>EID: {selectedEntity.eid}</div>
              <div style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)', marginTop: 2 }}>GID: {selectedEntity.gid}</div>
            </div>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 4 }}>Vehicle</div>
              <div style={{ ...TYPE.body, ...NUMERIC, color: selectedEntity.vin ? 'var(--label)' : 'var(--label-3)' }}>
                {selectedEntity.vin || '—'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Button size="sm" variant="primary" icon="ti-plug-connected">Connect</Button>
            <Button size="sm" variant="secondary" icon="ti-stethoscope">UDS via DoIP</Button>
          </div>
        </Card>
      )}
    </>
  );
}

// ─── Hardware adapters panel ─────────────────────────────────────────────────
// Not currently rendered anywhere in EcuBusScreen — see code-review-notes.md.

function HardwarePanel(): React.ReactElement {
  return (
    <Card padding={0}>
      <div style={PANEL_LABEL}>Supported hardware adapters</div>
      <Divider />
      {HARDWARE_ADAPTERS.map((hw, i) => (
        <React.Fragment key={hw.name}>
          <div className="row-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
            <div>
              <div style={{ ...TYPE.body, color: 'var(--label)' }}>{hw.name}</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {hw.protocols.map(p => <Badge key={p} label={p} variant="muted" />)}
              </div>
            </div>
            <Badge label={hw.status} variant="ok" />
          </div>
          {i < HARDWARE_ADAPTERS.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </Card>
  );
}

// ─── NRC reference panel ─────────────────────────────────────────────────────
// Not currently rendered anywhere in EcuBusScreen — see code-review-notes.md.

function NRCReferencePanel(): React.ReactElement {
  return (
    <Card padding={0}>
      <div style={PANEL_LABEL}>UDS negative response codes (NRC)</div>
      <Divider />
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {Object.entries(NRC_CODES).map(([code, name]) => (
          <DataRow
            key={code}
            name={name}
            value={`0x${parseInt(code).toString(16).toUpperCase().padStart(2, '0')}`}
          />
        ))}
      </div>
    </Card>
  );
}

// ─── Main EcuBusScreen ───────────────────────────────────────────────────────

const SUB_TAB_OPTIONS = SUB_TABS.map(t => ({ value: t.id, label: t.label, icon: t.icon }));

const QUICK_ACTIONS: { label: string; tab: EcuBusSubTab; icon: string }[] = [
  { label: 'Read VIN', tab: 'uds', icon: 'ti-id' },
  { label: 'Scan DTCs', tab: 'uds', icon: 'ti-bug' },
  { label: 'Monitor CAN', tab: 'can', icon: 'ti-route' },
  { label: 'Tester present', tab: 'uds', icon: 'ti-heartbeat' },
];

export function EcuBusScreen(): React.ReactElement {
  const activeSubTab = useAppStore(s => s.ecubus.activeSubTab);
  const setSubTab = useAppStore(s => s.setEcuBusSubTab);
  const connectionStatus = useAppStore(s => s.connectionStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 12px', flexShrink: 0,
      }}>
        <SegmentedControl
          ariaLabel="EcuBus tool"
          options={SUB_TAB_OPTIONS}
          value={activeSubTab}
          onChange={setSubTab}
        />
        <div style={{ flex: 1 }} />
        <span style={{ ...TYPE.caption, color: 'var(--label-3)' }}>
          Powered by EcuBus-Pro · Apache 2.0
        </span>
      </div>
      <Divider />

      {/* Quick actions bar */}
      {connectionStatus === 'connected' && (
        <>
          <div style={{
            display: 'flex', gap: 8, padding: '8px 12px', flexShrink: 0,
            flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ ...TYPE.caption, color: 'var(--label-3)' }}>Quick:</span>
            {QUICK_ACTIONS.map(q => (
              <Button key={q.label} size="sm" variant="secondary" icon={q.icon} onClick={() => setSubTab(q.tab)}>
                {q.label}
              </Button>
            ))}
          </div>
          <Divider />
        </>
      )}

      <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
        <AlertBanner
          variant="info"
          message="Demo only: these tabs show sample data and never send anything to the vehicle."
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 12, gap: 0 }}>
        {activeSubTab === 'can'      && <CANMonitorTab />}
        {activeSubTab === 'uds'      && <UDSClientTab />}
        {activeSubTab === 'transmit' && <TransmitTab />}
        {activeSubTab === 'signals'  && <SignalsTab />}
        {activeSubTab === 'script'   && <ScriptTab />}
        {activeSubTab === 'lin'      && <LINTab />}
        {activeSubTab === 'doip'     && <DoIPTab />}
      </div>
    </div>
  );
}
