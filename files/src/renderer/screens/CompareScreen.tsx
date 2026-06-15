import React from 'react';
import { Card, ScrollPane, SectionHeader, Badge } from '../components/layout/UIComponents';

// Phase 5 — Session Compare

export function CompareScreen(): React.ReactElement {
  return (
    <ScrollPane>
      <SectionHeader>Live vs historic compare — Phase 5</SectionHeader>
      <Card>
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 4,
            background: 'rgba(0,144,208,0.08)', border: '1px solid rgba(0,144,208,0.25)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <i className="ti ti-chart-arrows-vertical" style={{ fontSize: 24, color: 'var(--gb)' }} />
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase',
            color: 'var(--tw)', marginBottom: 8,
          }}>
            Session Compare — Coming in Phase 5
          </div>
          <div style={{
            fontSize: 11, color: 'var(--tm)', lineHeight: 1.7,
            maxWidth: 500, margin: '0 auto',
          }}>
            Overlay live session data against saved historical sessions. Compare voltage timelines,
            fuel trims, and module states before and after a repair to verify the fix.
          </div>
          <div style={{ marginTop: 14 }}>
            <Badge label="Phase 5" variant="muted" />
          </div>
        </div>
      </Card>
    </ScrollPane>
  );
}
