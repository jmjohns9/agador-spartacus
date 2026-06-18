import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { DTCCode, DTCType, DTCStatus, FreezeFrame } from '../../shared/types';
import {
  ScrollPane, SectionHeader, Card, Badge, AlertBanner, Button,
} from '../components/layout/UIComponents';

// ─── DTC type/status metadata ─────────────────────────────────────────────────

const TYPE_LABELS: Record<DTCType, string> = {
  P: 'Powertrain', B: 'Body', C: 'Chassis', U: 'Network',
};

const STATUS_VARIANT: Record<DTCStatus, 'crit' | 'warn' | 'info' | 'muted'> = {
  active:    'crit',
  pending:   'warn',
  permanent: 'warn',
  historical: 'muted',
};

const TYPE_VARIANT: Record<DTCType, 'crit' | 'warn' | 'info' | 'muted'> = {
  P: 'crit', B: 'warn', C: 'info', U: 'warn',
};

// ─── DTCRow ───────────────────────────────────────────────────────────────────

type CarsXEResult =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; description: string; causes: string[]; repair: string }
  | { state: 'error'; error: string }
  | { state: 'no-key' };

function DTCRow({ dtc, expanded, onToggle, hasFreezeFrame, onViewFreezeFrame }: {
  dtc: DTCCode;
  expanded: boolean;
  onToggle: () => void;
  hasFreezeFrame: boolean;
  onViewFreezeFrame: () => void;
}): React.ReactElement {
  const [carsxe, setCarsxe] = React.useState<CarsXEResult>({ state: 'idle' });

  React.useEffect(() => {
    if (!expanded || carsxe.state !== 'idle') return;
    setCarsxe({ state: 'loading' });
    window.electronAPI.carsxeDecode(dtc.code).then(res => {
      if (!res.ok) {
        if (res.error.includes('CARSXE_API_KEY')) setCarsxe({ state: 'no-key' });
        else setCarsxe({ state: 'error', error: res.error });
      } else {
        setCarsxe({ state: 'ok', description: res.description, causes: res.causes, repair: res.repair });
      }
    }).catch(e => setCarsxe({ state: 'error', error: String(e) }));
  }, [expanded]);

  const ago = (ms: number) => {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <div style={{ borderBottom: '1px solid var(--bg3)' }}>
      {/* Summary row */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', cursor: 'pointer',
          background: expanded ? 'var(--bg3)' : 'transparent',
          transition: 'background 0.1s, border-color 0.15s',
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Status dot */}
        <div style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: dtc.status === 'active' ? 'var(--sr)'
            : dtc.status === 'pending' ? 'var(--sa)'
            : 'var(--tm)',
          animation: dtc.status === 'active' ? 'blink 2s infinite' : 'none',
        }} />

        {/* Code — monospace PID style */}
        <span style={{
          fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 13, fontWeight: 500,
          color: dtc.status === 'active' ? 'var(--sr)' : 'var(--tw)',
          width: 54, flexShrink: 0,
        }}>
          {dtc.code}
        </span>

        {/* Description */}
        <span style={{ flex: 1, fontSize: 12, color: 'var(--tw)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dtc.description}
        </span>

        {/* Module — dense Barlow Condensed label */}
        <span style={{
          fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
          letterSpacing: 1.2, textTransform: 'uppercase',
          color: 'var(--tm)', flexShrink: 0,
        }}>
          {dtc.module}
        </span>

        {/* Badges */}
        <Badge label={TYPE_LABELS[dtc.type]} variant={TYPE_VARIANT[dtc.type]} />
        <Badge label={dtc.status} variant={STATUS_VARIANT[dtc.status]} />

        {/* Last seen */}
        <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 10, color: 'var(--tm)', width: 50, textAlign: 'right', flexShrink: 0 }}>
          {ago(dtc.lastSeen)}
        </span>

        <button
          title={hasFreezeFrame ? 'View freeze frame' : 'No freeze frame captured yet'}
          onClick={e => { e.stopPropagation(); if (hasFreezeFrame) onViewFreezeFrame(); }}
          style={{
            background: 'none', border: 'none', padding: '2px 4px',
            cursor: hasFreezeFrame ? 'pointer' : 'default',
            color: hasFreezeFrame ? 'var(--gb)' : 'var(--br)',
            flexShrink: 0,
          }}
        >
          <i className="ti ti-camera" style={{ fontSize: 12 }} />
        </button>
        <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 13, color: 'var(--tm)', flexShrink: 0 }} />
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{
          background: 'var(--bg4)', borderTop: '1px solid var(--bg3)',
          padding: '12px 16px', display: 'flex', gap: 24,
        }}>

          {/* Left: causes + repair (CarsXE enriched when available) */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {carsxe.state === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tm)', marginBottom: 10 }}>
                <i className="ti ti-loader-2" style={{ fontSize: 13, animation: 'spin 1s linear infinite' }} />
                Looking up {dtc.code} via CarsXE…
              </div>
            )}

            {carsxe.state === 'ok' && carsxe.description && (
              <>
                <div style={{
                  fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                  letterSpacing: 1.2, textTransform: 'uppercase',
                  color: 'var(--pp)', marginBottom: 4,
                }}>
                  CarsXE definition
                </div>
                <div style={{ fontSize: 12, color: 'var(--tw)', marginBottom: 10, lineHeight: 1.6 }}>{carsxe.description}</div>
              </>
            )}

            <div style={{
              fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
              letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--tm)', marginBottom: 8,
            }}>
              {carsxe.state === 'ok' && carsxe.causes.length > 0 ? 'CarsXE — likely causes' : 'Likely causes'}
            </div>
            <ol style={{ paddingLeft: 16, margin: 0 }}>
              {(carsxe.state === 'ok' && carsxe.causes.length > 0 ? carsxe.causes : dtc.likelyCauses).map((c, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--tw)', marginBottom: 4, lineHeight: 1.5 }}>{c}</li>
              ))}
            </ol>

            <div style={{
              fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
              letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--tm)', marginTop: 12, marginBottom: 6,
            }}>
              {carsxe.state === 'ok' && carsxe.repair ? 'CarsXE — tech notes' : 'Repair procedure'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--tw)', lineHeight: 1.6 }}>
              {carsxe.state === 'ok' && carsxe.repair ? carsxe.repair : dtc.repairSummary}
            </div>

            {carsxe.state === 'no-key' && (
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--tm)', fontFamily: "'JetBrains Mono','Roboto Mono',monospace" }}>
                Set CARSXE_API_KEY to enable live DTC lookup
              </div>
            )}
            {carsxe.state === 'error' && (
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--sa)' }}>CarsXE: {carsxe.error}</div>
            )}
          </div>

          {/* Right: metadata */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 160 }}>
            <div>
              <div style={{
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                letterSpacing: 1.2, textTransform: 'uppercase',
                color: 'var(--tm)', marginBottom: 3,
              }}>Code</div>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 15, color: 'var(--pp)' }}>{dtc.code}</span>
            </div>
            <div>
              <div style={{
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                letterSpacing: 1.2, textTransform: 'uppercase',
                color: 'var(--tm)', marginBottom: 3,
              }}>Module</div>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tw)' }}>{dtc.module}</span>
            </div>
            <div>
              <div style={{
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                letterSpacing: 1.2, textTransform: 'uppercase',
                color: 'var(--tm)', marginBottom: 3,
              }}>First seen</div>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: 'var(--tw)' }}>
                {new Date(dtc.firstSeen).toLocaleTimeString()}
              </span>
            </div>
            <div>
              <div style={{
                fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                letterSpacing: 1.2, textTransform: 'uppercase',
                color: 'var(--tm)', marginBottom: 3,
              }}>Last seen</div>
              <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 11, color: 'var(--tw)' }}>
                {new Date(dtc.lastSeen).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <Badge label={TYPE_LABELS[dtc.type]} variant={TYPE_VARIANT[dtc.type]} />
              <Badge label={dtc.status} variant={STATUS_VARIANT[dtc.status]} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DTCScreen ────────────────────────────────────────────────────────────────

export function DTCScreen(): React.ReactElement {
  const dtcs              = useAppStore(s => s.dtcs);
  const connectionStatus  = useAppStore(s => s.connectionStatus);
  const platform          = useAppStore(s => s.platform);
  const isGMT800          = platform.id === 'gmt800';
  const setActiveScreen      = useAppStore(s => s.setActiveScreen);
  const setFreezeFrameFilter = useAppStore(s => s.setFreezeFrameFilter);

  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [freezeFrameCodes, setFreezeFrameCodes] = useState<Set<string>>(new Set());
  const [filterType,   setFilterType]   = useState<DTCType | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<DTCStatus | 'ALL'>('ALL');
  const [search,       setSearch]       = useState('');

  useEffect(() => {
    window.electronAPI.storage.getFreezeFrames().then((ffs: unknown) => {
      setFreezeFrameCodes(new Set((ffs as FreezeFrame[]).map((f: FreezeFrame) => f.dtcCode)));
    });
  }, []);

  const filtered = useMemo(() => {
    return dtcs.filter(d => {
      if (filterType   !== 'ALL' && d.type   !== filterType)   return false;
      if (filterStatus !== 'ALL' && d.status !== filterStatus) return false;
      if (search && !d.code.toLowerCase().includes(search.toLowerCase()) &&
          !d.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      // Active first, then pending, then others
      const order: DTCStatus[] = ['active', 'pending', 'permanent', 'historical'];
      return order.indexOf(a.status) - order.indexOf(b.status);
    });
  }, [dtcs, filterType, filterStatus, search]);

  const activeDTCs   = dtcs.filter(d => d.status === 'active').length;
  const pendingDTCs  = dtcs.filter(d => d.status === 'pending').length;
  const gmDTCs       = dtcs.filter(d => d.type === 'B' || d.type === 'U').length;

  const handleClear = () => {
    if (!window.electronAPI) return;
    if (confirm('Clear all diagnostic fault codes? This cannot be undone and will reset readiness monitors.')) {
      window.electronAPI.clearDTCs();
    }
  };

  const handleScan = () => {
    if (!window.electronAPI) return;
    window.electronAPI.scanDTCs();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar — Dash0-style dense header bar ────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', background: 'var(--bg2)', borderBottom: '2px solid var(--br)',
        flexShrink: 0,
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search code or description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '4px 8px', fontSize: 11, width: 220, height: 28,
            background: 'var(--bg4)', border: '2px solid var(--br)', borderRadius: 0,
            color: 'var(--tw)', fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace",
            outline: 'none',
          }}
        />

        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as DTCType | 'ALL')}
          style={{
            padding: '4px 6px', fontSize: 11, height: 28,
            background: 'var(--bg4)', border: '2px solid var(--br)', borderRadius: 0,
            color: 'var(--tw)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
          }}
        >
          <option value="ALL">All types</option>
          <option value="P">Powertrain (P)</option>
          <option value="B">Body (B)</option>
          <option value="C">Chassis (C)</option>
          <option value="U">Network (U)</option>
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as DTCStatus | 'ALL')}
          style={{
            padding: '4px 6px', fontSize: 11, height: 28,
            background: 'var(--bg4)', border: '2px solid var(--br)', borderRadius: 0,
            color: 'var(--tw)', fontFamily: "'Inter', 'Roboto', system-ui, sans-serif",
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="permanent">Permanent</option>
          <option value="historical">Historical</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Counters */}
        <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 10, color: 'var(--tm)' }}>
          {filtered.length} of {dtcs.length} codes
        </span>

        {/* Actions — Dash0 Button component */}
        <Button
          size="sm"
          icon="ti-refresh"
          onClick={handleScan}
          disabled={connectionStatus !== 'connected'}
        >
          Scan
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon="ti-trash"
          onClick={handleClear}
          disabled={connectionStatus !== 'connected' || dtcs.length === 0}
        >
          Clear all
        </Button>
      </div>

      <ScrollPane>

        {/* ── Summary row ──────────────────────────────────────────────── */}
        {(activeDTCs > 0 || pendingDTCs > 0) && (
          <>
            {activeDTCs > 0 && (
              <AlertBanner
                message={`${activeDTCs} active fault${activeDTCs > 1 ? 's' : ''} — MIL (check engine light) is illuminated`}
                variant="crit"
              />
            )}
            {pendingDTCs > 0 && (
              <AlertBanner
                message={`${pendingDTCs} pending fault${pendingDTCs > 1 ? 's' : ''} — detected but not yet confirmed`}
                variant="warn"
              />
            )}
            {gmDTCs > 0 && (
              <AlertBanner
                message={`${gmDTCs} GM-specific code${gmDTCs > 1 ? 's' : ''} (B/U type) — body or network fault, check BCM and IPC modules`}
                variant="info"
              />
            )}
          </>
        )}

        {/* ── DTC list ─────────────────────────────────────────────────── */}
        <SectionHeader>
          {filtered.length > 0 ? `${filtered.length} diagnostic code${filtered.length > 1 ? 's' : ''}` : 'No codes matching filter'}
        </SectionHeader>

        {dtcs.length === 0 ? (
          <Card>
            <div style={{ padding: '24px 12px', textAlign: 'center' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 32, color: 'var(--sg)', display: 'block', marginBottom: 10 }} />
              <div style={{ fontSize: 14, color: 'var(--tw)', fontWeight: 500, marginBottom: 4 }}>No fault codes stored</div>
              <div style={{ fontSize: 12, color: 'var(--tm)' }}>
                {connectionStatus === 'connected' ? 'All systems normal. MIL is off.' : 'Connect the OBD adapter and run a scan.'}
              </div>
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'var(--tm)' }}>
              No codes match the current filter — clear the filter to see all {dtcs.length} codes
            </div>
          </Card>
        ) : (
          <Card padding={0}>
            {filtered.map(dtc => (
              <DTCRow
                key={dtc.code}
                dtc={dtc}
                expanded={expandedCode === dtc.code}
                onToggle={() => setExpandedCode(expandedCode === dtc.code ? null : dtc.code)}
                hasFreezeFrame={freezeFrameCodes.has(dtc.code)}
                onViewFreezeFrame={() => { setFreezeFrameFilter(dtc.code); setActiveScreen('freezeframes'); }}
              />
            ))}
          </Card>
        )}

        {/* ── Platform-specific code reference ─────────────────────────── */}
        {isGMT800 && (
          <>
            <SectionHeader>GMT800 known fault code reference</SectionHeader>
            <Card padding={0}>
              {[
                { code: 'B1982', mod: 'IPC',  desc: 'Device Power 2 Circuit Low — IPC power loss / parasitic draw', type: 'Body', severity: 'warn' as const },
                { code: 'U0100', mod: 'BCM',  desc: 'Lost communication with ECM/PCM — Class II bus fault', type: 'Network', severity: 'crit' as const },
                { code: 'U1000', mod: 'BCM',  desc: 'Class II communication fault — general bus disruption', type: 'Network', severity: 'warn' as const },
                { code: 'P0300', mod: 'PCM',  desc: 'Random/multiple cylinder misfire — distributor or plugs', type: 'Powertrain', severity: 'crit' as const },
                { code: 'P0446', mod: 'PCM',  desc: 'EVAP vent control circuit — canister purge fault', type: 'Powertrain', severity: 'warn' as const },
                { code: 'P0171', mod: 'PCM',  desc: 'System too lean, Bank 1 — vacuum leak or dirty MAF', type: 'Powertrain', severity: 'warn' as const },
                { code: 'P0174', mod: 'PCM',  desc: 'System too lean, Bank 2 — vacuum leak or dirty MAF', type: 'Powertrain', severity: 'warn' as const },
                { code: 'C0265', mod: 'EBCM', desc: 'EBCM relay circuit — ABS / electronic brake fault', type: 'Chassis', severity: 'warn' as const },
                { code: 'B0429', mod: 'BCM',  desc: 'Seat heater fault — heated seat circuit open', type: 'Body', severity: 'muted' as const },
              ].map(({ code, mod, desc, type, severity }, i, arr) => (
                <div
                  key={code}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--bg3)' : 'none',
                    background: dtcs.find(d => d.code === code) ? 'rgba(255,87,34,0.04)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dtcs.find(d => d.code === code) ? 'rgba(255,87,34,0.06)' : 'var(--bg4)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = dtcs.find(d => d.code === code) ? 'rgba(255,87,34,0.04)' : 'transparent'; }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono', 'Roboto Mono', monospace", fontSize: 12, color: 'var(--tm)', width: 44, flexShrink: 0 }}>{code}</span>
                  <span style={{
                    fontFamily: "'Inter', 'Roboto', system-ui, sans-serif", fontSize: 9,
                    letterSpacing: 1.2, textTransform: 'uppercase',
                    color: 'var(--tm)', width: 32, flexShrink: 0,
                  }}>{mod}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--tw)' }}>{desc}</span>
                  {dtcs.find(d => d.code === code) && <Badge label="Stored" variant="warn" />}
                  <Badge label={type} variant={severity} />
                </div>
              ))}
            </Card>
          </>
        )}

      </ScrollPane>
    </div>
  );
}
