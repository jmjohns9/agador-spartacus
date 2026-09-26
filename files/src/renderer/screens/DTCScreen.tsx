import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { DTCCode, DTCType, DTCStatus, FreezeFrame } from '../../shared/types';
import {
  ScrollPane, SectionHeader, Card, Badge, AlertBanner, Button, Divider, EmptyState,
} from '../components/layout/UIComponents';
import { TYPE, NUMERIC, WEIGHT } from '../theme/theme';

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

  const dotColor = dtc.status === 'active' ? 'var(--crit)' : dtc.status === 'pending' ? 'var(--warn)' : 'var(--label-4)';
  const codeColor = dtc.status === 'active' ? 'var(--crit-text)' : 'var(--label)';

  return (
    <div>
      {/* Summary row */}
      <div
        onClick={onToggle}
        className={expanded ? undefined : 'row-hover'}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', cursor: 'pointer',
          background: expanded ? 'var(--fill)' : 'transparent',
        }}
      >
        {/* Status dot */}
        <span
          aria-hidden
          className={dtc.status === 'active' ? 'pulse' : undefined}
          style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotColor }}
        />

        {/* Code */}
        <span style={{ ...TYPE.body, ...NUMERIC, fontWeight: WEIGHT.medium, color: codeColor, width: 54, flexShrink: 0 }}>
          {dtc.code}
        </span>

        {/* Description */}
        <span style={{ ...TYPE.body, color: 'var(--label)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dtc.description}
        </span>

        {/* Module */}
        <span style={{ ...TYPE.caption, color: 'var(--label-3)', width: 40, flexShrink: 0 }}>
          {dtc.module}
        </span>

        {/* Badges */}
        <Badge label={TYPE_LABELS[dtc.type]} variant={TYPE_VARIANT[dtc.type]} />
        <Badge label={dtc.status} variant={STATUS_VARIANT[dtc.status]} />

        {/* Last seen */}
        <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)', width: 50, textAlign: 'right', flexShrink: 0 }}>
          {ago(dtc.lastSeen)}
        </span>

        <Button
          variant="plain"
          size="sm"
          icon="ti-camera"
          title={hasFreezeFrame ? 'View freeze frame' : 'No freeze frame captured yet'}
          disabled={!hasFreezeFrame}
          onClick={e => { e.stopPropagation(); onViewFreezeFrame(); }}
        />
        <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 13, color: 'var(--label-3)', flexShrink: 0 }} />
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{ background: 'var(--fill)', padding: '12px 16px', display: 'flex', gap: 24 }}>

          {/* Left: causes + repair (CarsXE enriched when available) */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {carsxe.state === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...TYPE.caption, color: 'var(--label-2)', marginBottom: 10 }}>
                <i className="ti ti-loader-2" style={{ fontSize: 13 }} />
                Looking up {dtc.code} via CarsXE…
              </div>
            )}

            {carsxe.state === 'ok' && carsxe.description && (
              <>
                <SectionHeader>CarsXE definition</SectionHeader>
                <div style={{ ...TYPE.body, color: 'var(--label)', marginTop: 4, marginBottom: 10 }}>{carsxe.description}</div>
              </>
            )}

            <SectionHeader>
              {carsxe.state === 'ok' && carsxe.causes.length > 0 ? 'CarsXE — likely causes' : 'Likely causes'}
            </SectionHeader>
            <ol style={{ paddingLeft: 16, margin: '8px 0 0' }}>
              {(carsxe.state === 'ok' && carsxe.causes.length > 0 ? carsxe.causes : dtc.likelyCauses).map((c, i) => (
                <li key={i} style={{ ...TYPE.body, color: 'var(--label)', marginBottom: 4 }}>{c}</li>
              ))}
            </ol>

            <div style={{ marginTop: 12 }}>
              <SectionHeader>
                {carsxe.state === 'ok' && carsxe.repair ? 'CarsXE — tech notes' : 'Repair procedure'}
              </SectionHeader>
            </div>
            <div style={{ ...TYPE.body, color: 'var(--label)', marginTop: 6 }}>
              {carsxe.state === 'ok' && carsxe.repair ? carsxe.repair : dtc.repairSummary}
            </div>

            {carsxe.state === 'no-key' && (
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginTop: 10 }}>
                Set CARSXE_API_KEY to enable live DTC lookup
              </div>
            )}
            {carsxe.state === 'error' && (
              <div style={{ ...TYPE.caption, color: 'var(--warn-text)', marginTop: 10 }}>CarsXE: {carsxe.error}</div>
            )}
          </div>

          {/* Right: metadata */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 160 }}>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 3 }}>Code</div>
              <span style={{ ...TYPE.headline, ...NUMERIC, color: 'var(--accent-text)' }}>{dtc.code}</span>
            </div>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 3 }}>Module</div>
              <span style={{ ...TYPE.body, color: 'var(--label)' }}>{dtc.module}</span>
            </div>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 3 }}>First seen</div>
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>
                {new Date(dtc.firstSeen).toLocaleTimeString()}
              </span>
            </div>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 3 }}>Last seen</div>
              <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label)' }}>
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

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: 'var(--grouped)',
        boxShadow: 'inset 0 -1px 0 var(--separator)',
        flexShrink: 0,
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 220, height: 28 }}
        />

        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as DTCType | 'ALL')}
          style={{ height: 28 }}
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
          style={{ height: 28 }}
        >
          <option value="ALL">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="permanent">Permanent</option>
          <option value="historical">Historical</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Counters */}
        <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
          {filtered.length} of {dtcs.length} codes
        </span>

        {/* Actions */}
        <Button
          size="sm"
          icon="ti-refresh"
          onClick={handleScan}
          disabled={connectionStatus !== 'connected'}
        >
          Scan
        </Button>
        <Button
          variant="destructive"
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
            <EmptyState icon="ti-circle-check" title="No fault codes" message="Run a scan to read stored, pending and permanent codes." />
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon="ti-filter-off"
              title="No matching codes"
              message={`No codes match the current filter — clear it to see all ${dtcs.length} codes.`}
            />
          </Card>
        ) : (
          <Card padding={0}>
            {filtered.map((dtc, i) => (
              <React.Fragment key={dtc.code}>
                <DTCRow
                  dtc={dtc}
                  expanded={expandedCode === dtc.code}
                  onToggle={() => setExpandedCode(expandedCode === dtc.code ? null : dtc.code)}
                  hasFreezeFrame={freezeFrameCodes.has(dtc.code)}
                  onViewFreezeFrame={() => { setFreezeFrameFilter(dtc.code); setActiveScreen('freezeframes'); }}
                />
                {i < filtered.length - 1 && <Divider />}
              </React.Fragment>
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
              ].map(({ code, mod, desc, type, severity }, i, arr) => {
                const stored = dtcs.some(d => d.code === code);
                return (
                  <React.Fragment key={code}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      background: stored ? 'var(--warn-tint)' : 'transparent',
                    }}>
                      <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-3)', width: 48, flexShrink: 0 }}>{code}</span>
                      <span style={{ ...TYPE.caption, color: 'var(--label-3)', width: 36, flexShrink: 0 }}>{mod}</span>
                      <span style={{ ...TYPE.body, color: 'var(--label)', flex: 1 }}>{desc}</span>
                      {stored && <Badge label="Stored" variant="warn" />}
                      <Badge label={type} variant={severity} />
                    </div>
                    {i < arr.length - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
            </Card>
          </>
        )}

      </ScrollPane>
    </div>
  );
}
