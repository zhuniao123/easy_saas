/**
 * Unified tabular result for SQL, static, and future cache providers.
 * Smart Grid and future chart components should depend on this shape only.
 */

export interface DataTableColumn {
  field: string;
  label: string;
  type?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: string;
  tone?: string;
  [key: string]: unknown;
}

export interface DataTable {
  columns: DataTableColumn[];
  rows: Array<Record<string, unknown>>;
  total?: number;
  metadata?: Record<string, unknown>;
}

export function emptyDataTable(): DataTable {
  return { columns: [], rows: [], total: 0, metadata: {} };
}

export function normalizeDataTable(raw: unknown): DataTable {
  if (!raw || typeof raw !== 'object') {
    return emptyDataTable();
  }
  const data = raw as Record<string, unknown>;
  const columns = Array.isArray(data.columns)
    ? (data.columns as Array<Record<string, unknown>>).map((col) => {
        const field = String(col.field ?? col.name ?? '');
        return {
          ...col,
          field,
          label: String(col.label ?? field),
          type: col.type != null ? String(col.type) : 'string',
        } as DataTableColumn;
      })
    : [];
  const rows = Array.isArray(data.rows)
    ? (data.rows as Array<Record<string, unknown>>)
    : [];
  const total =
    typeof data.total === 'number'
      ? data.total
      : data.total != null
        ? Number(data.total)
        : rows.length;
  const metadata =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>)
      : {};
  return { columns, rows, total: Number.isFinite(total) ? total : rows.length, metadata };
}
