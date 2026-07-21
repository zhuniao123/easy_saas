import { useCallback, useEffect, useState } from 'react';

interface DataSourceRow {
  dsCode: string;
  name: string;
  driverClass?: string;
  jdbcUrl: string;
  username: string;
  hasPassword?: boolean;
  maxPoolSize?: number;
  enabled?: boolean;
  platform?: boolean;
  remark?: string;
}

const emptyForm = {
  dsCode: '',
  name: '',
  driverClass: 'org.postgresql.Driver',
  jdbcUrl: 'jdbc:postgresql://127.0.0.1:5432/',
  username: '',
  password: '',
  maxPoolSize: 5,
  remark: '',
};

export default function DataSourceConsole() {
  const [rows, setRows] = useState<DataSourceRow[]>([]);
  const [crypto, setCrypto] = useState<{ devFallbackKey?: boolean; hint?: string } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, cryptoRes] = await Promise.all([
        fetch('/api/v1/admin/data-sources'),
        fetch('/api/v1/admin/data-sources/crypto-status'),
      ]);
      if (!listRes.ok) throw new Error('Failed to load data sources');
      setRows((await listRes.json()) as DataSourceRow[]);
      if (cryptoRes.ok) setCrypto(await cryptoRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
  };

  const startEdit = (row: DataSourceRow) => {
    setEditing(row.dsCode);
    setForm({
      dsCode: row.dsCode,
      name: row.name,
      driverClass: row.driverClass || 'org.postgresql.Driver',
      jdbcUrl: row.jdbcUrl,
      username: row.username,
      password: '',
      maxPoolSize: row.maxPoolSize || 5,
      remark: row.remark || '',
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const body: Record<string, unknown> = {
        dsCode: form.dsCode.trim(),
        name: form.name.trim() || form.dsCode.trim(),
        driverClass: form.driverClass,
        jdbcUrl: form.jdbcUrl.trim(),
        username: form.username.trim(),
        maxPoolSize: form.maxPoolSize,
        remark: form.remark,
        enabled: true,
      };
      if (form.password) body.password = form.password;

      const res = await fetch(
        editing ? `/api/v1/admin/data-sources/${encodeURIComponent(editing)}` : '/api/v1/admin/data-sources',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Save failed');
      setStatus(editing ? `已更新 ${editing}` : `已创建 ${form.dsCode}`);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (code: string) => {
    if (!window.confirm(`删除数据源 ${code}？绑定的 page/query 将清空 ds 引用。`)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/data-sources/${encodeURIComponent(code)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Delete failed');
      setStatus(`已删除 ${code}`);
      if (editing === code) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const test = async (code: string) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/admin/data-sources/${encodeURIComponent(code)}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Test failed');
      setStatus(`${code}: ${data.message || 'OK'}${data.durationMs != null ? ` (${data.durationMs}ms)` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 px-4 py-4 lg:px-6">
      <section className="shrink-0 rounded-2xl border border-white/10 bg-[linear-gradient(120deg,#0f172a,#1e1b4b)] px-5 py-4 text-white shadow-lg">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-300">System · Data Sources</div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">数据源连接（加密）</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
          密码 AES-256-GCM 落库；列表永不回显明文。页面/查询可通过 data_source_code 绑定（执行路由下一切片）。
          平台库 <code className="text-indigo-200">default</code> 固定走 Spring 主数据源。
        </p>
        {crypto && (
          <div
            className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] ${
              crypto.devFallbackKey
                ? 'border-amber-400/40 bg-amber-400/15 text-amber-100'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
            }`}
          >
            {crypto.hint || 'crypto ready'}
          </div>
        )}
      </section>

      {(error || status) && (
        <div
          className={`shrink-0 rounded-xl px-4 py-2 text-sm ${
            error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {error || status}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_360px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">连接目录 · {rows.length}</h3>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              刷新
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2">编码</th>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2">密码</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dsCode} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <code className="text-xs font-semibold">{r.dsCode}</code>
                      {r.platform && (
                        <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-800">
                          platform
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[11px] text-slate-500" title={r.jdbcUrl}>
                      {r.jdbcUrl}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.username}</td>
                    <td className="px-3 py-2 text-xs">{r.hasPassword ? '密文' : r.platform ? '—' : '未设'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold"
                          onClick={() => void test(r.dsCode)}
                        >
                          试连
                        </button>
                        {!r.platform && (
                          <>
                            <button
                              type="button"
                              className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white"
                              onClick={() => startEdit(r)}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                              onClick={() => void remove(r.dsCode)}
                            >
                              删
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form onSubmit={save} className="shrink-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {editing ? `编辑 · ${editing}` : '新建连接'}
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase text-slate-400">ds_code</span>
            <input
              required
              disabled={!!editing}
              value={form.dsCode}
              onChange={(e) => setForm((f) => ({ ...f, dsCode: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm disabled:opacity-60"
              placeholder="biz_shop"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase text-slate-400">名称</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase text-slate-400">JDBC URL</span>
            <input
              required
              value={form.jdbcUrl}
              onChange={(e) => setForm((f) => ({ ...f, jdbcUrl: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase text-slate-400">用户名</span>
            <input
              required
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase text-slate-400">
              密码 {editing ? '（留空不改）' : ''}
            </span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase text-slate-400">池大小</span>
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxPoolSize}
              onChange={(e) => setForm((f) => ({ ...f, maxPoolSize: Number(e.target.value) || 5 }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase text-slate-400">备注</span>
            <input
              value={form.remark}
              onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-full bg-slate-950 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {editing ? '保存' : '创建'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                取消
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
