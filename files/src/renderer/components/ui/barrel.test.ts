import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as UI from '../layout/UIComponents';

test('barrel exports the new components and no legacy wrappers', () => {
  for (const name of ['Grid', 'ScrollPane', 'SectionHeader', 'Card', 'Tooltip', 'TipContent', 'Badge', 'AlertBanner',
    'DataRow', 'Button', 'Sparkline', 'Metric', 'Gauge', 'SegmentedControl', 'EmptyState', 'Divider']) {
    assert.equal(typeof (UI as Record<string, unknown>)[name], 'function', name);
  }
  for (const gone of ['MetricTile', 'HeroCard', 'DenseMetricTile', 'ArcGauge', 'CompactArcGauge', 'WaveBar', 'StatusBar']) {
    assert.equal((UI as Record<string, unknown>)[gone], undefined, gone);
  }
});
