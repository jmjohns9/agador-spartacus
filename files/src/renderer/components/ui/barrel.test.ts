import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as UI from '../layout/UIComponents';

test('barrel keeps every legacy export and adds the new ones', () => {
  const expected = [
    'Grid', 'ScrollPane', 'SectionHeader', 'Card', 'MetricTile', 'ArcGauge', 'Tooltip', 'TipContent',
    'Badge', 'AlertBanner', 'DataRow', 'Button', 'WaveBar', 'Sparkline', 'HeroCard', 'DenseMetricTile',
    'CompactArcGauge', 'StatusBar',
    'Metric', 'Gauge', 'SegmentedControl', 'EmptyState', 'Divider',
  ];
  for (const name of expected) assert.equal(typeof (UI as Record<string, unknown>)[name], 'function', name);
});
