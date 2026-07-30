/**
 * Pluggable component data sources. Smart Grid resolves data via the registry
 * and must not switch on provider type for new kinds.
 */

import { emptyDataTable, normalizeDataTable, type DataTable } from './dataTable';

export interface DataSourceSpec {
  type: string;
  queryCode?: string;
  cacheKey?: string;
  params?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface DataSourceProvider {
  type: string;
  resolve: (spec: DataSourceSpec) => Promise<DataTable>;
}

const providers = new Map<string, DataSourceProvider>();

export function registerDataSourceProvider(provider: DataSourceProvider): void {
  if (!provider?.type) {
    throw new Error('DataSourceProvider.type is required');
  }
  providers.set(provider.type.trim().toLowerCase(), provider);
}

export function getDataSourceProvider(type: string): DataSourceProvider {
  const key = (type || 'sql').trim().toLowerCase();
  const provider = providers.get(key);
  if (!provider) {
    throw new Error(`Unknown data source type '${key}'. Registered: ${[...providers.keys()].join(', ')}`);
  }
  return provider;
}

export function registeredDataSourceTypes(): string[] {
  return [...providers.keys()].sort();
}

export async function resolveDataSource(spec: DataSourceSpec): Promise<DataTable> {
  if (!spec) {
    throw new Error('DataSourceSpec is required');
  }
  return getDataSourceProvider(spec.type || 'sql').resolve(spec);
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return String(body.message || body.error || fallback);
  } catch {
    return fallback;
  }
}

/** Prefer unified resolve API; fall back to legacy /queries/{code}/execute for older servers. */
async function resolveSqlViaApi(spec: DataSourceSpec): Promise<DataTable> {
  const queryCode = spec.queryCode;
  if (!queryCode) {
    throw new Error('sql data source requires queryCode');
  }
  const params = { ...(spec.params || {}) };
  const filters = Array.isArray(spec.options?.filters) ? spec.options!.filters : [];

  const resolveBody = {
    type: 'sql',
    queryCode,
    params,
    options: { ...(spec.options || {}), filters },
  };

  const resolved = await tryResolveEndpoint(resolveBody);
  if (resolved) {
    return resolved;
  }

  const legacy = await fetch(`/api/v1/queries/${encodeURIComponent(queryCode)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params, filters }),
  });
  if (!legacy.ok) {
    throw new Error(await readErrorMessage(legacy, 'Query execution failed'));
  }
  const table = normalizeDataTable(await legacy.json());
  return {
    ...table,
    metadata: { ...(table.metadata || {}), provider: 'sql', queryCode, via: 'legacy-execute' },
  };
}

/** Returns table on success, null when endpoint missing/unreachable (caller uses legacy). */
async function tryResolveEndpoint(body: Record<string, unknown>): Promise<DataTable | null> {
  let res: Response;
  try {
    res = await fetch('/api/v1/datasources/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
  if (res.ok) {
    return normalizeDataTable(await res.json());
  }
  if (res.status === 404) {
    return null;
  }
  throw new Error(await readErrorMessage(res, `Data source resolve failed (${res.status})`));
}

function resolveStaticLocal(spec: DataSourceSpec): DataTable {
  const options = spec.options || {};
  const rows = Array.isArray(options.rows)
    ? (options.rows as Array<Record<string, unknown>>)
    : [];
  let columns = Array.isArray(options.columns)
    ? (options.columns as Array<Record<string, unknown>>).map((col) => {
        const field = String(col.field ?? col.name ?? '');
        return {
          field,
          label: String(col.label ?? field),
          type: String(col.type ?? 'string'),
        };
      })
    : [];
  if (columns.length === 0 && rows.length > 0) {
    const fields = new Set<string>();
    rows.forEach((row) => Object.keys(row || {}).forEach((k) => fields.add(k)));
    columns = [...fields].map((field) => ({ field, label: field, type: 'string' }));
  }
  const total =
    typeof options.total === 'number' ? options.total : rows.length;
  const pageSize = Number(spec.params?._pageSize);
  const page = Number(spec.params?._page) || 1;
  let pageRows = rows;
  if (Number.isFinite(pageSize) && pageSize > 0) {
    const from = Math.max(0, (page - 1) * pageSize);
    pageRows = rows.slice(from, from + pageSize);
  }
  return {
    columns,
    rows: pageRows,
    total,
    metadata: { provider: 'static', ...(spec.cacheKey ? { cacheKey: spec.cacheKey } : {}) },
  };
}

export const sqlDataSourceProvider: DataSourceProvider = {
  type: 'sql',
  resolve: resolveSqlViaApi,
};

export const staticDataSourceProvider: DataSourceProvider = {
  type: 'static',
  async resolve(spec) {
    // Prefer server for consistency; fall back to local for offline/static-only pages.
    try {
      const res = await fetch('/api/v1/datasources/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'static',
          cacheKey: spec.cacheKey,
          params: spec.params || {},
          options: spec.options || {},
        }),
      });
      if (res.ok) {
        return normalizeDataTable(await res.json());
      }
    } catch {
      /* use local */
    }
    return resolveStaticLocal(spec);
  },
};

/** Contract only — full cache system is a later slice. */
export const cacheDataSourceProvider: DataSourceProvider = {
  type: 'cache',
  async resolve(spec) {
    throw new Error(
      `cache data source is reserved but not implemented yet${
        spec.cacheKey ? ` (cacheKey=${spec.cacheKey})` : ''
      }`,
    );
  },
};

let bootstrapped = false;

export function ensureDefaultDataSourceProviders(): void {
  if (bootstrapped) return;
  registerDataSourceProvider(sqlDataSourceProvider);
  registerDataSourceProvider(staticDataSourceProvider);
  registerDataSourceProvider(cacheDataSourceProvider);
  bootstrapped = true;
}

export function buildSqlDataSourceSpec(
  queryCode: string,
  params: Record<string, unknown>,
  filters: unknown[],
): DataSourceSpec {
  return {
    type: 'sql',
    queryCode,
    params,
    options: { filters },
  };
}

// Ensure registry is ready for any importer (tests / PageLoader).
ensureDefaultDataSourceProviders();

export { emptyDataTable, normalizeDataTable };
export type { DataTable };
