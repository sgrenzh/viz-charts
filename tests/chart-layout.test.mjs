import test from 'node:test';
import assert from 'node:assert/strict';
import { chartLayout } from '../lib/charts.js';

const base = { version: 1, title: 'Test', labels: ['A', 'B'], series: [{ name: 'Value', values: [2, 5] }] };
const items = [{ label: 'A', value: 2 }, { label: 'B', value: 5 }];
const cases = [
  ['column', { ...base, type: 'column' }, 'B'],
  ['stacked column', { ...base, type: 'column', stacked: true, series: [...base.series, { name: 'Other', values: [1, 3] }] }, 'B'],
  ['range column', { version: 1, title: 'Test', type: 'range-column', labels: ['A', 'B'], ranges: [{ low: 1, high: 2 }, { low: 3, high: 5 }] }, 'B'],
  ['line', { ...base, type: 'line' }, 'B'],
  ['line and column', { ...base, type: 'line-column', series: [...base.series, { name: 'Volume', values: [10, 20] }] }, 'B'],
  ['heatmap', { version: 1, title: 'Test', type: 'heatmap', days: [{ date: '2024-01-01', value: 2 }, { date: '2024-01-02', value: 5 }] }, '2024'],
  ['strip', { version: 1, title: 'Test', type: 'strip', items }, 'B'],
  ['segmented strip', { version: 1, title: 'Test', type: 'strip', items, segmented: true, capacity: 10 }, 'B'],
  ['donut', { version: 1, title: 'Test', type: 'donut', items, selected: 1 }, 'B'],
];
for (const [name, config, expected] of cases) {
  test(`${name}: finite marks and accessible data at narrow and wide widths`, () => {
    for (const width of [320, 800]) {
      const layout = chartLayout(config, width);
      assert.ok(layout.shapes.length > 0);
      assert.ok(layout.marks.length > 0);
      assert.ok(layout.marks.some(mark => mark.label.includes(expected)));
      for (const mark of layout.marks) {
        assert.ok(Number.isFinite(mark.x) && Number.isFinite(mark.y));
        assert.ok(mark.values.length > 0);
      }
    }
  });
}
