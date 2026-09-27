import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { PID_CATALOG } from '../../core/pidCatalog';
import { PIDCategory } from '../../shared/types';
import { ScrollPane, SectionHeader, Card, Badge, Button, DataRow, EmptyState } from '../components/layout/UIComponents';
import { TYPE, NUMERIC, WEIGHT } from '../theme/theme';

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PIDCategory, string> = {
  engine:          'Engine',
  fuel:            'Fuel system',
  temperature:     'Temperature',
  electrical:      'Electrical',
  oxygen_sensors:  'O2 sensors',
  transmission:    'Transmission',
  emissions:       'Emissions',
  body_network:    'Body / Network',
  gm_enhanced:     'GM Enhanced',
};

const CATEGORY_ORDER: PIDCategory[] = [
  'engine', 'fuel', 'temperature', 'electrical',
  'oxygen_sensors', 'transmission', 'emissions', 'body_network', 'gm_enhanced',
];

// ─── PIDRow ───────────────────────────────────────────────────────────────────

function PIDRow({ pid, liveValue, onExpand, expanded }: {
  pid: (typeof PID_CATALOG)[0];
  liveValue: number | string | undefined;
  onExpand: () => void;
  expanded: boolean;
}): React.ReactElement {
  const hasLive = liveValue !== undefined;
  const valStr  = hasLive ? pid.format(liveValue as any) : '—';

  return (
    <div>
      <DataRow
        pid={pid.pid}
        name={pid.shortName}
        subtext={`${pid.name} · ${pid.unit}`}
        value={valStr}
        badge={
          <>
            <Badge label={hasLive ? 'Live' : 'No data'} variant={hasLive ? 'ok' : 'muted'} />
            <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 13, color: 'var(--label-3)' }} aria-hidden />
          </>
        }
        onClick={onExpand}
      />

      {/* Expanded detail */}
      {expanded && (
        <div style={{ background: 'var(--fill)', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 220px', gap: 20 }}>
          <div>
            <div style={{ ...TYPE.body, fontWeight: WEIGHT.medium, color: 'var(--label)', marginBottom: 6 }}>{pid.name}</div>
            <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginBottom: 10 }}>{pid.description}</div>
            {pid.formula && (
              <div style={{
                ...TYPE.caption, ...NUMERIC, color: 'var(--accent-text)',
                background: 'var(--fill-strong)', padding: '5px 8px', borderRadius: 6, display: 'inline-block',
              }}>
                {pid.formula}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 3 }}>Range</div>
              <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--label)' }}>
                {pid.min} – {pid.max} {pid.unit}
              </span>
            </div>
            {pid.warnHigh !== undefined && (
              <div>
                <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 3 }}>Warning threshold</div>
                <span style={{ ...TYPE.body, ...NUMERIC, color: 'var(--warn-text)' }}>
                  {pid.warnHigh !== undefined && `High: ${pid.warnHigh}`}
                  {pid.warnLow  !== undefined && ` · Low: ${pid.warnLow}`}
                </span>
              </div>
            )}
            <div>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', marginBottom: 3 }}>Live value</div>
              <span style={{ ...TYPE.title3, ...NUMERIC, color: hasLive ? 'var(--label)' : 'var(--label-3)' }}>
                {valStr}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AllPIDsScreen ────────────────────────────────────────────────────────────

export function AllPIDsScreen(): React.ReactElement {
  const liveData = useAppStore(s => s.liveData);

  const [search,          setSearch]          = useState('');
  const [filterCategory,  setFilterCategory]  = useState<PIDCategory | 'ALL'>('ALL');
  const [showLiveOnly,    setShowLiveOnly]     = useState(false);
  const [expandedPID,     setExpandedPID]      = useState<string | null>(null);

  const filtered = useMemo(() => {
    return PID_CATALOG.filter(p => {
      if (filterCategory !== 'ALL' && p.category !== filterCategory) return false;
      if (showLiveOnly && !liveData[p.pid]) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.pid.toLowerCase().includes(q) &&
            !p.name.toLowerCase().includes(q) &&
            !p.shortName.toLowerCase().includes(q) &&
            !p.unit.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, filterCategory, showLiveOnly, liveData]);

  const liveCount = PID_CATALOG.filter(p => liveData[p.pid]).length;

  // Group by category for the filtered list
  const grouped = useMemo(() => {
    const groups: Partial<Record<PIDCategory, typeof PID_CATALOG>> = {};
    for (const pid of filtered) {
      if (!groups[pid.category]) groups[pid.category] = [];
      groups[pid.category]!.push(pid);
    }
    return groups;
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 12px', background: 'var(--grouped)',
        boxShadow: 'inset 0 -1px 0 var(--separator)',
        flexShrink: 0,
      }}>
        <input
          type="text"
          placeholder="Search PID, name, or unit…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 220, height: 28 }}
        />

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as PIDCategory | 'ALL')}
          style={{ height: 28 }}
        >
          <option value="ALL">All categories</option>
          {CATEGORY_ORDER.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, ...TYPE.body, color: 'var(--label-2)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showLiveOnly}
            onChange={e => setShowLiveOnly(e.target.checked)}
          />
          Live data only
        </label>

        <div style={{ flex: 1 }} />

        <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
          {liveCount} live · {filtered.length} shown · {PID_CATALOG.length} total
        </span>

        {search || filterCategory !== 'ALL' || showLiveOnly ? (
          <Button
            size="sm"
            icon="ti-x"
            onClick={() => { setSearch(''); setFilterCategory('ALL'); setShowLiveOnly(false); }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {/* ── PID list ─────────────────────────────────────────────────────── */}
      <ScrollPane>
        {filtered.length === 0 ? (
          <Card>
            <EmptyState icon="ti-filter-off" title="No matching PIDs" message="No PIDs match the current filter — clear it to see the full catalog." />
          </Card>
        ) : (
          CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
            <div key={cat}>
              <SectionHeader>
                {`${CATEGORY_LABELS[cat]} — ${grouped[cat]?.length} PID${grouped[cat]!.length > 1 ? 's' : ''} · ${grouped[cat]?.filter(p => liveData[p.pid]).length} live`}
              </SectionHeader>
              <Card padding={0}>
                {grouped[cat]!.map(pid => (
                  <PIDRow
                    key={pid.pid}
                    pid={pid}
                    liveValue={liveData[pid.pid]?.value}
                    expanded={expandedPID === pid.pid}
                    onExpand={() => setExpandedPID(expandedPID === pid.pid ? null : pid.pid)}
                  />
                ))}
              </Card>
            </div>
          ))
        )}
      </ScrollPane>
    </div>
  );
}
