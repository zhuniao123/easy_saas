/**
 * Versioned JS Page Controller runtime (Slice 4).
 *
 * Controllers are ES modules stored in lc_script (type PAGE_CONTROLLER / FRONTEND_JS),
 * served only when status=PUBLISHED. Failures are isolated — never crash the page shell.
 */

import {
  getComponentHandle,
  listComponentHandles,
} from './componentRegistry';
import type { ComponentEvent, ComponentHandle } from './componentTypes';
import { resolveDataSource, type DataTable } from './dataSource';

export type PageControllerEventType =
  | 'change'
  | 'selectionChange'
  | 'itemClick'
  | 'rowClick'
  | 'submit'
  | 'filter'
  | 'sort'
  | 'pageChange'
  | 'ready'
  | 'error'
  | string;

export interface PageControllerEvent {
  type: PageControllerEventType;
  componentCode?: string;
  payload?: Record<string, unknown>;
  timestamp: number;
  pageCode: string;
}

export interface PageControllerStateApi {
  get: <T = unknown>(key: string) => T | undefined;
  set: (key: string, value: unknown) => void;
  patch: (values: Record<string, unknown>) => void;
  subscribe: (listener: (snapshot: Record<string, unknown>) => void) => () => void;
  snapshot: () => Record<string, unknown>;
}

export interface PageControllerUiApi {
  toast: (message: string) => void;
  confirm: (message: string) => boolean;
  log: (level: 'info' | 'warn' | 'error', message: string, detail?: unknown) => void;
}

export interface PageControllerContext {
  pageCode: string;
  scriptCode: string;
  version: number;
  state: PageControllerStateApi;
  components: {
    get: (componentCode: string) => ComponentHandle | null;
    list: () => ComponentHandle[];
    refresh: (componentCode: string) => void | Promise<void>;
  };
  query: {
    execute: (
      queryCode: string,
      params?: Record<string, unknown>,
      filters?: unknown[],
    ) => Promise<DataTable>;
  };
  action: {
    execute: (actionCode: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  /** Reserved for Slice 5 dynamic Groovy endpoints. */
  endpoint: {
    call: (endpointCode: string, body?: Record<string, unknown>) => Promise<unknown>;
  };
  navigation: {
    openPage: (pageCode: string) => void;
  };
  ui: PageControllerUiApi;
  emit: (event: Omit<PageControllerEvent, 'timestamp' | 'pageCode'> & { type: string }) => void;
}

export interface PageControllerModule {
  onInit?: (ctx: PageControllerContext) => void | Promise<void>;
  onReady?: (ctx: PageControllerContext) => void | Promise<void>;
  onEvent?: (event: PageControllerEvent, ctx: PageControllerContext) => void | Promise<void>;
  onDispose?: (ctx: PageControllerContext) => void | Promise<void>;
  onError?: (error: unknown, ctx: PageControllerContext) => void | Promise<void>;
  default?: PageControllerModule;
}

export interface PageControllerRuntime {
  scriptCode: string;
  version: number;
  ctx: PageControllerContext;
  dispatch: (event: Omit<PageControllerEvent, 'timestamp' | 'pageCode'> & { type: string }) => void;
  dispose: () => Promise<void>;
}

export interface PageControllerHostOptions {
  pageCode: string;
  scriptCode: string;
  notify?: (message: string) => void;
  openPage?: (pageCode: string) => void;
  fetchImpl?: typeof fetch;
}

function createStateApi(): PageControllerStateApi {
  const store: Record<string, unknown> = {};
  const listeners = new Set<(snapshot: Record<string, unknown>) => void>();
  const notify = () => {
    const snap = { ...store };
    listeners.forEach((l) => {
      try {
        l(snap);
      } catch {
        /* isolate subscriber errors */
      }
    });
  };
  return {
    get: <T = unknown>(key: string) => store[key] as T | undefined,
    set: (key, value) => {
      store[key] = value;
      notify();
    },
    patch: (values) => {
      Object.assign(store, values);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => ({ ...store }),
  };
}

function safeLog(level: 'info' | 'warn' | 'error', message: string, detail?: unknown) {
  const prefix = `[PageController] ${message}`;
  if (level === 'error') {
    console.error(prefix, detail);
  } else if (level === 'warn') {
    console.warn(prefix, detail);
  } else {
    console.info(prefix, detail);
  }
}

async function callHook(
  name: keyof PageControllerModule,
  runner: () => void | Promise<void>,
  onError?: (err: unknown) => void | Promise<void>,
): Promise<void> {
  try {
    await runner();
  } catch (err) {
    safeLog('error', `hook ${String(name)} failed`, err);
    if (onError) {
      try {
        await onError(err);
      } catch (inner) {
        safeLog('error', `onError handler failed`, inner);
      }
    }
  }
}

function prepareControllerSource(content: string): string {
  const trimmed = content.trim();
  if (/export\s+default/.test(trimmed)) {
    return content;
  }
  if (trimmed.startsWith('{')) {
    return `export default (${trimmed});\n`;
  }
  return `export default {\n${content}\n};\n`;
}

function unwrapControllerModule(loaded: PageControllerModule): PageControllerModule {
  if (loaded && typeof loaded === 'object' && loaded.default && typeof loaded.default === 'object') {
    return loaded.default as PageControllerModule;
  }
  return loaded;
}

/**
 * Evaluate controller source: prefer ES module blob import (browsers),
 * fall back to Function() for Node/Vitest and restricted environments.
 */
export async function evaluateControllerSource(content: string): Promise<PageControllerModule> {
  const source = prepareControllerSource(content);

  // Native ESM path (production browsers)
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
    try {
      const blob = new Blob([source], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        const loaded = (await import(/* @vite-ignore */ url)) as PageControllerModule;
        return unwrapControllerModule(loaded);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      // Node / Vitest often cannot import blob: URLs — use evaluator below.
    }
  }

  // Controlled evaluator: only supports `export default <expr>` shape.
  const body = source
    .replace(/export\s+default\s+/, 'return ')
    .replace(/^\s*export\s+\{[^;]*\};?\s*$/gm, '');
  const factory = new Function(`"use strict";\n${body}`);
  const result = factory();
  if (!result || typeof result !== 'object') {
    throw new Error('Page controller must export default object with lifecycle hooks');
  }
  return result as PageControllerModule;
}

/**
 * Load published controller source and evaluate as ES module (blob) or fallback evaluator.
 */
export async function loadPageControllerModule(
  scriptCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ mod: PageControllerModule; version: number; content: string }> {
  const res = await fetchImpl(`/api/v1/scripts/${encodeURIComponent(scriptCode)}/runtime`);
  if (!res.ok) {
    let message = `Failed to load page controller (${res.status})`;
    try {
      const body = await res.json();
      message = String(body.message || body.error || message);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const body = (await res.json()) as {
    scriptContent?: string;
    version?: number;
  };
  const content = body.scriptContent || '';
  const version = typeof body.version === 'number' ? body.version : 1;
  const mod = await evaluateControllerSource(content);
  return { mod, version, content };
}

export async function mountPageController(
  options: PageControllerHostOptions,
): Promise<PageControllerRuntime | null> {
  const fetchImpl = options.fetchImpl || fetch;
  const state = createStateApi();
  let disposed = false;
  let mod: PageControllerModule | null = null;

  const ui: PageControllerUiApi = {
    toast: (message) => {
      try {
        options.notify?.(message);
      } catch (err) {
        safeLog('warn', 'toast failed', err);
      }
    },
    confirm: (message) => {
      try {
        return window.confirm(message);
      } catch {
        return false;
      }
    },
    log: safeLog,
  };

  const runtime: PageControllerRuntime = {
    scriptCode: options.scriptCode,
    version: 0,
    ctx: null as unknown as PageControllerContext,
    dispatch: (partial) => {
      if (disposed || !mod) return;
      const event: PageControllerEvent = {
        type: partial.type,
        componentCode: partial.componentCode,
        payload: partial.payload,
        timestamp: Date.now(),
        pageCode: options.pageCode,
      };
      void callHook(
        'onEvent',
        () => mod?.onEvent?.(event, runtime.ctx),
        (err) => mod?.onError?.(err, runtime.ctx),
      );
    },
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      if (mod) {
        await callHook(
          'onDispose',
          () => mod?.onDispose?.(runtime.ctx),
          (err) => mod?.onError?.(err, runtime.ctx),
        );
      }
      mod = null;
    },
  };

  const ctx: PageControllerContext = {
    pageCode: options.pageCode,
    scriptCode: options.scriptCode,
    version: 0,
    state,
    components: {
      get: (code) => getComponentHandle(code),
      list: () => listComponentHandles(),
      refresh: async (code) => {
        const handle = getComponentHandle(code);
        if (handle) await handle.refresh();
      },
    },
    query: {
      execute: async (queryCode, params = {}, filters = []) =>
        resolveDataSource({
          type: 'sql',
          queryCode,
          params,
          options: { filters },
        }),
    },
    action: {
      execute: async (actionCode, params = {}) => {
        const res = await fetchImpl(`/api/v1/actions/${encodeURIComponent(actionCode)}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params, pageCode: options.pageCode }),
        });
        if (!res.ok) {
          let message = `Action failed (${res.status})`;
          try {
            const body = await res.json();
            message = String(body.message || body.error || message);
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }
        return res.json();
      },
    },
    endpoint: {
      call: async (endpointCode) => {
        throw new Error(
          `Dynamic endpoints are not implemented yet (Slice 5). Requested: ${endpointCode}`,
        );
      },
    },
    navigation: {
      openPage: (pageCode) => {
        if (options.openPage) {
          options.openPage(pageCode);
          return;
        }
        ui.toast(`Navigation to page "${pageCode}" is not wired in this host`);
      },
    },
    ui,
    emit: (event) => {
      runtime.dispatch(event);
    },
  };
  runtime.ctx = ctx;

  try {
    const loaded = await loadPageControllerModule(options.scriptCode, fetchImpl);
    mod = loaded.mod;
    runtime.version = loaded.version;
    ctx.version = loaded.version;
  } catch (err) {
    safeLog('error', `failed to load controller ${options.scriptCode}`, err);
    options.notify?.(`Page controller load failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  await callHook('onInit', () => mod?.onInit?.(ctx), (err) => mod?.onError?.(err, ctx));
  if (disposed) return null;
  await callHook('onReady', () => mod?.onReady?.(ctx), (err) => mod?.onError?.(err, ctx));
  return runtime;
}

/** Map component registry events into controller event envelope. */
export function toControllerEvent(
  pageCode: string,
  event: ComponentEvent,
): PageControllerEvent {
  return {
    type: event.type,
    componentCode: event.componentCode,
    payload: event.payload,
    timestamp: Date.now(),
    pageCode,
  };
}
