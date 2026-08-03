import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fieldList,
  nextTempId,
  type LineRowState,
  type MasterDetailFieldSpec,
  type MasterDetailSpec,
} from '../masterDetailTypes';

type LineRow = Record<string, unknown> & {
  _tempId?: string;
  _rowState?: LineRowState;
};

async function executeQuery(
  queryCode: string,
  params: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`/api/v1/queries/${encodeURIComponent(queryCode)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params, filters: [], page: 1, pageSize: 500 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(String(body.message || body.error || 'Query failed'));
  }
  const data = await res.json();
  return Array.isArray(data.rows) ? data.rows : [];
}

function inputType(field: MasterDetailFieldSpec): string {
  const t = (field.type || '').toLowerCase();
  if (t === 'number' || t === 'integer' || t === 'money') return 'number';
  if (t === 'date') return 'date';
  if (t === 'datetime') return 'datetime-local';
  return 'text';
}

function emptyHeader(spec: MasterDetailSpec): Record<string, unknown> {
  const h: Record<string, unknown> = {};
  const statusField = spec.header.statusField || 'status';
  h[statusField] = spec.draftStatus || 'draft';
  if (spec.header.versionField) {
    h[spec.header.versionField] = 1;
  }
  return h;
}

export default function MasterDetailEditor({
  pageCode,
  spec,
  listRows,
  listLoading,
  onRefreshList,
}: {
  pageCode: string;
  spec: MasterDetailSpec;
  listRows?: Array<Record<string, unknown>>;
  listLoading?: boolean;
  onRefreshList?: () => void;
}) {
  const headerPk = spec.header.primaryKey || 'id';
  const linesPk = spec.lines.primaryKey || 'id';
  const headerFields = fieldList(spec.header);
  const lineFields = fieldList(spec.lines);

  const [header, setHeader] = useState<Record<string, unknown>>(() => emptyHeader(spec));
  const [lines, setLines] = useState<LineRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const statusField = spec.header.statusField || 'status';
  const status = String(header[statusField] ?? '');
  const isSubmitted = status === (spec.submitStatus || 'submitted');
  const readOnly = isSubmitted;

  const loadDocument = useCallback(
    async (headerId: unknown) => {
      if (headerId == null || String(headerId).trim() === '') return;
      setError(null);
      setMessage(null);
      setBusy(true);
      try {
        const hq = spec.header.loadQueryCode;
        const lq = spec.lines.loadQueryCode;
        if (!hq || !lq) {
          throw new Error('masterDetail.header/lines.loadQueryCode is required to open a document');
        }
        const [hRows, lRows] = await Promise.all([
          executeQuery(hq, { id: headerId, headerId }),
          executeQuery(lq, { id: headerId, headerId, order_id: headerId }),
        ]);
        if (!hRows.length) {
          throw new Error('Header not found: ' + String(headerId));
        }
        setHeader({ ...hRows[0] });
        setLines(
          lRows.map((r) => ({
            ...r,
            _tempId: nextTempId(),
            _rowState: 'unchanged' as LineRowState,
          })),
        );
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load failed');
      } finally {
        setBusy(false);
      }
    },
    [spec.header.loadQueryCode, spec.lines.loadQueryCode],
  );

  const startNew = useCallback(() => {
    const base = emptyHeader(spec);
    // Prefill from workspace click (sessionStorage)
    const prefillKey =
      (spec as { prefillStorageKey?: string }).prefillStorageKey ||
      `page_prefill_${pageCode}`;
    try {
      const raw = sessionStorage.getItem(prefillKey);
      if (raw) {
        const pre = JSON.parse(raw) as Record<string, unknown>;
        Object.assign(base, pre);
        sessionStorage.removeItem(prefillKey);
        setMessage(
          pre.member_name
            ? `已带入会员：${String(pre.member_name)}，请完善单号后保存`
            : '已带入预填字段',
        );
      }
    } catch {
      // ignore
    }
    setHeader(base);
    setLines([]);
    setError(null);
    setDirty(Boolean(base.member_name));
  }, [spec, pageCode]);

  useEffect(() => {
    // Auto-apply prefill when landing from workspace without clicking 新建
    const prefillKey =
      (spec as { prefillStorageKey?: string }).prefillStorageKey ||
      `page_prefill_${pageCode}`;
    try {
      if (sessionStorage.getItem(prefillKey)) {
        startNew();
      }
    } catch {
      // ignore
    }
    // only on mount / page change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCode]);

  const patchHeader = (field: string, value: unknown) => {
    if (readOnly) return;
    setHeader((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const addLine = () => {
    if (readOnly) return;
    const row: LineRow = {
      _tempId: nextTempId(),
      _rowState: 'added',
      qty: 1,
      unit_price: 0,
      amount: 0,
    };
    setLines((prev) => [...prev, row]);
    setDirty(true);
  };

  const patchLine = (tempId: string, field: string, value: unknown) => {
    if (readOnly) return;
    setLines((prev) =>
      prev.map((row) => {
        if (row._tempId !== tempId) return row;
        const next: LineRow = { ...row, [field]: value };
        // auto amount
        if (field === 'qty' || field === 'unit_price') {
          const qty = Number(field === 'qty' ? value : next.qty) || 0;
          const price = Number(field === 'unit_price' ? value : next.unit_price) || 0;
          next.amount = Math.round(qty * price * 100) / 100;
        }
        if (next._rowState !== 'added') {
          next._rowState = 'modified';
        }
        return next;
      }),
    );
    setDirty(true);
  };

  const removeLine = (tempId: string) => {
    if (readOnly) return;
    setLines((prev) =>
      prev
        .map((row) => {
          if (row._tempId !== tempId) return row;
          if (row._rowState === 'added' || row[linesPk] == null) {
            return null;
          }
          return { ...row, _rowState: 'deleted' as LineRowState };
        })
        .filter((x): x is LineRow => Boolean(x)),
    );
    setDirty(true);
  };

  const visibleLines = useMemo(
    () => lines.filter((l) => l._rowState !== 'deleted'),
    [lines],
  );

  const lineTotal = useMemo(
    () =>
      visibleLines.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [visibleLines],
  );

  const save = async (mode: 'draft' | 'submit') => {
    if (readOnly && mode === 'draft') return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'submit') {
        const memberField = spec.header.requiredMemberField;
        if (memberField && !String(header[memberField] || '').trim()) {
          throw new Error('提交前请填写会员/客户');
        }
        if (visibleLines.length === 0) {
          throw new Error('提交前至少添加一行明细');
        }
      }
      const payload = {
        mode,
        header: { ...header },
        lines: lines.map((row) => {
          const { _tempId, ...rest } = row;
          return rest;
        }),
      };
      const res = await fetch(`/api/v1/pages/${encodeURIComponent(pageCode)}/master-detail/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(body.message || body.error || `Save failed (${res.status})`));
      }
      const headerId = body.headerId;
      setMessage(mode === 'submit' ? '已提交（整单事务成功）' : '草稿已保存');
      setDirty(false);
      onRefreshList?.();
      if (headerId != null) {
        await loadDocument(headerId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-master-detail="true">
      {/* List picker */}
      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Documents
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {spec.title || '主从单据'}
            </div>
          </div>
          <button
            type="button"
            onClick={startNew}
            className="rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-500"
          >
            新建
          </button>
        </div>
        <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-slate-100">
          {listLoading && (
            <div className="px-3 py-4 text-sm text-slate-400">加载列表…</div>
          )}
          {!listLoading && (!listRows || listRows.length === 0) && (
            <div className="px-3 py-4 text-sm text-slate-400">暂无单据，点击「新建」</div>
          )}
          {listRows && listRows.length > 0 && (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-2">单号/ID</th>
                  <th className="px-3 py-2">会员</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {listRows.map((row) => {
                  const id = row[headerPk] ?? row.id;
                  return (
                    <tr key={String(id)} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">
                        {String(row.order_no ?? id ?? '')}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {String(row.member_name ?? row.customer_name ?? '—')}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {String(row[statusField] ?? row.status ?? '')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="text-xs font-medium text-cyan-700 hover:underline"
                          onClick={() => loadDocument(id)}
                        >
                          打开
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Header
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {header[headerPk] != null ? `单据 #${String(header[headerPk])}` : '新单据'}
              {dirty && <span className="ml-2 text-xs font-normal text-amber-600">未保存</span>}
              {isSubmitted && (
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  已提交（只读）
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || readOnly}
              onClick={() => save('draft')}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              保存草稿
            </button>
            <button
              type="button"
              disabled={busy || readOnly}
              onClick={() => save('submit')}
              className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              整单提交
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        {message && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {headerFields.map((f) => (
            <label key={f.field} className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {f.label || f.field}
                {f.required || f.field === spec.header.requiredMemberField ? ' *' : ''}
              </span>
              <input
                type={inputType(f)}
                value={header[f.field] == null ? '' : String(header[f.field])}
                disabled={readOnly || f.readOnly || f.field === headerPk || f.field === spec.header.versionField}
                onChange={(e) =>
                  patchHeader(
                    f.field,
                    e.target.type === 'number' ? Number(e.target.value) : e.target.value,
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400 disabled:opacity-60"
              />
            </label>
          ))}
        </div>

        {/* Lines */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Lines · 合计 {lineTotal.toFixed(2)}
            </div>
            <button
              type="button"
              disabled={readOnly}
              onClick={addLine}
              className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-40"
            >
              + 添加明细
            </button>
          </div>

          <div className="mt-2 overflow-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  {lineFields.map((f) => (
                    <th key={f.field} className="px-3 py-2">
                      {f.label || f.field}
                    </th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleLines.length === 0 && (
                  <tr>
                    <td
                      colSpan={lineFields.length + 1}
                      className="px-3 py-6 text-center text-slate-400"
                    >
                      暂无明细行
                    </td>
                  </tr>
                )}
                {visibleLines.map((row) => (
                  <tr key={row._tempId} className="border-t border-slate-100">
                    {lineFields.map((f) => (
                      <td key={f.field} className="px-2 py-1.5">
                        <input
                          type={inputType(f)}
                          value={row[f.field] == null ? '' : String(row[f.field])}
                          disabled={readOnly || f.readOnly || f.computed || f.field === linesPk}
                          onChange={(e) =>
                            patchLine(
                              String(row._tempId),
                              f.field,
                              e.target.type === 'number'
                                ? Number(e.target.value)
                                : e.target.value,
                            )
                          }
                          className="w-full min-w-[5rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:opacity-70"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => removeLine(String(row._tempId))}
                        className="text-xs text-rose-600 hover:underline disabled:opacity-40"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            保存/提交在同一数据库事务写入头表与明细；已提交单据只读。乐观锁字段：
            {spec.header.versionField || '无'}。
          </p>
        </div>
      </div>
    </div>
  );
}
