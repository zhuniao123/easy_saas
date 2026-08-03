import { describe, expect, test } from 'vitest';
import {
  colSpanClass,
  normalizeDashboardLayout,
  partitionLayoutCodes,
} from './layoutTypes';

describe('normalizeDashboardLayout', () => {
  test('returns undefined for empty input', () => {
    expect(normalizeDashboardLayout(null)).toBeUndefined();
    expect(normalizeDashboardLayout({})).toBeUndefined();
    expect(normalizeDashboardLayout({ rows: [] })).toBeUndefined();
  });

  test('normalizes rows / cols / span / section', () => {
    const layout = normalizeDashboardLayout({
      type: 'dashboard',
      gap: 20,
      rows: [
        {
          cols: [
            { span: 4, components: ['kpi_a'], section: { title: 'A', refreshable: true } },
            { span: 99, componentCode: 'kpi_b', title: 'B' },
          ],
        },
        {
          columns: [{ span: 12, components: ['grid'] }],
        },
      ],
    });
    expect(layout?.type).toBe('dashboard');
    expect(layout?.gap).toBe(20);
    expect(layout?.rows).toHaveLength(2);
    expect(layout?.rows[0].cols[0]).toMatchObject({
      span: 4,
      components: ['kpi_a'],
      section: { title: 'A', refreshable: true },
    });
    expect(layout?.rows[0].cols[1].span).toBe(12); // clamped
    expect(layout?.rows[0].cols[1].components).toEqual(['kpi_b']);
    expect(layout?.rows[0].cols[1].section?.title).toBe('B');
    expect(layout?.rows[1].cols[0].components).toEqual(['grid']);
  });

  test('skips cols without component codes', () => {
    const layout = normalizeDashboardLayout({
      rows: [{ cols: [{ span: 6 }, { span: 6, components: ['x'] }] }],
    });
    expect(layout?.rows[0].cols).toHaveLength(1);
    expect(layout?.rows[0].cols[0].components).toEqual(['x']);
  });
});

describe('colSpanClass', () => {
  test('maps 1-12 and defaults', () => {
    expect(colSpanClass(4)).toBe('col-span-4');
    expect(colSpanClass(12)).toBe('col-span-12');
    expect(colSpanClass(undefined)).toBe('col-span-12');
  });
});

describe('partitionLayoutCodes', () => {
  test('finds orphans not referenced by layout', () => {
    const layout = normalizeDashboardLayout({
      rows: [{ cols: [{ span: 12, components: ['a', 'b'] }] }],
    })!;
    const { placed, orphans } = partitionLayoutCodes(layout, ['a', 'b', 'c']);
    expect([...placed].sort()).toEqual(['a', 'b']);
    expect(orphans).toEqual(['c']);
  });
});
