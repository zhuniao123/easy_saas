import { useCallback, useEffect, useMemo, useState } from 'react';

interface SqlAssetSummary {
  queryCode: string;
  anchorEntity?: string;
  queryMode?: string;
  sqlPreview?: string;
  sqlLength?: number;
  pageRefCount?: number;
  actionRefCount?: number;
  execCount?: number;
  errorCount?: number;
  avgDurationMs?: number;
  lastExecutedAt?: string;
  kind?: string;
  tryRunAllowed?: boolean;
  dataSourceCode?: string | null;
}

interface SqlAssetDetail {
  queryCode: string;
  anchorEntity?: string | null;
  sqlText: string;
  countSqlText?: string | null;
  queryMode?: string;
  paramsJson?: string;
  paramNames?: string[];
  kind?: string;
  tryRunAllowed?: boolean;
  dataSourceCode?: string | null;
  pageRefs?: Array<{ pageCode: string; title: string; routePath: string }>;
  actionRefs?: Array<{ actionCode: string; label: string; actionType: string }>;
}

interface DsOption {
  dsCode: string;
  name: string;
  enabled?: boolean;
  platform?: boolean;
}

interface TryResult {
  columns?: Array<{ field: string; label: string }>;
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
  durationMs?: number;
  truncated?: boolean;
  status?: string;
  error?: string;
}

export default function SqlRepoConsole() {
  const [assets, setAssets] = useState<SqlAssetSummary[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<SqlAssetDetail | null>(null);
  const [sqlText, setSqlText] = useState('');
  const [countSqlText, setCountSqlText] = useState('');
  const [queryMode, setQueryMode] = useState('rawSql');
  const [anchorEntity, setAnchorEntity] = useState('');
  const [dataSourceCode, setDataSourceCode] = useState('');
  const [dataSources, setDataSources] = useState<DsOption[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [tryResult, setTryResult] = useState<TryResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [filter, setFilter] = useState('');

  const paramNames = useMemo(() => {
    const fromSql = new Set<string>();
    const re = /(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sqlText))) {
      fromSql.add(m[1]);
    }
    return Array.from(fromSql);
  }, [sqlText]);

  const filteredAssets = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.queryCode.toLowerCase().includes(q) ||
        (a.sqlPreview || '').toLowerCase().includes(q) ||
        (a.anchorEntity || '').toLowerCase().includes(q),
    );
  }, [assets, filter]);

  const loadList = useCallback(async () => {
    const res = await fetch('/api/v1/sql-repo');
    if (!res.ok) throw new Error('Failed to load SQL repository');
    const data = (await res.json()) as SqlAssetSummary[];
    setAssets(data || []);
  }, []);

  const loadDataSources = useCallback(async () => {
    const res = await fetch('/api/v1/admin/data-sources');
    if (!res.ok) return;
    const data = (await res.json()) as DsOption[];
    setDataSources(Array.isArray(data) ? data : []);
  }, []);

  const loadAsset = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    setTryResult(null);
    try {
      const res = await fetch(`/api/v1/sql-repo/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error('Failed to load asset');
      const data = (await res.json()) as SqlAssetDetail;
      setDetail(data);
      setSelectedCode(code);
      setSqlText(data.sqlText || '');
      setCountSqlText(data.countSqlText || '');
      setQueryMode(data.queryMode || 'rawSql');
      setAnchorEntity(data.anchorEntity || '');
      setDataSourceCode(data.dataSourceCode || '');
      const nextParams: Record<string, string> = {};
      (data.paramNames || []).forEach((name) => {
        nextParams[name] = '';
      });
      setParamValues(nextParams);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadList().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
      void loadDataSources();
    });
  }, [loadList, loadDataSources]);

  const handleSave = async () => {
    if (!selectedCode) return;
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/sql-repo/${encodeURIComponent(selectedCode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sqlText,
          countSqlText,
          queryMode,
          anchorEntity: anchorEntity || null,
          dataSourceCode: dataSourceCode.trim() || null,
          paramsJson: '[]',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `Save failed (${res.status})`);
      }
      setStatus('Saved to SQL repository (pages keep referencing queryCode only).');
      await loadList();
      await loadAsset(selectedCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleTry = async () => {
    if (!selectedCode) return;
    setStatus(null);
    setError(null);
    setTryResult(null);
    try {
      const params: Record<string, unknown> = {};
      paramNames.forEach((name) => {
        const raw = paramValues[name];
        if (raw === undefined || raw === '') {
          params[name] = null;
        } else if (/^-?\d+(\.\d+)?$/.test(raw)) {
          params[name] = Number(raw);
        } else {
          params[name] = raw;
        }
      });
      const res = await fetch(`/api/v1/sql-repo/${encodeURIComponent(selectedCode)}/try`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sqlText, params, maxRows: 50 }),
      });
      const data = (await res.json().catch(() => ({}))) as TryResult & { message?: string };
      if (!res.ok) {
        throw new Error(data.message || data.error || `Try failed (${res.status})`);
      }
      setTryResult(data);
      setStatus(`Try-run OK · ${data.rowCount ?? 0} rows · ${data.durationMs ?? '?'} ms`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try failed');
    }
  };

  const handleCreate = async () => {
    const code = newCode.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(code)) {
      setError('New queryCode must be a safe identifier (e.g. q_my_report)');
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/v1/sql-repo/${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sqlText: 'SELECT 1 AS ok',
          queryMode: 'rawSql',
          paramsJson: '[]',
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      setNewCode('');
      await loadList();
      await loadAsset(code);
      setStatus(`Created ${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700">SQL Repository</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">SQL 与 DSL 分离的试跑仓库</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              统一管理查询与事务语句 SQL 资产（<code className="rounded bg-slate-100 px-1">queryCode</code>）。页面 DSL
              与 <code className="rounded bg-slate-100 px-1">lc_action</code> 只引用 code；
              事务语句用 <code className="rounded bg-slate-100 px-1">sqlAssetCode</code>。试跑仅允许 SELECT / WITH。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="q_new_asset"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white"
            >
              New asset
            </button>
          </div>
        </div>
      </section>

      {(error || status) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {error || status}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="flex max-h-[70vh] flex-col rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter queryCode…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredAssets.map((asset) => (
              <button
                key={asset.queryCode}
                type="button"
                onClick={() => void loadAsset(asset.queryCode)}
                className={`mb-1 w-full rounded-2xl px-3 py-3 text-left transition ${
                  selectedCode === asset.queryCode
                    ? 'bg-cyan-50 ring-1 ring-cyan-200'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{asset.queryCode}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      asset.kind === 'dml' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {asset.kind || 'select'}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 font-mono text-[11px] text-slate-500">{asset.sqlPreview}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  <span>{asset.queryMode || 'rawSql'}</span>
                  <span>pages:{asset.pageRefCount ?? 0}</span>
                  <span>actions:{asset.actionRefCount ?? 0}</span>
                  <span>exec:{asset.execCount ?? 0}</span>
                  {(asset.errorCount ?? 0) > 0 && (
                    <span className="text-rose-500">err:{asset.errorCount}</span>
                  )}
                  {asset.avgDurationMs != null && <span>avg:{asset.avgDurationMs}ms</span>}
                </div>
              </button>
            ))}
            {filteredAssets.length === 0 && (
              <div className="p-4 text-sm text-slate-500">No SQL assets yet.</div>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col gap-4">
          {!selectedCode ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              Select a SQL asset to edit and try-run.
            </div>
          ) : (
            <>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Asset</div>
                    <div className="text-lg font-semibold text-slate-900">{selectedCode}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading || detail?.tryRunAllowed === false}
                      title={detail?.tryRunAllowed === false ? 'DML assets cannot try-run; use sqlTransaction' : 'Try SELECT'}
                      onClick={() => void handleTry()}
                      className="rounded-full bg-cyan-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-40"
                    >
                      Try run
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleSave()}
                      className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">queryMode</span>
                    <select
                      value={queryMode}
                      onChange={(e) => setQueryMode(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <option value="rawSql">rawSql (SELECT list / assert)</option>
                      <option value="singleTableTemplate">singleTableTemplate (writable page query)</option>
                      <option value="dml">dml (action statement body via sqlAssetCode)</option>
                    </select>
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">anchorEntity</span>
                    <input
                      value={anchorEntity}
                      onChange={(e) => setAnchorEntity(e.target.value)}
                      placeholder="optional entity_code"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    />
                  </label>
                  <label className="block space-y-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      dataSourceCode
                    </span>
                    <select
                      value={dataSourceCode}
                      onChange={(e) => setDataSourceCode(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <option value="">default（平台库）</option>
                      {dataSources
                        .filter((d) => d.dsCode !== 'default')
                        .map((d) => (
                          <option key={d.dsCode} value={d.dsCode} disabled={d.enabled === false}>
                            {d.dsCode}
                            {d.name ? ` · ${d.name}` : ''}
                            {d.enabled === false ? ' (disabled)' : ''}
                          </option>
                        ))}
                    </select>
                    <span className="text-[11px] text-slate-500">
                      解析：page.data_source_code &gt; query 绑定 &gt; default
                    </span>
                  </label>
                </div>

                <label className="mt-4 block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">sql_text</span>
                  <textarea
                    value={sqlText}
                    onChange={(e) => setSqlText(e.target.value)}
                    rows={12}
                    spellCheck={false}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none focus:border-cyan-400"
                  />
                </label>

                {queryMode !== 'dml' && (
                  <label className="mt-4 block space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      count_sql_text (optional)
                    </span>
                    <textarea
                      value={countSqlText}
                      onChange={(e) => setCountSqlText(e.target.value)}
                      rows={4}
                      spellCheck={false}
                      placeholder="SELECT COUNT(*) FROM ..."
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none focus:border-cyan-400"
                    />
                    <span className="text-xs text-slate-500">
                      Must return one number. Runtime filters fall back to automatic count for correctness.
                    </span>
                  </label>
                )}

                {paramNames.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Named params (try-run)</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {paramNames.map((name) => (
                        <label key={name} className="block space-y-1 text-sm">
                          <span className="font-mono text-xs text-slate-500">:{name}</span>
                          <input
                            value={paramValues[name] || ''}
                            onChange={(e) => setParamValues((prev) => ({ ...prev, [name]: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-1 text-xs text-slate-500">
                  {detail?.pageRefs && detail.pageRefs.length > 0 && (
                    <div>Referenced by pages: {detail.pageRefs.map((p) => p.pageCode).join(', ')}</div>
                  )}
                  {detail?.actionRefs && detail.actionRefs.length > 0 && (
                    <div>
                      Referenced by actions (sqlAssetCode):{' '}
                      {detail.actionRefs.map((a) => a.actionCode).join(', ')}
                    </div>
                  )}
                  {detail?.kind === 'dml' && (
                    <div className="text-amber-700">
                      DML asset — edit here, execute only via lc_action sqlTransaction (not try-run).
                    </div>
                  )}
                </div>
              </div>

              {tryResult && (
                <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
                    Result · {tryResult.rowCount ?? 0} rows
                    {tryResult.truncated ? ' (truncated)' : ''}
                  </div>
                  <div className="max-h-[360px] overflow-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                        <tr>
                          {(tryResult.columns || []).map((col) => (
                            <th key={col.field} className="px-3 py-2 font-semibold">
                              {col.label || col.field}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(tryResult.rows || []).map((row, idx) => (
                          <tr key={idx} className="border-t border-slate-100">
                            {(tryResult.columns || []).map((col) => (
                              <td key={col.field} className="px-3 py-2 font-mono text-xs text-slate-700">
                                {row[col.field] == null ? '—' : String(row[col.field])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
