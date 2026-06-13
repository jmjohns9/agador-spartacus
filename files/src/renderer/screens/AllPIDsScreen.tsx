import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { PID_CATALOG } from '../../core/pidCatalog';
import { PIDCategory } from '../../shared/types';
import { ScrollPane, SectionHeader, Card, Badge } from '../components/layout/UIComponents';

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

const CATEGORY_COLORS: Record<PIDCategory, string> = {
  engine:          'var(--pp)',
  fuel:            'var(--sa)',
  temperature:     'var(--sr)',
  electrical:      'var(--gb)',
  oxygen_sensors:  'var(--sg)',
  transmission:    'var(--pp)',
  emissions:       'var(--tm)',
  body_network:    'var(--gb)',
  gm_enhanced:     'var(--sa)',
};

// ─── PIDRow ───────────────────────────────────────────────────────────────────

function PIDRow({ pid, liveValue, onExpand, expanded }: {
  pid: (typeof PID_CATALOG)[0];
  liveValue: number | string | undefined;
  onExpand: () => void;
  expanded: boolean;
}): React.ReactElement {
  const hasLive  = liveValue !== undefined;
  const valStr   = hasLive ? pid.format(liveValue as any) : '—';
  const catColor = CATEGORY_COLORS[pid.category];

  return (
    <div style={{ borderBottom: '1px solid var(--bg3)' }}>
      <div
        onClick={onExpand}
        style={{
          display: 'grid',
          gridTemplateColumns: '52px 90px 1fr 90px 120px 30px',
          alignItems: 'center', gap: 6,
          padding: '7px 12px', cursor: 'pointer',
          background: expanded ? 'var(--bg3)' : 'transparent',
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* PID code */}
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: catColor }}>
          {pid.pid}
        </span>

        {/* Category badge */}
        <span style={{ fontSize: 10, color: catColor, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {CATEGORY_LABELS[pid.category]}
        </span>

        {/* Name */}
        <span style={{ fontSize: 12, color: 'var(--tw)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pid.shortName}
        </span>

        {/* Unit */}
        <span style={{ fontSize: 11, color: 'var(--tm)', fontFamily: "'JetBrains Mono', monospace" }}>
          {pid.unit}
        </span>

        {/* Live value */}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
          color: hasLive ? 'var(--tw)' : 'var(--bs)',
          textAlign: 'right',
        }}>
          {valStr}
        </span>

        <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 12, color: 'var(--tm)', textAlign: 'right' }} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ background: 'var(--bg4)', borderTop: '1px solid var(--bg3)', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 220px', gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--tw)', fontWeight: 500, marginBottom: 6 }}>{pid.name}</div>
            <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.6, marginBottom: 10 }}>{pid.description}</div>
            {pid.formula && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--pp)', background: 'var(--bg3)', padding: '5px 8px', borderRadius: 2, display: 'inline-block' }}>
                {pid.formula}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>Range</div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tw)' }}>
                {pid.min} – {pid.max} {pid.unit}
              </span>
            </div>
            {pid.warnHigh !== undefined && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>Warning threshold</div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--sa)' }}>
                  {pid.warnHigh !== undefined && `High: ${pid.warnHigh}`}
                  {pid.warnLow  !== undefined && ` · Low: ${pid.warnLow}`}
                </span>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>Live value</div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: hasLive ? catColor : 'var(--bs)' }}>
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
        padding: '7px 10px', background: 'var(--bg3)', borderBottom: '1px solid var(--br)',
        flexShrink: 0,
      }}>
        <input
          type="text"
          placeholder="Search PID, name, or unit…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '4px 8px', fontSize: 12, width: 220, height: 28 }}
        />

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as PIDCategory | 'ALL')}
          style={{ padding: '4px 6px', fontSize: 12, height: 28 }}
        >
          <option value="ALL">All categories</option>
          {CATEGORY_ORDER.map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--tm)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showLiveOnly}
            onChange={e => setShowLiveOnly(e.target.checked)}
            style={{ accentColor: 'var(--pp)' }}
          />
          Live data only
        </label>

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tm)' }}>
          {liveCount} live · {filtered.length} shown · {PID_CATALOG.length} total
        </span>

        {search || filterCategory !== 'ALL' || showLiveOnly ? (
          <button
            onClick={() => { setSearch(''); setFilterCategory('ALL'); setShowLiveOnly(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg4)', border: '1px solid var(--br)', borderRadius: 2, padding: '0 8px', height: 28, cursor: 'pointer', color: 'var(--tm)', fontSize: 12 }}
          >
            <i className="ti ti-x" style={{ fontSize: 12 }} />
            Clear filters
          </button>
        ) : null}
      </div>

      {/* ── Column headers ───────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '52px 90px 1fr 90px 120px 30px',
        gap: 6, padding: '5px 12px',
        background: 'var(--bg4)', borderBottom: '1px solid var(--br)',
        flexShrink: 0,
      }}>
        {['PID', 'Category', 'Parameter', 'Unit', 'Live value', ''].map(h => (
          <span key={h} style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {h}
          </span>
        ))}
      </div>

      {/* ── PID list ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--br) transparent' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', fontSize: 12, color: 'var(--tm)' }}>
            No PIDs match the current filter
          </div>
        ) : (
          CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
            <div key={cat}>
              {/* Category subheader */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', background: 'var(--bg3)', borderBottom: '1px solid var(--br)',
                position: 'sticky', top: 0, zIndex: 2,
              }}>
                <div style={{ width: 3, height: 12, background: CATEGORY_COLORS[cat], borderRadius: 1, flexShrink: 0 }} />
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: 1.5, color: CATEGORY_COLORS[cat], textTransform: 'uppercase' }}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--tm)', marginLeft: 4 }}>
                  {grouped[cat]?.length} PIDs · {grouped[cat]?.filter(p => liveData[p.pid]).length} live
                </span>
              </div>

              {grouped[cat]!.map(pid => (
                <PIDRow
                  key={pid.pid}
                  pid={pid}
                  liveValue={liveData[pid.pid]?.value}
                  expanded={expandedPID === pid.pid}
                  onExpand={() => setExpandedPID(expandedPID === pid.pid ? null : pid.pid)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
