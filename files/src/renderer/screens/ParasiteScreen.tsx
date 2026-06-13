import React from 'react';
import { useAppStore } from '../store/appStore';
import { Card, ScrollPane, SectionHeader } from '../components/layout/UIComponents';

// Phase 4 — Parasitic Draw Suite
// Full implementation: voltage timeline chart, module sleep watcher, fuse map,
// step-by-step protocol, and platform-specific knowledge base.

export function ParasiteScreen(): React.ReactElement {
  const platform = useAppStore(s => s.platform);
  const checklist = useAppStore(s => s.checklist);

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
            module sleep watcher with bus activity waveforms, interactive vehicle
            fuse panel map, a {checklist.length}-step guided parasitic draw protocol with
            pass/fail toggles, and the platform knowledge base with known culprit
            components and fixes.
          </div>
          <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 12 }}>
            Detected platform: <span style={{ color: 'var(--gb)' }}>{platform.name}</span>
            {platform.id === 'generic' && ' — set the vehicle profile on the Connect screen for platform-specific fuse maps and culprits.'}
          </div>
        </div>
      </Card>
    </ScrollPane>
  );
}
