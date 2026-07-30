import { describe, expect, test } from 'vitest';
import { buildChartModel, dataTableToPoints, formatChartValue } from './bindings';
import { chartModelToEchartsOption } from './EChartsAdapter';
import type { DataTable } from '../dataTable';

const sampleTable: DataTable = {
  columns: [
    { field: 'day', label: 'Day', type: 'string' },
    { field: 'amount', label: 'Amount', type: 'number' },
  ],
  rows: [
    { day: 'Mon', amount: 10 },
    { day: 'Tue', amount: 20 },
    { day: 'Wed', amount: 15 },
  ],
  total: 3,
};

describe('chart bindings', () => {
  test('projects DataTable via column bindings', () => {
    const points = dataTableToPoints(sampleTable, { category: 'day', value: 'amount' });
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ name: 'Mon', value: 10 });
    expect(points[1].value).toBe(20);
  });

  test('buildChartModel supports bar and stat', () => {
    const bar = buildChartModel({
      kind: 'barChart',
      data: sampleTable,
      bindings: { category: 'day', value: 'amount' },
      properties: { title: 'Revenue' },
    });
    expect(bar.points).toHaveLength(3);
    expect(bar.title).toBe('Revenue');

    const stat = buildChartModel({
      kind: 'stat',
      data: {
        columns: [{ field: 'total', label: 'Total', type: 'number' }],
        rows: [{ total: 1234 }],
      },
      bindings: { value: 'total' },
      properties: { format: 'number', title: 'Today' },
    });
    expect(stat.displayText).toContain('1');
  });

  test('echarts option maps bar series', () => {
    const model = buildChartModel({
      kind: 'barChart',
      data: sampleTable,
      bindings: { category: 'day', value: 'amount' },
    });
    const option = chartModelToEchartsOption(model);
    expect(option.series).toBeDefined();
    const series = option.series as Array<{ type: string; data: number[] }>;
    expect(series[0].type).toBe('bar');
    expect(series[0].data).toEqual([10, 20, 15]);
  });

  test('formatChartValue money/percent', () => {
    expect(formatChartValue(0.125, 'percent')).toContain('12.5');
    expect(formatChartValue(12.5, 'money')).toBeTruthy();
  });

  test('same bindings work when only query rows change', () => {
    const bindings = { category: 'day', value: 'amount' };
    const a = dataTableToPoints(sampleTable, bindings);
    const b = dataTableToPoints(
      {
        ...sampleTable,
        rows: [{ day: 'Thu', amount: 99 }],
      },
      bindings,
    );
    expect(a[0].name).toBe('Mon');
    expect(b[0]).toMatchObject({ name: 'Thu', value: 99 });
  });
});
