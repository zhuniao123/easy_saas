import { useCallback, useEffect, useState } from 'react';

type Tab = 'summary' | 'query' | 'action' | 'slow' | 'errors' | 'audit';

export default function OpsConsole() {
  const [tab, setTab] = useState<Tab>('summary');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryCode, setQueryCode] = useState('');
  const [minMs, setMinMs] = useState(200);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'summary') {
        const res = await fetch('/api/v1/ops/summary');
        if (!res.ok) throw new Error(`summary failed ${res.status}`);
        setSummary(await res.json());
        setRows([]);
        return;
      }
      let url = '';
      if (tab === 'query') {
        url = `/api/v1/ops/query-logs?limit=80${queryCode ? `&queryCode=${encodeURIComponent(queryCode)}` : ''}`;
      } else if (tab === 'action') {
        url = '/api/v1/ops/action-logs?limit=80';
      } else if (tab === 'slow') {
        url = `/api/v1/ops/slow-queries?limit=50&minDurationMs=${minMs}`;
      } else if (tab === 'errors') {
        url = '/api/v1/ops/error-logs?limit=80';
      } else {
        url = '/api/v1/ops/config-audit?limit=80';
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`load failed ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setSummary(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [tab, queryCode, minMs]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'summary', label: '总览' },
    { id: 'query', label: '查询日志' },
    { id: 'action', label: '动作日志' },
    { id: 'slow', label: '慢查询' },
    { id: 'errors', label: '错误' },
    { id: 'audit', label: '配置审计' },
  ];

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">Ops · Observability</div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">运行日志与配置审计</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          查询/动作耗时与失败、慢查询、API 错误、配置变更摘要。需 <code className="rounded bg-slate-100 px-1">perm:config</code>。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            刷新
          </button>
        </div>
        {tab === 'query' && (
          <div className="mt-3">
            <input
              value={queryCode}
              onChange={(e) => setQueryCode(e.target.value)}
              placeholder="filter queryCode"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        )}
        {tab === 'slow' && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-slate-500">min ms</span>
            <input
              type="number"
              value={minMs}
              onChange={(e) => setMinMs(Number(e.target.value) || 0)}
              className="w-24 rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>
        )}
      </section>

      {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      {tab === 'summary' && summary && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(['recentQueryErrors', 'slowQueries', 'recentErrors', 'configAudit'] as const).map((key) => (
            <section key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">{key}</h3>
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-100">
                {JSON.stringify(summary[key], null, 2)}
              </pre>
            </section>
          ))}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">cache</h3>
            <pre className="mt-2 font-mono text-xs text-slate-700">{JSON.stringify(summary.cache, null, 2)}</pre>
          </section>
        </div>
      )}

      {tab !== 'summary' && (
        <section className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {rows[0]
                  ? Object.keys(rows[0]).map((k) => (
                      <th key={k} className="px-3 py-2 font-semibold">
                        {k}
                      </th>
                    ))
                  : (
                      <th className="px-3 py-2">empty</th>
                    )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  {Object.keys(rows[0] || {}).map((k) => (
                    <td key={k} className="max-w-[240px] truncate px-3 py-2 font-mono text-[11px] text-slate-700">
                      {row[k] == null ? '' : String(row[k])}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-6 text-slate-400" colSpan={8}>
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
