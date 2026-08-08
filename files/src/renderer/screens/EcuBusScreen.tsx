import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import {
  ScrollPane, SectionHeader, Card, Badge, Button, Grid,
  DenseMetricTile, HeroCard, WaveBar,
} from '../components/layout/UIComponents';
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

const UDS_SERVICES: UDSService[] = [
  { sid: 0x10, name: 'DiagnosticSessionControl', shortName: 'DSC', description: 'Switch ECU diagnostic session',
    subFunctions: [{ id: 0x01, name: 'Default' }, { id: 0x02, name: 'Programming' }, { id: 0x03, name: 'Extended' }] },
  { sid: 0x11, name: 'ECUReset', shortName: 'ER', description: 'Reset ECU',
    subFunctions: [{ id: 0x01, name: 'Hard reset' }, { id: 0x02, name: 'Key off/on' }, { id: 0x03, name: 'Soft reset' }] },
  { sid: 0x14, name: 'ClearDiagnosticInformation', shortName: 'CDI', description: 'Clear stored DTCs' },
  { sid: 0x19, name: 'ReadDTCInformation', shortName: 'RDTCI', description: 'Read DTC info from ECU',
    subFunctions: [{ id: 0x01, name: 'By status mask' }, { id: 0x02, name: 'By DTC mask' }, { id: 0x06, name: 'Extended record' }] },
  { sid: 0x22, name: 'ReadDataByIdentifier', shortName: 'RDBI', description: 'Read data from ECU by DID' },
  { sid: 0x23, name: 'ReadMemoryByAddress', shortName: 'RMBA', description: 'Read ECU memory at address' },
  { sid: 0x27, name: 'SecurityAccess', shortName: 'SA', description: 'Unlock ECU security level',
    subFunctions: [{ id: 0x01, name: 'Request seed (L1)' }, { id: 0x02, name: 'Send key (L1)' }, { id: 0x03, name: 'Request seed (L2)' }] },
  { sid: 0x28, name: 'CommunicationControl', shortName: 'CC', description: 'Enable/disable ECU communication',
    subFunctions: [{ id: 0x00, name: 'Enable TX/RX' }, { id: 0x01, name: 'Enable RX, disable TX' }, { id: 0x03, name: 'Disable TX/RX' }] },
  { sid: 0x2E, name: 'WriteDataByIdentifier', shortName: 'WDBI', description: 'Write data to ECU by DID' },
  { sid: 0x2F, name: 'InputOutputControlByIdentifier', shortName: 'IOCBI', description: 'Control ECU I/O' },
  { sid: 0x31, name: 'RoutineControl', shortName: 'RC', description: 'Execute ECU routine',
    subFunctions: [{ id: 0x01, name: 'Start' }, { id: 0x02, name: 'Stop' }, { id: 0x03, name: 'Request results' }] },
  { sid: 0x34, name: 'RequestDownload', shortName: 'RD', description: 'Initiate firmware download' },
  { sid: 0x36, name: 'TransferData', shortName: 'TD', description: 'Transfer firmware block' },
  { sid: 0x37, name: 'RequestTransferExit', shortName: 'RTE', description: 'Complete firmware transfer' },
  { sid: 0x3E, name: 'TesterPresent', shortName: 'TP', description: 'Keep session alive',
    subFunctions: [{ id: 0x00, name: 'With response' }, { id: 0x80, name: 'Without response' }] },
  { sid: 0x85, name: 'ControlDTCSetting', shortName: 'CDTCS', description: 'Enable/disable DTC storage',
    subFunctions: [{ id: 0x01, name: 'On' }, { id: 0x02, name: 'Off' }] },
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 8 }}>
        <DenseMetricTile label="Total frames" value={stats.total} accentBorder="var(--pp)" />
        <DenseMetricTile label="Unique IDs" value={stats.uniqueIds} accentBorder="var(--gb)" />
        <DenseMetricTile label="TX frames" value={stats.txCount} valueColor="var(--sa)" />
        <DenseMetricTile label="RX frames" value={stats.rxCount} valueColor="var(--sg)" />
        <DenseMetricTile label="Extended IDs" value={stats.extCount} valueColor="var(--gb)" />
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        background: 'var(--bg2)', border: '2px solid var(--br)', borderRadius: 0, marginBottom: 6,
      }}>
        <Button size="sm" variant={paused ? 'danger' : 'ghost'} icon={paused ? 'ti-player-play' : 'ti-player-pause'} onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="sm" icon="ti-trash" onClick={() => {}}>Clear</Button>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <i className="ti ti-filter" style={{ position: 'absolute', left: 8, fontSize: 12, color: 'var(--tm)' }} />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by ID, data, direction..."
            style={{
              width: 260, height: 28, paddingLeft: 26, paddingRight: 8,
              fontSize: 11, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
              background: 'var(--bg3)', border: '2px solid var(--br)', borderRadius: 0,
              color: 'var(--tw)',
            }}
          />
        </div>
        <Badge label={`CAN 2.0`} variant="info" />
        <Badge label="500 kbit/s" variant="muted" />
      </div>

      {/* Frame table */}
      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '65px 40px 90px 65px 1fr 55px 55px 45px',
          gap: 6, padding: '5px 10px',
          background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        }}>
          {['Time', 'Dir', 'ID', 'DLC', 'Data', 'Delta', 'Count', 'Bus'].map(h => (
            <span key={h} style={{
              fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
              letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)',
            }}>{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div ref={tableRef} style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
          {displayFrames.map((frame, i) => (
            <div
              key={`${frame.timestamp}-${frame.id}-${i}`}
              onClick={() => setSelectedFrame(frame)}
              style={{
                display: 'grid',
                gridTemplateColumns: '65px 40px 90px 65px 1fr 55px 55px 45px',
                gap: 6, padding: '4px 10px', alignItems: 'center',
                borderBottom: '1px solid var(--bg3)',
                background: selectedFrame === frame ? 'rgba(255,87,34,0.05)' : 'transparent',
                cursor: 'pointer', fontSize: 11,
                fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
                transition: 'background 0.08s',
              }}
              onMouseEnter={e => { if (selectedFrame !== frame) (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
              onMouseLeave={e => { if (selectedFrame !== frame) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>{timestamp(frame.timestamp)}</span>
              <Badge label={frame.direction} variant={frame.direction === 'TX' ? 'warn' : 'ok'} />
              <span style={{ color: frame.isExtended ? 'var(--gb)' : 'var(--pp)', fontWeight: 500 }}>
                {frame.idHex}
              </span>
              <span style={{ color: 'var(--tm)' }}>{frame.dlc}</span>
              <span style={{ color: 'var(--tw)', letterSpacing: 0.8 }}>{frame.dataHex}</span>
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>{frame.delta.toFixed(1)} ms</span>
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>{frame.count}</span>
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>CH{frame.channel}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Detail panel */}
      {selectedFrame && (
        <Card style={{ marginTop: 6 }}>
          <SectionHeader>Frame detail — {selectedFrame.idHex}</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 6 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 4 }}>Arbitration ID</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 14, color: 'var(--pp)' }}>{selectedFrame.idHex} ({selectedFrame.id})</div>
              <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 2 }}>
                {selectedFrame.isExtended ? '29-bit extended' : '11-bit standard'} · {selectedFrame.busType}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 4 }}>Data bytes</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 14, color: 'var(--tw)' }}>{selectedFrame.dataHex}</div>
              <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 2 }}>
                DLC: {selectedFrame.dlc} · {selectedFrame.data.map(b => String.fromCharCode(b >= 32 && b < 127 ? b : 46)).join('')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 4 }}>Bit-level view</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {selectedFrame.data.map((b, bi) => (
                  <div key={bi} style={{ display: 'flex', gap: 1 }}>
                    {Array.from({ length: 8 }, (_, j) => (
                      <div key={j} style={{
                        width: 8, height: 12, borderRadius: 0,
                        background: (b >> (7 - j)) & 1 ? 'var(--pp)' : 'var(--bg4)',
                        border: '2px solid var(--br)',
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
  const [history, setHistory] = useState<{ ts: number; req: string; res: string; positive: boolean; service: string }[]>([]);
  const [testerPresentActive, setTesterPresentActive] = useState(false);

  const handleSend = () => {
    const now = Date.now();
    let reqBytes = [selectedService.sid];
    if (selectedService.subFunctions && subFunc) reqBytes.push(subFunc);
    if (selectedService.sid === 0x22 || selectedService.sid === 0x2E) {
      const d = parseInt(didInput, 16);
      reqBytes.push((d >> 8) & 0xFF, d & 0xFF);
    }
    if (payloadHex.trim()) {
      payloadHex.trim().split(/[\s,]+/).forEach(h => { const v = parseInt(h, 16); if (!isNaN(v)) reqBytes.push(v & 0xFF); });
    }
    const reqStr = reqBytes.map(hexByte).join(' ');

    // Simulate a positive response
    const posRes = [selectedService.sid + 0x40, ...reqBytes.slice(1)];
    if (selectedService.sid === 0x22) {
      // Simulate some return data
      posRes.push(...[0x31, 0x47, 0x43, 0x45, 0x4B, 0x31, 0x39, 0x54, 0x30, 0x34, 0x45, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36]);
    }
    const resStr = posRes.map(hexByte).join(' ');
    setHistory(prev => [...prev, { ts: now, req: reqStr, res: resStr, positive: true, service: selectedService.shortName }]);
  };

  return (
    <>
      {/* Addressing */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Card style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>TX ID (Tester)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tm)' }}>0x</span>
                <input value={txId} onChange={e => setTxId(e.target.value)} style={{ width: 60, height: 26, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, padding: '0 6px', textTransform: 'uppercase' }} />
              </div>
            </div>
            <i className="ti ti-arrow-right" style={{ fontSize: 16, color: 'var(--pp)' }} />
            <div>
              <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>RX ID (ECU)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tm)' }}>0x</span>
                <input value={rxId} onChange={e => setRxId(e.target.value)} style={{ width: 60, height: 26, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, padding: '0 6px', textTransform: 'uppercase' }} />
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Badge label="CAN-TP" variant="info" />
              <Badge label="ISO 15765-2" variant="muted" />
            </div>
            <Button
              size="sm"
              variant={testerPresentActive ? 'primary' : 'ghost'}
              icon="ti-heartbeat"
              onClick={() => setTesterPresentActive(!testerPresentActive)}
            >
              {testerPresentActive ? 'TP Active' : 'Tester Present'}
            </Button>
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 8, flex: 1, overflow: 'hidden' }}>
        {/* Service list */}
        <Card padding={0} style={{ width: 260, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            padding: '6px 10px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
            fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 10,
            letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)',
          }}>
            UDS services (ISO 14229)
          </div>
          <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
            {UDS_SERVICES.map(svc => (
              <div
                key={svc.sid}
                onClick={() => { setSelectedService(svc); setSubFunc(svc.subFunctions?.[0]?.id ?? 0); }}
                style={{
                  padding: '7px 10px', cursor: 'pointer',
                  borderBottom: '1px solid var(--bg3)',
                  background: selectedService.sid === svc.sid ? 'rgba(255,87,34,0.05)' : 'transparent',
                  borderLeft: selectedService.sid === svc.sid ? '2px solid var(--pp)' : '2px solid transparent',
                  transition: 'background 0.08s',
                }}
                onMouseEnter={e => { if (selectedService.sid !== svc.sid) (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
                onMouseLeave={e => { if (selectedService.sid !== svc.sid) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: 'var(--pp)' }}>
                    0x{hexByte(svc.sid)}
                  </span>
                  <Badge label={svc.shortName} variant="muted" />
                </div>
                <div style={{ fontSize: 11, color: 'var(--tw)', marginTop: 2 }}>{svc.name}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Service detail + send */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--tw)', fontWeight: 500 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", color: 'var(--pp)', marginRight: 6 }}>0x{hexByte(selectedService.sid)}</span>
                  {selectedService.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 2 }}>{selectedService.description}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* Sub-function selector */}
              {selectedService.subFunctions && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>Sub-function</div>
                  <select
                    value={subFunc}
                    onChange={e => setSubFunc(Number(e.target.value))}
                    style={{ height: 28, fontSize: 11, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", padding: '0 6px', minWidth: 180 }}
                  >
                    {selectedService.subFunctions.map(sf => (
                      <option key={sf.id} value={sf.id}>0x{hexByte(sf.id)} — {sf.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* DID input for RDBI/WDBI */}
              {(selectedService.sid === 0x22 || selectedService.sid === 0x2E) && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>DID</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tm)' }}>0x</span>
                    <input value={didInput} onChange={e => setDidInput(e.target.value)} placeholder="F190"
                      style={{ width: 60, height: 28, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, padding: '0 6px', textTransform: 'uppercase' }} />
                  </div>
                </div>
              )}

              {/* Additional payload */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>Additional data (hex)</div>
                <input value={payloadHex} onChange={e => setPayloadHex(e.target.value)} placeholder="e.g. 01 02 03"
                  style={{ width: '100%', height: 28, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, padding: '0 8px' }} />
              </div>

              <Button variant="primary" icon="ti-send" onClick={handleSend}>Send</Button>
            </div>
          </Card>

          {/* Common DIDs quick-pick */}
          {(selectedService.sid === 0x22) && (
            <Card padding={0} style={{ maxHeight: 130, overflow: 'hidden' }}>
              <div style={{
                padding: '4px 10px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)',
              }}>
                Common DIDs — click to populate
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 96, scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6 }}>
                  {COMMON_DIDS.map(d => (
                    <button
                      key={d.did}
                      onClick={() => setDidInput(d.did)}
                      title={d.name}
                      style={{
                        background: didInput === d.did ? 'rgba(255,87,34,0.08)' : 'var(--bg3)',
                        border: `1px solid ${didInput === d.did ? 'var(--pp)' : 'var(--br)'}`,
                        borderRadius: 0, padding: '3px 8px', cursor: 'pointer',
                        fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 10, color: 'var(--tw)',
                      }}
                    >
                      {d.did}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Response history */}
          <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 60px 50px 1fr 1fr',
              gap: 6, padding: '5px 10px',
              background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
            }}>
              {['Time', 'Service', 'Status', 'Request', 'Response'].map(h => (
                <span key={h} style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)' }}>{h}</span>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
              {history.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--tm)', fontSize: 12 }}>
                  <i className="ti ti-stethoscope" style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                  No UDS exchanges yet — select a service and click Send
                </div>
              ) : (
                history.map((h, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '80px 60px 50px 1fr 1fr',
                    gap: 6, padding: '5px 10px', borderBottom: '1px solid var(--bg3)',
                    fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--tm)', fontSize: 10 }}>{timestamp(h.ts)}</span>
                    <Badge label={h.service} variant="info" />
                    <Badge label={h.positive ? 'OK' : 'NRC'} variant={h.positive ? 'ok' : 'crit'} />
                    <span style={{ color: 'var(--sa)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.req}</span>
                    <span style={{ color: h.positive ? 'var(--sg)' : 'var(--sr)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.res}</span>
                  </div>
                ))
              )}
            </div>
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
            <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>CAN ID</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tm)' }}>0x</span>
              <input value={frameId} onChange={e => setFrameId(e.target.value)} style={{ width: 70, height: 28, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, padding: '0 6px', textTransform: 'uppercase' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>DLC</div>
            <select value={dlc} onChange={e => setDlc(Number(e.target.value))} style={{ height: 28, width: 50, fontSize: 11, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", padding: '0 4px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, ...(isFD ? [12, 16, 20, 24, 32, 48, 64] : [])].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tw)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isFD} onChange={e => setIsFD(e.target.checked)} />
              CAN-FD
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tw)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isCyclic} onChange={e => setIsCyclic(e.target.checked)} />
              Cyclic
            </label>
            {isCyclic && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input value={cycleMs} onChange={e => setCycleMs(Number(e.target.value))} type="number" style={{ width: 60, height: 26, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, padding: '0 4px' }} />
                <span style={{ fontSize: 10, color: 'var(--tm)' }}>ms</span>
              </div>
            )}
          </div>
        </div>

        {/* Data byte grid */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 4 }}>Data bytes</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {dataBytes.slice(0, dlc).map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 8, color: 'var(--tm)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif" }}>B{i}</span>
                <input
                  value={b}
                  onChange={e => handleByteChange(i, e.target.value)}
                  maxLength={2}
                  style={{
                    width: 32, height: 28, textAlign: 'center',
                    fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12,
                    padding: 0, textTransform: 'uppercase',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <Button variant="primary" icon="ti-send" onClick={handleSend}>
            {isCyclic ? 'Start cyclic TX' : 'Send frame'}
          </Button>
          <Button icon="ti-eraser" onClick={() => setDataBytes(Array(8).fill('00'))}>Zero all</Button>
          <Button icon="ti-maximize" onClick={() => setDataBytes(Array(8).fill('FF'))}>Fill FF</Button>
        </div>
      </Card>

      {/* Sent log */}
      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        <div style={{
          padding: '5px 10px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
          fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
          letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)',
        }}>
          TX log · {sentLog.length} frames sent
        </div>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
          {sentLog.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--tm)', fontSize: 12 }}>
              <i className="ti ti-send" style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
              No frames sent yet
            </div>
          ) : (
            sentLog.map((entry, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '5px 10px', borderBottom: '1px solid var(--bg3)',
                fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, alignItems: 'center',
              }}>
                <span style={{ color: 'var(--tm)', fontSize: 10, width: 70 }}>{timestamp(entry.ts)}</span>
                <Badge label="TX" variant="warn" />
                <span style={{ color: 'var(--pp)' }}>{entry.id}</span>
                <span style={{ color: 'var(--tw)', letterSpacing: 0.8 }}>{entry.data}</span>
              </div>
            ))
          )}
        </div>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Button size="sm" icon="ti-file-import">Load DBC</Button>
        <Button size="sm" icon="ti-plus">Add signal</Button>
        <div style={{ flex: 1 }} />
        <Badge label="8 signals" variant="info" />
        <Badge label="4 messages" variant="muted" />
      </div>

      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '130px 90px 130px 70px 70px 60px 50px 100px 60px',
          gap: 6, padding: '5px 10px',
          background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        }}>
          {['Signal', 'Message ID', 'Message', 'Start bit', 'Length', 'Factor', 'Unit', 'Value', 'Raw'].map(h => (
            <span key={h} style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)' }}>{h}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
          {signals.map((sig, i) => (
            <div
              key={sig.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '130px 90px 130px 70px 70px 60px 50px 100px 60px',
                gap: 6, padding: '6px 10px', alignItems: 'center',
                borderBottom: '1px solid var(--bg3)',
                fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
                transition: 'background 0.08s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ color: 'var(--tw)', fontWeight: 500, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif" }}>{sig.name}</span>
              <span style={{ color: 'var(--pp)' }}>0x{sig.messageId.toString(16).toUpperCase().padStart(3, '0')}</span>
              <span style={{ color: 'var(--tm)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 10 }}>{sig.messageName}</span>
              <span style={{ color: 'var(--tm)' }}>{sig.startBit}</span>
              <span style={{ color: 'var(--tm)' }}>{sig.length} bit</span>
              <span style={{ color: 'var(--tm)' }}>{sig.factor}</span>
              <span style={{ color: 'var(--tm)' }}>{sig.unit}</span>
              <span style={{ color: 'var(--sg)', fontWeight: 500, fontSize: 13 }}>{sig.value}</span>
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>{sig.rawValue}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Signal bar chart visualization */}
      <Card style={{ marginTop: 8 }}>
        <SectionHeader>Signal bar graph</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          {signals.map(sig => {
            const pct = ((sig.value - sig.min) / (sig.max - sig.min)) * 100;
            return (
              <div key={sig.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 110, fontSize: 11, color: 'var(--tw)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", textAlign: 'right' }}>{sig.name}</span>
                <div style={{ flex: 1, height: 14, background: 'var(--bg4)', borderRadius: 0, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: 'var(--pp)', borderRadius: 0, transition: 'width 0.3s' }} />
                </div>
                <span style={{ width: 70, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: 'var(--sg)', textAlign: 'right' }}>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <Button size="sm" icon="ti-plus">New script</Button>
        <Button size="sm" icon="ti-file-import">Import</Button>
        <div style={{ flex: 1 }} />
        <Badge label="TypeScript" variant="info" />
        <Badge label="CAPL-like API" variant="muted" />
      </div>

      <div style={{ display: 'flex', gap: 8, flex: 1, overflow: 'hidden' }}>
        {/* Editor */}
        <Card padding={0} style={{ flex: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 10px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-file-code" style={{ fontSize: 13, color: 'var(--pp)' }} />
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: 'var(--tw)' }}>
                {script?.name ?? 'untitled.ts'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="primary" icon="ti-player-play" onClick={() => updateScript(script.id, { status: 'running', output: [...script.output, `[${new Date().toLocaleTimeString()}] Script started...`, `[${new Date().toLocaleTimeString()}] VIN: 1GCEK19T04E123456`, `[${new Date().toLocaleTimeString()}] Script completed.`], lastRun: Date.now() })}>
                Run
              </Button>
              <Button size="sm" icon="ti-player-stop" onClick={() => updateScript(script.id, { status: 'idle' })}>Stop</Button>
            </div>
          </div>
          <textarea
            value={script?.code ?? ''}
            onChange={e => updateScript(script.id, { code: e.target.value })}
            spellCheck={false}
            style={{
              flex: 1, resize: 'none', border: 'none', outline: 'none',
              background: 'var(--bg)', color: 'var(--tw)',
              fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12,
              lineHeight: 1.7, padding: '10px 12px',
              tabSize: 2,
            }}
          />
        </Card>

        {/* Console output */}
        <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 10px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
          }}>
            <span style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)' }}>
              Console output
            </span>
            <Badge label={script?.status ?? 'idle'} variant={script?.status === 'running' ? 'warn' : script?.status === 'error' ? 'crit' : script?.status === 'success' ? 'ok' : 'muted'} />
          </div>
          <div style={{
            flex: 1, overflowY: 'auto', padding: 10,
            fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
            color: 'var(--sg)', lineHeight: 1.8,
            scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent',
          }}>
            {(script?.output ?? []).length === 0 ? (
              <span style={{ color: 'var(--tm)' }}>Run the script to see output here...</span>
            ) : (
              (script?.output ?? []).map((line, i) => (
                <div key={i}>{line}</div>
              ))
            )}
          </div>

          {/* API reference */}
          <div style={{ borderTop: '2px solid var(--br)', padding: 8 }}>
            <div style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)', marginBottom: 4 }}>
              API Reference
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['CAN.send()', 'CAN.on()', 'UDS.readDID()', 'UDS.writeDID()', 'UDS.session()', 'UDS.reset()', 'LIN.send()', 'delay()', 'log()'].map(fn => (
                <span key={fn} style={{
                  fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 9,
                  background: 'var(--bg3)', border: '2px solid var(--br)',
                  borderRadius: 0, padding: '2px 6px', color: 'var(--pp)',
                }}>
                  {fn}
                </span>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
        <DenseMetricTile label="LIN frames" value={frames.length} accentBorder="var(--gb)" />
        <DenseMetricTile label="Master frames" value={frames.filter(f => f.direction === 'master').length} valueColor="var(--pp)" />
        <DenseMetricTile label="Slave responses" value={frames.filter(f => f.direction === 'slave').length} valueColor="var(--sg)" />
        <DenseMetricTile label="Errors" value={frames.filter(f => f.error).length} valueColor="var(--sr)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <Button size="sm" icon="ti-file-import">Load LDF</Button>
        <Button size="sm" icon="ti-file-export">Export LDF</Button>
        <Button size="sm" icon="ti-test-pipe">Conformance test</Button>
        <div style={{ flex: 1 }} />
        <Badge label="LIN 2.1" variant="info" />
        <Badge label="19.2 kbit/s" variant="muted" />
      </div>

      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '75px 60px 40px 1fr 80px 70px',
          gap: 6, padding: '5px 10px',
          background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        }}>
          {['Time', 'ID', 'DLC', 'Data', 'Direction', 'Checksum'].map(h => (
            <span key={h} style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)' }}>{h}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
          {frames.map((frame, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '75px 60px 40px 1fr 80px 70px',
                gap: 6, padding: '5px 10px', alignItems: 'center',
                borderBottom: '1px solid var(--bg3)',
                fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
                transition: 'background 0.08s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>{timestamp(frame.timestamp)}</span>
              <span style={{ color: 'var(--pp)', fontWeight: 500 }}>{frame.idHex}</span>
              <span style={{ color: 'var(--tm)' }}>{frame.dlc}</span>
              <span style={{ color: 'var(--tw)', letterSpacing: 0.8 }}>{frame.dataHex}</span>
              <Badge label={frame.direction} variant={frame.direction === 'master' ? 'warn' : 'ok'} />
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>
                0x{hexByte(frame.checksum)} ({frame.checksumType})
              </span>
            </div>
          ))}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
        <DenseMetricTile label="DoIP entities" value={entities.length} accentBorder="var(--gb)" />
        <DenseMetricTile label="Online" value={entities.filter(e => e.status === 'online').length} valueColor="var(--sg)" />
        <DenseMetricTile label="Gateways" value={entities.filter(e => e.entityType === 'gateway').length} valueColor="var(--pp)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <Button size="sm" variant="primary" icon="ti-radar">Vehicle discovery</Button>
        <div style={{ flex: 1 }} />
        <Badge label="ISO 13400" variant="info" />
        <Badge label="TCP/UDP" variant="muted" />
      </div>

      <Card padding={0} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '120px 60px 90px 130px 80px 70px',
          gap: 6, padding: '5px 10px',
          background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        }}>
          {['IP Address', 'Port', 'Logical Addr', 'Entity ID', 'Type', 'Status'].map(h => (
            <span key={h} style={{ fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)' }}>{h}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
          {entities.map((entity, i) => (
            <div
              key={i}
              onClick={() => setSelectedEntity(entity)}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 60px 90px 130px 80px 70px',
                gap: 6, padding: '6px 10px', alignItems: 'center',
                borderBottom: '1px solid var(--bg3)',
                fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11,
                background: selectedEntity === entity ? 'rgba(255,87,34,0.05)' : 'transparent',
                cursor: 'pointer', transition: 'background 0.08s',
              }}
              onMouseEnter={e => { if (selectedEntity !== entity) (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
              onMouseLeave={e => { if (selectedEntity !== entity) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ color: 'var(--tw)' }}>{entity.ip}</span>
              <span style={{ color: 'var(--tm)' }}>{entity.port}</span>
              <span style={{ color: 'var(--pp)' }}>0x{entity.logicalAddress.toString(16).toUpperCase().padStart(4, '0')}</span>
              <span style={{ color: 'var(--tm)', fontSize: 10 }}>{entity.eid}</span>
              <Badge label={entity.entityType} variant={entity.entityType === 'gateway' ? 'warn' : 'muted'} />
              <Badge label={entity.status} variant={entity.status === 'online' ? 'ok' : entity.status === 'busy' ? 'warn' : 'crit'} />
            </div>
          ))}
        </div>
      </Card>

      {selectedEntity && (
        <Card style={{ marginTop: 8 }}>
          <SectionHeader>Entity detail — {selectedEntity.ip}</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 6 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>Network</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tw)' }}>{selectedEntity.ip}:{selectedEntity.port}</div>
              <div style={{ fontSize: 10, color: 'var(--tm)', marginTop: 2 }}>Logical: 0x{selectedEntity.logicalAddress.toString(16).toUpperCase().padStart(4, '0')}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>Identification</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tw)' }}>EID: {selectedEntity.eid}</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 10, color: 'var(--tm)', marginTop: 2 }}>GID: {selectedEntity.gid}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", marginBottom: 3 }}>Vehicle</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: selectedEntity.vin ? 'var(--tw)' : 'var(--tm)' }}>
                {selectedEntity.vin || '—'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <Button size="sm" variant="primary" icon="ti-plug-connected">Connect</Button>
            <Button size="sm" icon="ti-stethoscope">UDS via DoIP</Button>
          </div>
        </Card>
      )}
    </>
  );
}

// ─── Hardware adapters panel ─────────────────────────────────────────────────

function HardwarePanel(): React.ReactElement {
  return (
    <Card padding={0}>
      <div style={{
        padding: '5px 10px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
        letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)',
      }}>
        Supported hardware adapters
      </div>
      {HARDWARE_ADAPTERS.map((hw, i) => (
        <div
          key={hw.name}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px', borderBottom: i < HARDWARE_ADAPTERS.length - 1 ? '1px solid var(--bg3)' : 'none',
            transition: 'background 0.08s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--tw)' }}>{hw.name}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
              {hw.protocols.map(p => <Badge key={p} label={p} variant="muted" />)}
            </div>
          </div>
          <Badge label={hw.status} variant="ok" />
        </div>
      ))}
    </Card>
  );
}

// ─── NRC reference panel ─────────────────────────────────────────────────────

function NRCReferencePanel(): React.ReactElement {
  return (
    <Card padding={0}>
      <div style={{
        padding: '5px 10px', background: 'var(--bg4)', borderBottom: '2px solid var(--br)',
        fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
        letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)',
      }}>
        UDS negative response codes (NRC)
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
        {Object.entries(NRC_CODES).map(([code, name]) => (
          <div key={code} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 10px', borderBottom: '1px solid var(--bg3)',
            fontSize: 10, fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
          }}>
            <span style={{ color: 'var(--sr)' }}>0x{parseInt(code).toString(16).toUpperCase().padStart(2, '0')}</span>
            <span style={{ color: 'var(--tm)', fontSize: 10, fontFamily: "'Inter', 'Roboto', system-ui, sans-serif" }}>{name}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Main EcuBusScreen ───────────────────────────────────────────────────────

export function EcuBusScreen(): React.ReactElement {
  const activeSubTab = useAppStore(s => s.ecubus.activeSubTab);
  const setSubTab = useAppStore(s => s.setEcuBusSubTab);
  const connectionStatus = useAppStore(s => s.connectionStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '4px 8px', background: 'var(--bg2)', borderBottom: '2px solid var(--br)',
        flexShrink: 0,
      }}>
        {SUB_TABS.map(tab => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 0,
                border: isActive ? '1px solid var(--pp)' : '1px solid transparent',
                background: isActive ? 'rgba(255,87,34,0.06)' : 'transparent',
                color: isActive ? 'var(--pp)' : 'var(--tm)',
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontWeight: 700,
                fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isActive ? 'rgba(255,87,34,0.06)' : 'transparent'; }}
            >
              <i className={`ti ${tab.icon}`} style={{ fontSize: 14 }} />
              {tab.label}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 10,
          letterSpacing: 1, color: 'var(--tm)', opacity: 0.6,
        }}>
          Powered by EcuBus-Pro · Apache 2.0
        </span>
      </div>

      {/* Quick actions bar */}
      {connectionStatus === 'connected' && (
        <div style={{
          display: 'flex', gap: 6, padding: '6px 10px',
          background: 'var(--bg3)', borderBottom: '2px solid var(--br)', flexShrink: 0,
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--tm)', marginRight: 4 }}>Quick:</span>
          {[
            { label: 'Read VIN', action: () => { setSubTab('uds'); }, icon: 'ti-id' },
            { label: 'Scan DTCs', action: () => { setSubTab('uds'); }, icon: 'ti-bug' },
            { label: 'Monitor CAN', action: () => { setSubTab('can'); }, icon: 'ti-route' },
            { label: 'Tester Present', action: () => { setSubTab('uds'); }, icon: 'ti-heartbeat' },
            { label: 'ECU Reset', action: () => { setSubTab('uds'); }, icon: 'ti-refresh' },
          ].map(q => (
            <button
              key={q.label}
              onClick={q.action}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 0, fontSize: 10, fontWeight: 600,
                background: 'var(--bg4)', border: '2px solid var(--br)',
                color: 'var(--pp)', cursor: 'pointer',
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pp)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--br)'; }}
            >
              <i className={`ti ${q.icon}`} style={{ fontSize: 12 }} />
              {q.label}
            </button>
          ))}
        </div>
      )}

      {connectionStatus !== 'connected' && (
        <div style={{
          padding: '12px 14px', background: 'var(--bg3)', borderBottom: '2px solid var(--br)',
          fontSize: 12, color: 'var(--tm)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--sa)' }} />
          Connect to an adapter first. EcuBus requires a live connection to send CAN/UDS frames.
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 10, gap: 0 }}>
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
