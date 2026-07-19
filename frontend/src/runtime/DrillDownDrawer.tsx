import { useEffect, useState } from 'react';
import { formatDecoratedValue } from './decorators';

export interface DrillDownRequest {
  queryCode: string;
  title: string;
  params: Record<string, unknown>;
  pageSize?: number;
}

interface ColumnMeta {
  field: string;
  label: string;
  type?: string;
  format?: string;
}

interface Props {
  request: DrillDownRequest | null;
  onClose: () => void;
}

export default function DrillDownDrawer({ request, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = request?.pageSize || 20;

  useEffect(() => {
    if (!request) return;
    setPage(1);
  }, [request?.queryCode, request?.title]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/queries/${encodeURIComponent(request.queryCode)}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        params: {
          ...request.params,
          _page: page,
          _pageSize: pageSize,
        },
        filters: [],
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || 'Query failed');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setColumns(data.columns || []);
        setRows(data.rows || []);
        setTotal(data.total ?? (data.rows || []).length);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request, page, pageSize]);

  if (!request) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
      <button type="button" className="h-full flex-1 cursor-default" aria-label="Close overlay" onClick={onClose} />
      <aside className="flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-700">Related query · not master-detail</div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{request.title}</h3>
            <div className="mt-1 font-mono text-xs text-slate-500">
              {request.queryCode}
              {Object.keys(request.params).length > 0 && (
                <span className="ml-2 text-slate-400">
                  params: {JSON.stringify(request.params)}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && <div className="text-sm text-slate-500">Loading…</div>}
          {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {!loading && !error && (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.field} className="px-3 py-2 font-semibold">
                        {col.label || col.field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(columns.length, 1)} className="px-3 py-8 text-center text-slate-400">
                        No related rows
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        {columns.map((col) => (
                          <td key={col.field} className="px-3 py-2 text-slate-700">
                            {formatDecoratedValue(row[col.field], {
                              format: col.format || col.type,
                              type: col.type,
                            }) || '—'}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          <span>
            {total} rows · page {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-slate-200 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
