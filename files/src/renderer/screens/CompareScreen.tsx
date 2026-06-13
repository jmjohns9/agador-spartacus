import React from 'react';
import { Card, ScrollPane, SectionHeader } from '../components/layout/UIComponents';

// Phase 5 — Session Compare

export function CompareScreen(): React.ReactElement {
  return (
    <ScrollPane>
      <SectionHeader>Live vs historic compare — Phase 5</SectionHeader>
      <Card>
        <div style={{ padding: '20px 12px', textAlign: 'center' }}>
          <i className="ti ti-chart-arrows-vertical" style={{ fontSize: 32, color: 'var(--gb)', display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 14, color: 'var(--tw)', fontWeight: 500, marginBottom: 6 }}>
            Session Compare — Coming in Phase 5
          </div>
          <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.7, maxWidth: 500, margin: '0 auto' }}>
            Overlay live session data against saved historical sessions. Compare voltage timelines,
            fuel trims, and module states before and after a repair to verify the fix.
          </div>
        </div>
      </Card>
    </ScrollPane>
  );
}
