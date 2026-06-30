export interface ActionConfig {
  code: string;
  label: string;
  handler?: string;
  dsl?: string;
  scope?: 'page' | 'row';
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  confirmText?: string;
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
  format?: 'text' | 'number' | 'boolean' | 'datetime' | 'badge';
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger';
}

export interface FilterConfig {
  field: string;
  label: string;
  sourceField?: string;
  placeholder?: string;
  type?: 'text' | 'select' | 'date';
  options?: Array<{ label: string; value: string }>;
}

import type { Translator } from './i18n';

export interface ActionContext {
  row?: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  columns: ColumnConfig[];
  refresh: () => void;
  openCreate: (seed?: Record<string, unknown>) => void;
  notify: (message: string) => void;
  t: Translator;
}

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

export const resolveActionHandler = (action: ActionConfig): ActionHandler | null => {
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
