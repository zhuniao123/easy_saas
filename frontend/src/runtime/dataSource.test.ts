import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  buildSqlDataSourceSpec,
  ensureDefaultDataSourceProviders,
  getDataSourceProvider,
  registerDataSourceProvider,
  registeredDataSourceTypes,
  resolveDataSource,
  type DataSourceProvider,
} from './dataSource';
import { normalizeDataTable } from './dataTable';

beforeEach(() => {
  ensureDefaultDataSourceProviders();
});

describe('DataTable contract', () => {
  test('normalizeDataTable fills defaults', () => {
    const table = normalizeDataTable({
      columns: [{ field: 'id', label: 'ID' }],
      rows: [{ id: 1 }],
    });
    expect(table.total).toBe(1);
    expect(table.columns[0].type).toBe('string');
    expect(table.metadata).toEqual({});
  });
});

describe('DataSource registry', () => {
  test('registers sql static cache by default', () => {
    expect(registeredDataSourceTypes()).toEqual(expect.arrayContaining(['sql', 'static', 'cache']));
  });

  test('static provider resolves without network when API unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const table = await resolveDataSource({
      type: 'static',
      params: { _page: 1, _pageSize: 1 },
      options: {
        rows: [
          { code: 'A', name: 'Alpha' },
          { code: 'B', name: 'Beta' },
        ],
      },
    });
    expect(table.total).toBe(2);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].code).toBe('A');
    expect(table.metadata?.provider).toBe('static');
  });

  test('cache provider is reserved', async () => {
    await expect(resolveDataSource({ type: 'cache', cacheKey: 'x' })).rejects.toThrow(/not implemented/);
  });

  test('sql provider uses resolve API when available', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        columns: [{ field: 'n', label: 'n', type: 'integer' }],
        rows: [{ n: 3 }],
        total: 1,
        metadata: { provider: 'sql' },
      }),
    } as Response);

    const table = await resolveDataSource(
      buildSqlDataSourceSpec('q_demo', { _page: 1 }, []),
    );
    expect(table.rows[0].n).toBe(3);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/datasources/resolve',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('new provider type does not require Smart Grid changes', async () => {
    const mock: DataSourceProvider = {
      type: 'fixture',
      async resolve() {
        return {
          columns: [{ field: 'x', label: 'X', type: 'string' }],
          rows: [{ x: 'ok' }],
          total: 1,
          metadata: { provider: 'fixture' },
        };
      },
    };
    registerDataSourceProvider(mock);
    expect(getDataSourceProvider('fixture').type).toBe('fixture');
    const table = await resolveDataSource({ type: 'fixture' });
    expect(table.rows[0].x).toBe('ok');
  });
});
