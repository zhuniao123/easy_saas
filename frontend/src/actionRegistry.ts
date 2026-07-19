export interface SqlBindSpec {
  from: 'row' | 'form' | 'fixed' | 'request';
  field?: string;
  value?: unknown;
  required?: boolean;
}

export interface SqlTransactionConfig {
  timeoutSeconds?: number;
  refresh?: boolean;
  successMessage?: string;
  bind?: Record<string, SqlBindSpec>;
  fixedParams?: Record<string, unknown>;
  statements: Array<string | { sql: string; kind?: 'write' | 'assert'; name?: string }>;
}

export interface OpenQueryConfig {
  queryCode: string;
  title?: string;
  presentation?: 'drawer' | 'modal';
  pageSize?: number;
  bind?: Record<string, SqlBindSpec>;
}

export interface DrillDownRequest {
  queryCode: string;
  title: string;
  params: Record<string, unknown>;
  pageSize?: number;
}

export interface ActionConfig {
  code: string;
  label: string;
  /** builtin | sqlTransaction | openQuery | client */
  type?: string;
  /** Catalog key; defaults to code when type=sqlTransaction */
  actionCode?: string;
  handler?: string;
  dsl?: string;
  scope?: 'page' | 'row';
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  confirmText?: string;
  /** Page-embedded SQL tx (server still loads from DB; never sent as SQL body) */
  sqlTransaction?: SqlTransactionConfig;
  openQuery?: OpenQueryConfig;
  when?: {
    field: string;
    equals?: string | number | boolean;
    notEquals?: string | number | boolean;
    truthy?: boolean;
  };
}

export interface ColumnConfig {
  field: string;
  label?: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  hidden?: boolean;
  format?: 'text' | 'number' | 'boolean' | 'datetime' | 'date' | 'badge' | 'money' | 'percent';
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger';
  toneRules?: Array<{ when?: string; tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger' }>;
}

export interface FilterConfig {
  field: string;
  label: string;
  sourceField?: string;
  placeholder?: string;
  type?: 'text' | 'select' | 'date' | 'autocomplete';
  options?: 
    | Array<{ label: string; value: string }>
    | {
        source: 'static' | 'sql' | 'dict';
        items?: Array<{ label: string; value: string }>;
        queryCode?: string;
        labelField?: string;
        valueField?: string;
        keywordParam?: string;
        dictCode?: string;
      };
}

import type { Translator } from './i18n';

export interface ActionContext {
  row?: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  columns: ColumnConfig[];
  pageCode?: string;
  refresh: () => void;
  openCreate: (seed?: Record<string, unknown>) => void;
  openDrillDown?: (request: DrillDownRequest) => void;
  notify: (message: string) => void;
  t: Translator;
}

const resolveBindParams = (
  bind: Record<string, SqlBindSpec> | undefined,
  row: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const params: Record<string, unknown> = {};
  if (!bind) return params;
  for (const [name, spec] of Object.entries(bind)) {
    const from = spec.from || 'row';
    if (from === 'fixed') {
      params[name] = spec.value;
      continue;
    }
    if (from === 'row') {
      const field = spec.field || name;
      const value = row?.[field];
      if ((value === undefined || value === null || value === '') && spec.required !== false) {
        throw new Error(`Missing bind param :${name} from row.${field}`);
      }
      params[name] = value;
    }
  }
  return params;
};

const interpolateTitle = (template: string, row?: Record<string, unknown>) =>
  template.replace(/\{\{\s*row\.([a-zA-Z0-9_]+)\s*\}\}/g, (_, field: string) =>
    row?.[field] == null ? '' : String(row[field]),
  );

type ActionHandler = (config: ActionConfig, context: ActionContext) => void | Promise<void>;

const escapeCsvCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const downloadCsv = (columns: ColumnConfig[], rows: Array<Record<string, unknown>>) => {
  const header = columns.map((column) => escapeCsvCell(column.label || column.field)).join(',');
  const body = rows
    .map((row) => columns.map((column) => escapeCsvCell(row[column.field])).join(','))
    .join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `easy-saas-export-${Date.now()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const registry: Record<string, ActionHandler> = {
  refresh: (_unused, context) => {
    void _unused;
    context.refresh();
    context.notify(context.t('action.gridRefreshed'));
  },
  create_record: (_unused, context) => {
    void _unused;
    context.openCreate();
  },
  export_csv: (_unused, context) => {
    void _unused;
    downloadCsv(context.columns, context.rows);
    context.notify(context.t('action.exportedCsv', { count: context.rows.length }));
  },
  duplicate_row: (_unused, context) => {
    void _unused;
    if (!context.row) return;
    const nextRow = { ...context.row };
    delete nextRow.id;
    
    // Auto-append -COPY suffix to identifier strings to prevent unique key violations,
    // but avoid altering foreign keys ending with _code or _id
    Object.keys(nextRow).forEach((key) => {
      const val = nextRow[key];
      if (typeof val === 'string') {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey === 'no' ||
          lowerKey === 'name' ||
          lowerKey === 'title' ||
          lowerKey === 'code' ||
          lowerKey.endsWith('_no') ||
          lowerKey.endsWith('_name') ||
          lowerKey.endsWith('_title')
        ) {
          if (!val.endsWith('-COPY')) {
            nextRow[key] = `${val}-COPY`;
          }
        }
      }
    });

    context.openCreate(nextRow);
    context.notify(context.t('action.rowDuplicated'));
  },
};

const normalizeDslCommand = (command: string) => {
  const trimmed = command.trim();
  const aliases: Record<string, string> = {
    'grid.refresh': 'refresh',
    'grid.exportCsv': 'export_csv',
    'record.create': 'create_record',
    'record.duplicate': 'duplicate_row',
    refresh: 'refresh',
    export_csv: 'export_csv',
    create_record: 'create_record',
    duplicate_row: 'duplicate_row',
  };
  return aliases[trimmed] || trimmed;
};

const executeOpenQuery: ActionHandler = async (action, context) => {
  const cfg = action.openQuery;
  if (!cfg?.queryCode) {
    context.notify(context.t('action.notRegistered', { label: action.label }));
    return;
  }
  if (!context.openDrillDown) {
    context.notify('Drill-down UI is not available');
    return;
  }
  try {
    const params = resolveBindParams(cfg.bind, context.row);
    const title = interpolateTitle(cfg.title || `${action.label} · ${cfg.queryCode}`, context.row);
    context.openDrillDown({
      queryCode: cfg.queryCode,
      title,
      params,
      pageSize: cfg.pageSize || 20,
    });
  } catch (e) {
    context.notify(e instanceof Error ? e.message : 'openQuery failed');
  }
};

const executeSqlTransaction: ActionHandler = async (action, context) => {
  const actionCode = action.actionCode || action.code;
  if (!actionCode) {
    context.notify(context.t('action.notRegistered', { label: action.label }));
    return;
  }
  if (action.scope === 'row' && !context.row) {
    context.notify(context.t('action.notRegistered', { label: action.label }));
    return;
  }

  const res = await fetch(`/api/v1/actions/${encodeURIComponent(actionCode)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pageCode: context.pageCode,
      row: context.row || {},
      form: {},
      params: {},
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    refresh?: boolean;
    error?: string;
  };

  if (!res.ok) {
    const msg = data.message || data.error || `Action failed (${res.status})`;
    context.notify(msg);
    throw new Error(msg);
  }

  context.notify(data.message || context.t('action.gridRefreshed'));
  if (data.refresh !== false) {
    context.refresh();
  }
};

export const resolveActionHandler = (action: ActionConfig): ActionHandler | null => {
  const type = (action.type || '').toLowerCase();
  if (type === 'openquery' || action.openQuery) {
    return executeOpenQuery;
  }
  if (type === 'sqltransaction' || action.sqlTransaction) {
    return executeSqlTransaction;
  }

  const actionKey = action.handler || action.dsl;
  if (!actionKey) return null;

  if (actionKey.includes('|')) {
    const commands = actionKey
      .split('|')
      .map(normalizeDslCommand)
      .filter(Boolean)
      .map((command) => registry[command])
      .filter((handler): handler is ActionHandler => Boolean(handler));

    if (commands.length === 0) return null;

    return async (config, context) => {
      for (const command of commands) {
        await command(config, context);
      }
    };
  }

  return registry[normalizeDslCommand(actionKey)] ?? null;
};
