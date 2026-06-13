import React from 'react';
import { Card, ScrollPane, SectionHeader } from './UIComponents';

// Phase 4 — Parasitic Draw Suite
// Full implementation: voltage timeline chart, module sleep watcher, fuse map,
// step-by-step protocol, and GMT800 knowledge base.

export function ParasiteScreen(): React.ReactElement {
  return (
    <ScrollPane>
      <SectionHeader>Parasitic draw analysis — Phase 4</SectionHeader>
      <Card>
        <div style={{ padding: '20px 12px', textAlign: 'center' }}>
          <i className="ti ti-bug" style={{ fontSize: 32, color: 'var(--pp)', display: 'block', marginBottom: 10 }} />
          <div style={{ fontSize: 14, color: 'var(--tw)', fontWeight: 500, marginBottom: 6 }}>
            Parasitic Draw Suite — Coming in Phase 4
          </div>
          <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.7, maxWidth: 500, margin: '0 auto' }}>
            This screen will include: battery voltage timeline chart (8h window),
            module sleep watcher with bus activity waveforms, interactive 2004 Silverado
            fuse panel map, 14-step guided parasitic draw protocol with pass/fail toggles,
            and the GMT800 knowledge base with known culprit components and fixes.
          </div>
        </div>
      </Card>
    </ScrollPane>
  );
}
