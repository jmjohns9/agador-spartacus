import React from 'react';
import { useAppStore } from '../store/appStore';
import { Card, ScrollPane, SectionHeader, Badge } from '../components/layout/UIComponents';

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
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 4,
            background: 'rgba(255,128,0,0.08)', border: '1px solid rgba(255,128,0,0.25)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <i className="ti ti-bug" style={{ fontSize: 24, color: 'var(--pp)' }} />
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700,
            fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase',
            color: 'var(--tw)', marginBottom: 8,
          }}>
            Parasitic Draw Suite — Coming in Phase 4
          </div>
          <div style={{
            fontSize: 11, color: 'var(--tm)', lineHeight: 1.7,
            maxWidth: 500, margin: '0 auto',
          }}>
            This screen will include: battery voltage timeline chart (8h window),
            module sleep watcher with bus activity waveforms, interactive vehicle
            fuse panel map, a {checklist.length}-step guided parasitic draw protocol with
            pass/fail toggles, and the platform knowledge base with known culprit
            components and fixes.
          </div>
          <div style={{
            marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              fontSize: 9, color: 'var(--tm)',
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: 1.2, textTransform: 'uppercase',
            }}>
              Detected platform
            </span>
            <Badge label={platform.name} variant="info" />
          </div>
          {platform.id === 'generic' && (
            <div style={{
              fontSize: 10, color: 'var(--tm)', marginTop: 8,
              fontStyle: 'italic',
            }}>
              Set the vehicle profile on the Connect screen for platform-specific fuse maps and culprits.
            </div>
          )}
        </div>
      </Card>
    </ScrollPane>
  );
}
