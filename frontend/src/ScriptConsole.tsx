import { useCallback, useEffect, useMemo, useState } from 'react';

type ScriptType = 'PAGE_CONTROLLER' | 'FRONTEND_JS' | 'BACKEND_GROOVY';
type ScriptStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED' | string;
type ConsoleView = 'scripts' | 'endpoints';
type TxMode = 'NONE' | 'READ_ONLY' | 'REQUIRED';

interface ScriptSummary {
  scriptCode: string;
  scriptType: ScriptType | string;
  status: ScriptStatus;
  version?: number;
  pageCode?: string | null;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ScriptDetail extends ScriptSummary {
  scriptContent?: string;
}

interface EndpointSummary {
  endpointCode: string;
  scriptCode: string;
  permCode?: string | null;
  txMode?: string;
  dataSourceCode?: string | null;
  timeoutMs?: number;
  enabled?: boolean;
  status: ScriptStatus;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface EndpointDetail extends EndpointSummary {
  requestSchemaJson?: string;
  responseSchemaJson?: string;
}

const TYPE_OPTIONS: Array<{ value: ScriptType; label: string }> = [
  { value: 'PAGE_CONTROLLER', label: 'PAGE_CONTROLLER' },
  { value: 'FRONTEND_JS', label: 'FRONTEND_JS' },
  { value: 'BACKEND_GROOVY', label: 'BACKEND_GROOVY' },
];

const TX_OPTIONS: TxMode[] = ['NONE', 'READ_ONLY', 'REQUIRED'];

const DEFAULT_REQ_SCHEMA = `{
  "type": "object",
  "properties": {
    "message": { "type": "string" },
    "n": { "type": "number" }
  }
}`;

const DEFAULT_RES_SCHEMA = `{
  "type": "object",
  "properties": {
    "ok": { "type": "boolean" }
  }
}`;

const TEMPLATES: Record<ScriptType, string> = {
  PAGE_CONTROLLER: `export default {
  async onReady(ctx) {
    ctx.ui.log('info', 'controller ready', { page: ctx.pageCode, v: ctx.version });
  },
  async onEvent(event, ctx) {
    if (event.type === 'rowClick' || event.type === 'itemClick') {
      const name = event.payload?.name
        || event.payload?.row?.name
        || event.componentCode;
      ctx.ui.toast(event.type + (name ? ': ' + name : ''));
      ctx.ui.log('info', 'event', event);
    }
  },
  async onError(err, ctx) {
    ctx.ui.log('error', 'controller error', err);
  },
  async onDispose(ctx) {
    ctx.ui.log('info', 'controller disposed', { page: ctx.pageCode });
  }
};
`,
  FRONTEND_JS: `export default {
  async onReady(ctx) {
    ctx.ui.log('info', 'frontend script ready', { page: ctx.pageCode });
  },
  async onEvent(event, ctx) {
    ctx.ui.log('info', 'event', event);
  }
};
`,
  BACKEND_GROOVY: `import com.example.lowcode.script.IDynamicEndpointHandler
import com.example.lowcode.script.DynamicContext

class ScriptHandler implements IDynamicEndpointHandler {
  Object handle(DynamicContext ctx) {
    def msg = ctx.get('message') ?: 'hello'
    return [
      ok: true,
      echo: msg,
      endpoint: ctx.endpointCode,
      at: new Date().toString()
    ]
  }
}
`,
};

function statusClass(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'PUBLISHED') return 'bg-emerald-100 text-emerald-800';
  if (s === 'DRAFT') return 'bg-amber-100 text-amber-800';
  if (s === 'DISABLED') return 'bg-slate-200 text-slate-600';
  return 'bg-slate-100 text-slate-600';
}

function typeClass(type: string): string {
  const t = (type || '').toUpperCase();
  if (t === 'BACKEND_GROOVY') return 'bg-violet-100 text-violet-800';
  if (t === 'PAGE_CONTROLLER') return 'bg-cyan-100 text-cyan-800';
  return 'bg-sky-100 text-sky-800';
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    detail?: string;
  };
  return body.message || body.error || body.detail || `Request failed (${res.status})`;
}

function prettyJson(raw: string | undefined | null, fallback = '{}'): string {
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function ScriptConsole() {
  const [view, setView] = useState<ConsoleView>('scripts');

  // ---- scripts state ----
  const [items, setItems] = useState<ScriptSummary[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScriptDetail | null>(null);
  const [scriptType, setScriptType] = useState<ScriptType>('PAGE_CONTROLLER');
  const [pageCode, setPageCode] = useState('');
  const [remark, setRemark] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ScriptType>('ALL');
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<ScriptType>('PAGE_CONTROLLER');

  // ---- endpoints state ----
  const [endpoints, setEndpoints] = useState<EndpointSummary[]>([]);
  const [selectedEp, setSelectedEp] = useState<string | null>(null);
  const [epDirty, setEpDirty] = useState(false);
  const [epFilter, setEpFilter] = useState('');
  const [epCode, setEpCode] = useState('');
  const [epScriptCode, setEpScriptCode] = useState('');
  const [epPermCode, setEpPermCode] = useState('');
  const [epTxMode, setEpTxMode] = useState<TxMode>('READ_ONLY');
  const [epTimeoutMs, setEpTimeoutMs] = useState(5000);
  const [epEnabled, setEpEnabled] = useState(true);
  const [epStatus, setEpStatus] = useState<string>('DRAFT');
  const [epRemark, setEpRemark] = useState('');
  const [epReqSchema, setEpReqSchema] = useState(DEFAULT_REQ_SCHEMA);
  const [epResSchema, setEpResSchema] = useState(DEFAULT_RES_SCHEMA);
  const [tryBody, setTryBody] = useState('{\n  "message": "hi",\n  "n": 3\n}');
  const [tryResult, setTryResult] = useState<string | null>(null);
  const [newEpCode, setNewEpCode] = useState('');

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const groovyScripts = useMemo(
    () => items.filter((s) => String(s.scriptType).toUpperCase() === 'BACKEND_GROOVY'),
    [items],
  );

  const filteredScripts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'ALL' && item.scriptType !== typeFilter) return false;
      if (!q) return true;
      return (
        item.scriptCode.toLowerCase().includes(q) ||
        (item.pageCode || '').toLowerCase().includes(q) ||
        (item.remark || '').toLowerCase().includes(q) ||
        (item.scriptType || '').toLowerCase().includes(q) ||
        (item.status || '').toLowerCase().includes(q)
      );
    });
  }, [items, filter, typeFilter]);

  const filteredEndpoints = useMemo(() => {
    const q = epFilter.trim().toLowerCase();
    if (!q) return endpoints;
    return endpoints.filter(
      (e) =>
        e.endpointCode.toLowerCase().includes(q) ||
        e.scriptCode.toLowerCase().includes(q) ||
        (e.remark || '').toLowerCase().includes(q) ||
        (e.status || '').toLowerCase().includes(q),
    );
  }, [endpoints, epFilter]);

  const boundForSelectedScript = useMemo(() => {
    if (!selectedCode) return [];
    return endpoints.filter((e) => e.scriptCode === selectedCode);
  }, [endpoints, selectedCode]);

  const loadScripts = useCallback(async () => {
    const res = await fetch('/api/v1/scripts');
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as ScriptSummary[];
    setItems(Array.isArray(data) ? data : []);
  }, []);

  const loadEndpoints = useCallback(async () => {
    const res = await fetch('/api/v1/dynamic');
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as EndpointSummary[];
    setEndpoints(Array.isArray(data) ? data : []);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadScripts(), loadEndpoints()]);
  }, [loadScripts, loadEndpoints]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshAll().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
    });
  }, [refreshAll]);

  const applyScriptDetail = (data: ScriptDetail) => {
    setDetail(data);
    setSelectedCode(data.scriptCode);
    setScriptType((data.scriptType as ScriptType) || 'PAGE_CONTROLLER');
    setPageCode(data.pageCode || '');
    setRemark(data.remark || '');
    setContent(data.scriptContent || '');
    setDirty(false);
  };

  const loadScript = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/scripts/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error(await readError(res));
      applyScriptDetail((await res.json()) as ScriptDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const applyEndpointDetail = (data: EndpointDetail, codeOverride?: string) => {
    const code = codeOverride || data.endpointCode;
    setSelectedEp(code);
    setEpCode(code);
    setEpScriptCode(data.scriptCode || '');
    setEpPermCode(data.permCode || '');
    setEpTxMode(((data.txMode as TxMode) || 'READ_ONLY') as TxMode);
    setEpTimeoutMs(typeof data.timeoutMs === 'number' ? data.timeoutMs : 5000);
    setEpEnabled(data.enabled !== false);
    setEpStatus(data.status || 'DRAFT');
    setEpRemark(data.remark || '');
    setEpReqSchema(prettyJson(data.requestSchemaJson, DEFAULT_REQ_SCHEMA));
    setEpResSchema(prettyJson(data.responseSchemaJson, DEFAULT_RES_SCHEMA));
    setEpDirty(false);
    setTryResult(null);
  };

  const blankEndpoint = (scriptCodeHint?: string) => {
    setSelectedEp(null);
    setEpCode('');
    setEpScriptCode(scriptCodeHint || groovyScripts[0]?.scriptCode || '');
    setEpPermCode('');
    setEpTxMode('READ_ONLY');
    setEpTimeoutMs(5000);
    setEpEnabled(true);
    setEpStatus('DRAFT');
    setEpRemark('');
    setEpReqSchema(DEFAULT_REQ_SCHEMA);
    setEpResSchema(DEFAULT_RES_SCHEMA);
    setEpDirty(false);
    setTryResult(null);
  };

  const loadEndpoint = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/dynamic/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error(await readError(res));
      applyEndpointDetail((await res.json()) as EndpointDetail, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const markDirty = () => setDirty(true);
  const markEpDirty = () => setEpDirty(true);

  // ---- script actions ----
  const handleSaveScript = async (asDraft = false) => {
    if (!selectedCode) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const body: Record<string, unknown> = {
        scriptType,
        scriptContent: content,
        pageCode: pageCode.trim() || null,
        remark: remark.trim() || null,
      };
      if (asDraft) body.status = 'DRAFT';
      const res = await fetch(`/api/v1/scripts/${encodeURIComponent(selectedCode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      applyScriptDetail((await res.json()) as ScriptDetail);
      setStatus(`已保存脚本 ${selectedCode}${asDraft ? ' → DRAFT' : ''}`);
      await loadScripts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishScript = async () => {
    if (!selectedCode) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      if (dirty) {
        const saveRes = await fetch(`/api/v1/scripts/${encodeURIComponent(selectedCode)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptType,
            scriptContent: content,
            pageCode: pageCode.trim() || null,
            remark: remark.trim() || null,
          }),
        });
        if (!saveRes.ok) throw new Error(await readError(saveRes));
      }
      const res = await fetch(`/api/v1/scripts/${encodeURIComponent(selectedCode)}/publish`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readError(res));
      applyScriptDetail((await res.json()) as ScriptDetail);
      setStatus(`已发布脚本 ${selectedCode}`);
      await loadScripts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableScript = async () => {
    if (!selectedCode) return;
    if (!window.confirm(`禁用脚本 ${selectedCode}？`)) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/scripts/${encodeURIComponent(selectedCode)}/disable`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readError(res));
      await loadScript(selectedCode);
      setStatus(`已禁用 ${selectedCode}`);
      await loadScripts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disable failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteScript = async () => {
    if (!selectedCode) return;
    if (!window.confirm(`删除脚本 ${selectedCode}？`)) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/scripts/${encodeURIComponent(selectedCode)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await readError(res));
      setSelectedCode(null);
      setDetail(null);
      setContent('');
      setDirty(false);
      setStatus(`已删除脚本`);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateScript = async () => {
    const code = newCode.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(code)) {
      setError('scriptCode 需为标识符，例如 ctrl_my_page 或 groovy_echo');
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/scripts/${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptType: newType,
          scriptContent: TEMPLATES[newType],
          status: 'DRAFT',
          remark: 'created from Script Console',
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNewCode('');
      await loadScripts();
      applyScriptDetail((await res.json()) as ScriptDetail);
      setView('scripts');
      setStatus(`已创建脚本 ${code}（DRAFT）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setLoading(false);
    }
  };

  // ---- endpoint actions ----
  const buildEndpointBody = (): Record<string, unknown> => {
    let requestSchema: unknown = {};
    let responseSchema: unknown = {};
    try {
      requestSchema = JSON.parse(epReqSchema || '{}');
    } catch {
      throw new Error('request schema 不是合法 JSON');
    }
    try {
      responseSchema = JSON.parse(epResSchema || '{}');
    } catch {
      throw new Error('response schema 不是合法 JSON');
    }
    return {
      scriptCode: epScriptCode.trim(),
      permCode: epPermCode.trim() || null,
      txMode: epTxMode,
      timeoutMs: epTimeoutMs,
      enabled: epEnabled,
      status: epStatus === 'PUBLISHED' ? 'PUBLISHED' : epStatus === 'DISABLED' ? 'DISABLED' : 'DRAFT',
      remark: epRemark.trim() || null,
      requestSchema,
      responseSchema,
    };
  };

  const handleSaveEndpoint = async (forceDraft = false) => {
    const code = (selectedEp || epCode).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(code)) {
      setError('endpointCode 需为标识符，例如 ep_slice_echo');
      return;
    }
    if (!epScriptCode.trim()) {
      setError('请选择绑定的 scriptCode（BACKEND_GROOVY）');
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const body = buildEndpointBody();
      if (forceDraft) body.status = 'DRAFT';
      const res = await fetch(`/api/v1/dynamic/${encodeURIComponent(code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      applyEndpointDetail((await res.json()) as EndpointDetail, code);
      setStatus(`已保存端点 ${code} → 调用 POST /api/v1/dynamic/${code}`);
      await loadEndpoints();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save endpoint failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePublishEndpoint = async () => {
    const code = (selectedEp || epCode).trim();
    if (!code) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      if (epDirty || !selectedEp) {
        const body = buildEndpointBody();
        const saveRes = await fetch(`/api/v1/dynamic/${encodeURIComponent(code)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!saveRes.ok) throw new Error(await readError(saveRes));
      }
      const res = await fetch(`/api/v1/dynamic/${encodeURIComponent(code)}/publish`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readError(res));
      applyEndpointDetail((await res.json()) as EndpointDetail, code);
      setStatus(`已发布端点 ${code}（会校验 Groovy 编译；脚本若仍为 DRAFT 会一并发布）`);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish endpoint failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableEndpoint = async () => {
    if (!selectedEp) return;
    if (!window.confirm(`禁用端点 ${selectedEp}？`)) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/v1/dynamic/${encodeURIComponent(selectedEp)}/disable`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readError(res));
      applyEndpointDetail((await res.json()) as EndpointDetail, selectedEp);
      setStatus(`已禁用端点 ${selectedEp}`);
      await loadEndpoints();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disable failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEndpoint = async (scriptHint?: string) => {
    const code = newEpCode.trim() || `ep_${(scriptHint || epScriptCode || 'demo').replace(/^groovy_/, '')}`;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(code)) {
      setError('endpointCode 需为标识符');
      return;
    }
    const script = (scriptHint || epScriptCode || groovyScripts[0]?.scriptCode || '').trim();
    if (!script) {
      setError('没有可绑定的 BACKEND_GROOVY 脚本，请先创建并发布 Groovy');
      return;
    }
    setView('endpoints');
    blankEndpoint(script);
    setEpCode(code);
    setNewEpCode('');
    setEpDirty(true);
    setStatus(`填写后 Save / Publish 端点 ${code}（绑定 ${script}）`);
  };

  const handleTryEndpoint = async () => {
    const code = (selectedEp || epCode).trim();
    if (!code) {
      setError('先保存/选择端点再试调');
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    setTryResult(null);
    try {
      let body: unknown = {};
      try {
        body = JSON.parse(tryBody || '{}');
      } catch {
        throw new Error('试调 body 不是合法 JSON');
      }
      const res = await fetch(`/api/v1/dynamic/${encodeURIComponent(code)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw */
      }
      setTryResult(pretty);
      if (!res.ok) throw new Error(pretty || (await readError(res)));
      setStatus(`试调 OK · POST /api/v1/dynamic/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try failed');
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = () => {
    if (content.trim() && !window.confirm('用模板覆盖当前编辑器内容？')) return;
    setContent(TEMPLATES[scriptType]);
    markDirty();
  };

  const openBindForScript = (scriptCode: string) => {
    setView('endpoints');
    blankEndpoint(scriptCode);
    const suggested = `ep_${scriptCode.replace(/^groovy_/, '')}`;
    setEpCode(suggested);
    setEpDirty(true);
    setStatus(`新建端点绑定脚本 ${scriptCode}：填 endpointCode 后 Save → Publish`);
  };

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-fuchsia-700">
              Script Console
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              脚本 + 动态端点
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              在界面完成 <code className="rounded bg-slate-100 px-1">lc_script</code> 编写，以及{' '}
              <code className="rounded bg-slate-100 px-1">lc_dynamic_endpoint</code> 绑定发布。
              调用路径：<code className="rounded bg-slate-100 px-1">POST /api/v1/dynamic/&#123;endpointCode&#125;</code>
            </p>
          </div>
          <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setView('scripts')}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                view === 'scripts' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              脚本 Scripts
            </button>
            <button
              type="button"
              onClick={() => setView('endpoints')}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                view === 'endpoints' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              端点 Endpoints · {endpoints.length}
            </button>
          </div>
        </div>

        {view === 'scripts' ? (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                new script
              </span>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="ctrl_my_page"
                className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                type
              </span>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ScriptType)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleCreateScript()}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-50"
            >
              New script
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                new endpoint
              </span>
              <input
                value={newEpCode}
                onChange={(e) => setNewEpCode(e.target.value)}
                placeholder="ep_my_echo"
                className="w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleCreateEndpoint()}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-50"
            >
              New endpoint
            </button>
            <button
              type="button"
              onClick={() => {
                blankEndpoint();
                setStatus('空白端点表单 — 填 endpointCode / scriptCode 后 Save');
              }}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              清空表单
            </button>
          </div>
        )}
      </section>

      {(error || status) && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
            error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {error || status}
        </div>
      )}

      {view === 'scripts' ? (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_1fr]">
          <aside className="flex max-h-[75vh] flex-col rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <div className="space-y-2 border-b border-slate-100 p-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter code / page / remark…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-1">
                {(['ALL', ...TYPE_OPTIONS.map((o) => o.value)] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] ${
                      typeFilter === t
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t === 'ALL' ? 'ALL' : t.replace('BACKEND_', '').replace('PAGE_', 'P_')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void refreshAll().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))}
                className="w-full rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                刷新 · 脚本 {items.length} / 端点 {endpoints.length}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredScripts.map((item) => (
                <button
                  key={item.scriptCode}
                  type="button"
                  onClick={() => {
                    if (dirty && selectedCode && selectedCode !== item.scriptCode) {
                      if (!window.confirm('有未保存修改，切换将丢失。继续？')) return;
                    }
                    void loadScript(item.scriptCode);
                  }}
                  className={`mb-1 w-full rounded-2xl px-3 py-3 text-left transition ${
                    selectedCode === item.scriptCode
                      ? 'bg-fuchsia-50 ring-1 ring-fuchsia-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.scriptCode}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeClass(item.scriptType)}`}>
                      {item.scriptType}
                    </span>
                    <span className="text-[10px] text-slate-400">v{item.version ?? 1}</span>
                    {String(item.scriptType).includes('GROOVY') && (
                      <span className="text-[10px] text-violet-500">
                        ep:{endpoints.filter((e) => e.scriptCode === item.scriptCode).length}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {filteredScripts.length === 0 && (
                <div className="p-4 text-sm text-slate-500">暂无脚本。</div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-4">
            {!selectedCode || !detail ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                选择左侧脚本，或新建一条。
              </div>
            ) : (
              <>
                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Script</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-slate-900">{selectedCode}</div>
                        {dirty && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            未保存
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(detail.status)}`}>
                          {detail.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={loading} onClick={() => void handleSaveScript(false)} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40">
                        Save
                      </button>
                      <button type="button" disabled={loading} onClick={() => void handleSaveScript(true)} className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-900 disabled:opacity-40">
                        Draft
                      </button>
                      <button type="button" disabled={loading} onClick={() => void handlePublishScript()} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40">
                        Publish
                      </button>
                      <button type="button" disabled={loading} onClick={() => void handleDisableScript()} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 disabled:opacity-40">
                        Disable
                      </button>
                      <button type="button" disabled={loading} onClick={() => void handleDeleteScript()} className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700 disabled:opacity-40">
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="block space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">scriptType</span>
                      <select value={scriptType} onChange={(e) => { setScriptType(e.target.value as ScriptType); markDirty(); }} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                        {TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">pageCode</span>
                      <input value={pageCode} onChange={(e) => { setPageCode(e.target.value); markDirty(); }} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">remark</span>
                      <input value={remark} onChange={(e) => { setRemark(e.target.value); markDirty(); }} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <button type="button" onClick={applyTemplate} className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50">
                      插入模板
                    </button>
                    {scriptType === 'BACKEND_GROOVY' && (
                      <button
                        type="button"
                        onClick={() => openBindForScript(selectedCode)}
                        className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1 font-semibold text-violet-800 hover:bg-violet-100"
                      >
                        绑定为动态端点 →
                      </button>
                    )}
                    {scriptType === 'PAGE_CONTROLLER' && (
                      <span>
                        页面 config：
                        <code className="ml-1 rounded bg-slate-100 px-1">
                          {`"controller": { "scriptCode": "${selectedCode}", "enabled": true }`}
                        </code>
                      </span>
                    )}
                  </div>

                  {scriptType === 'BACKEND_GROOVY' && (
                    <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-[12px] text-violet-900">
                      <div className="font-semibold">已绑定端点</div>
                      {boundForSelectedScript.length === 0 ? (
                        <div className="mt-1 text-violet-700/80">尚未绑定。点「绑定为动态端点」在界面完成。</div>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {boundForSelectedScript.map((ep) => (
                            <li key={ep.endpointCode} className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="font-mono font-semibold underline-offset-2 hover:underline"
                                onClick={() => {
                                  setView('endpoints');
                                  void loadEndpoint(ep.endpointCode);
                                }}
                              >
                                {ep.endpointCode}
                              </button>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(ep.status)}`}>
                                {ep.status}
                              </span>
                              <span className="text-violet-700/70">POST /api/v1/dynamic/{ep.endpointCode}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">script_content</span>
                    <span className="text-[11px] text-slate-400">{content.length} chars</span>
                  </div>
                  <textarea
                    value={content}
                    onChange={(e) => { setContent(e.target.value); markDirty(); }}
                    spellCheck={false}
                    className="min-h-[420px] flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-5 text-slate-900 outline-none focus:border-fuchsia-400"
                  />
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[300px_1fr]">
          <aside className="flex max-h-[75vh] flex-col rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <div className="space-y-2 border-b border-slate-100 p-3">
              <input
                value={epFilter}
                onChange={(e) => setEpFilter(e.target.value)}
                placeholder="Filter endpoint / script…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void loadEndpoints().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))}
                className="w-full rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                刷新端点 · {endpoints.length}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredEndpoints.map((ep) => (
                <button
                  key={ep.endpointCode}
                  type="button"
                  onClick={() => {
                    if (epDirty && selectedEp && selectedEp !== ep.endpointCode) {
                      if (!window.confirm('端点表单有未保存修改，切换？')) return;
                    }
                    void loadEndpoint(ep.endpointCode);
                  }}
                  className={`mb-1 w-full rounded-2xl px-3 py-3 text-left transition ${
                    selectedEp === ep.endpointCode
                      ? 'bg-violet-50 ring-1 ring-violet-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-slate-900">{ep.endpointCode}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(ep.status)}`}>
                      {ep.status}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-slate-500">→ {ep.scriptCode}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                    {ep.txMode || 'REQUIRED'} · {ep.enabled === false ? 'off' : 'on'}
                  </div>
                </button>
              ))}
              {filteredEndpoints.length === 0 && (
                <div className="p-4 text-sm text-slate-500">暂无端点。用 New endpoint 创建绑定。</div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Dynamic Endpoint</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-slate-900">
                      {selectedEp || epCode || '（新建）'}
                    </div>
                    {epDirty && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        未保存
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(epStatus)}`}>
                      {epStatus}
                    </span>
                  </div>
                  {(selectedEp || epCode) && (
                    <div className="mt-1 font-mono text-[11px] text-slate-500">
                      POST /api/v1/dynamic/{selectedEp || epCode}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={loading} onClick={() => void handleSaveEndpoint(false)} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40">
                    Save
                  </button>
                  <button type="button" disabled={loading} onClick={() => void handleSaveEndpoint(true)} className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-900 disabled:opacity-40">
                    Draft
                  </button>
                  <button type="button" disabled={loading} onClick={() => void handlePublishEndpoint()} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40">
                    Publish
                  </button>
                  <button type="button" disabled={loading || !selectedEp} onClick={() => void handleDisableEndpoint()} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 disabled:opacity-40">
                    Disable
                  </button>
                  <button type="button" disabled={loading || !selectedEp} onClick={() => void handleTryEndpoint()} className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40">
                    Try invoke
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">endpointCode</span>
                  <input
                    value={epCode}
                    disabled={!!selectedEp}
                    onChange={(e) => { setEpCode(e.target.value); markEpDirty(); }}
                    placeholder="ep_slice_echo"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">scriptCode（Groovy）</span>
                  <select
                    value={epScriptCode}
                    onChange={(e) => { setEpScriptCode(e.target.value); markEpDirty(); }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <option value="">— 选择脚本 —</option>
                    {groovyScripts.map((s) => (
                      <option key={s.scriptCode} value={s.scriptCode}>
                        {s.scriptCode} ({s.status})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">permCode（可选）</span>
                  <input
                    value={epPermCode}
                    onChange={(e) => { setEpPermCode(e.target.value); markEpDirty(); }}
                    placeholder="留空=登录即可"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">txMode</span>
                  <select
                    value={epTxMode}
                    onChange={(e) => { setEpTxMode(e.target.value as TxMode); markEpDirty(); }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    {TX_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">timeoutMs</span>
                  <input
                    type="number"
                    min={500}
                    max={60000}
                    value={epTimeoutMs}
                    onChange={(e) => { setEpTimeoutMs(Number(e.target.value) || 5000); markEpDirty(); }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={epEnabled}
                    onChange={(e) => { setEpEnabled(e.target.checked); markEpDirty(); }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">enabled</span>
                </label>
                <label className="block space-y-1 text-sm md:col-span-2 xl:col-span-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">remark</span>
                  <input
                    value={epRemark}
                    onChange={(e) => { setEpRemark(e.target.value); markEpDirty(); }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">request schema JSON</span>
                  <textarea
                    value={epReqSchema}
                    onChange={(e) => { setEpReqSchema(e.target.value); markEpDirty(); }}
                    spellCheck={false}
                    className="h-40 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">response schema JSON</span>
                  <textarea
                    value={epResSchema}
                    onChange={(e) => { setEpResSchema(e.target.value); markEpDirty(); }}
                    spellCheck={false}
                    className="h-40 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px]"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Try invoke</div>
                  <div className="text-[11px] text-slate-500">对已 PUBLISHED 端点发 POST（需登录）</div>
                </div>
                <button
                  type="button"
                  disabled={loading || !selectedEp}
                  onClick={() => void handleTryEndpoint()}
                  className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white disabled:opacity-40"
                >
                  Run try
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <textarea
                  value={tryBody}
                  onChange={(e) => setTryBody(e.target.value)}
                  spellCheck={false}
                  className="min-h-[160px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px]"
                  placeholder='{"message":"hi"}'
                />
                <pre className="min-h-[160px] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-[11px] text-emerald-200">
                  {tryResult || '// response will appear here'}
                </pre>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
