import type { ActionConfig, ColumnConfig, FilterConfig } from './actionRegistry';
import type { ComponentSpec } from './runtime/componentTypes';

export type { ComponentSpec };

export interface PageDataSource {
  /**
   * Provider type registered in the DataSource registry.
   * Default `sql` when queryCode is set. `static` / `cache` reserved for Slice 2+.
   */
  type?: string;
  queryCode?: string;
  cacheKey?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  defaultSort?: {
    field: string;
    order: 'ASC' | 'DESC';
  };
  /** Provider options (e.g. static rows). Not used by default Smart Grid sql path. */
  options?: Record<string, unknown>;
}

export interface PagePresentation {
  title?: string;
  description?: string;
  badge?: string;
  emptyState?: string;
}

export interface PageLoadingConfig {
  enabled?: boolean;
  style?: 'spinner' | 'skeleton' | 'glow';
  showDefault?: boolean;
}

export interface PageFeatures {
  pagination?: boolean;
  create?: boolean;
  edit?: boolean;
  delete?: boolean;
  export?: boolean;
  density?: 'comfortable' | 'compact';
  loading?: PageLoadingConfig;
}

export interface PageLoggingConfig {
  enabled?: boolean;
  console?: boolean;
  reportToServer?: boolean;
  events?: ('click' | 'query' | 'create' | 'edit' | 'delete' | 'filter')[];
}

/** Slice 4: optional published page controller binding. */
export interface PageControllerConfig {
  scriptCode?: string;
  /** When false, controller is not mounted even if scriptCode is set. Default true. */
  enabled?: boolean;
}

export interface PageDslModel {
  i18n: {
    locale?: string;
    messages?: Record<string, string>;
  };
  presentation: PagePresentation;
  dataSource: PageDataSource;
  table: {
    columns: ColumnConfig[];
    filters: FilterConfig[];
    actions: ActionConfig[];
  };
  /**
   * Optional multi-component layout (Slice 3+).
   * When omitted, runtime defaults to a single smartGrid bound to dataSource.queryCode.
   */
  components?: ComponentSpec[];
  /** Optional JS page controller (published script only). */
  controller?: PageControllerConfig;
  features: Required<PageFeatures>;
  logging?: PageLoggingConfig;
}

const normalizeComponents = (raw: unknown): ComponentSpec[] | undefined => {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const dataSource =
        item.dataSource && typeof item.dataSource === 'object'
          ? (item.dataSource as Record<string, unknown>)
          : undefined;
      const bindings =
        item.bindings && typeof item.bindings === 'object'
          ? Object.fromEntries(
              Object.entries(item.bindings as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
            )
          : undefined;
      const properties =
        item.properties && typeof item.properties === 'object'
          ? (item.properties as Record<string, unknown>)
          : undefined;
      return {
        componentCode: String(item.componentCode || item.code || `component_${index + 1}`),
        type: String(item.type || 'smartGrid'),
        dataSource: dataSource
          ? {
              type: String(dataSource.type || 'sql'),
              queryCode: dataSource.queryCode != null ? String(dataSource.queryCode) : undefined,
              cacheKey: dataSource.cacheKey != null ? String(dataSource.cacheKey) : undefined,
              params:
                dataSource.params && typeof dataSource.params === 'object'
                  ? (dataSource.params as Record<string, unknown>)
                  : undefined,
              options:
                dataSource.options && typeof dataSource.options === 'object'
                  ? (dataSource.options as Record<string, unknown>)
                  : undefined,
            }
          : undefined,
        bindings,
        properties,
      } satisfies ComponentSpec;
    })
    .filter((c) => c.componentCode && c.type);
};

const normalizeColumns = (columns: unknown): ColumnConfig[] =>
  Array.isArray(columns)
    ? columns
        .filter((column): column is Record<string, unknown> => Boolean(column) && typeof column === 'object')
        .map((column) => {
          const align = column.align;
          const format = column.format;
          const tone = column.tone;
          return {
            field: String(column.field || ''),
            label: column.label ? String(column.label) : undefined,
            width: typeof column.width === 'number' ? column.width : undefined,
            align: align === 'center' || align === 'right' || align === 'left' ? align : undefined,
            hidden: column.hidden === true,
            format:
              format === 'number' ||
              format === 'boolean' ||
              format === 'datetime' ||
              format === 'date' ||
              format === 'badge' ||
              format === 'text' ||
              format === 'money' ||
              format === 'percent' ||
              format === 'dict'
                ? format
                : undefined,
            dictCode: column.dictCode ? String(column.dictCode) : undefined,
            tone:
              tone === 'muted' || tone === 'accent' || tone === 'success' || tone === 'danger' || tone === 'default'
                ? tone
                : undefined,
            toneRules: Array.isArray(column.toneRules)
              ? column.toneRules
                  .filter((rule): rule is Record<string, unknown> => Boolean(rule) && typeof rule === 'object')
                  .map((rule) => ({
                    when: rule.when ? String(rule.when) : undefined,
                    tone:
                      rule.tone === 'muted' ||
                      rule.tone === 'accent' ||
                      rule.tone === 'success' ||
                      rule.tone === 'danger' ||
                      rule.tone === 'default'
                        ? rule.tone
                        : undefined,
                  }))
              : undefined,
          } satisfies ColumnConfig;
        })
        .filter((column) => column.field)
    : [];

const normalizeFilters = (filters: unknown): FilterConfig[] =>
  Array.isArray(filters)
    ? filters
        .filter((filter): filter is Record<string, unknown> => Boolean(filter) && typeof filter === 'object')
        .map((filter) => {
          const type = filter.type;
          
          let parsedOptions: FilterConfig['options'] = undefined;
          const rawOptions = filter.options;
          if (Array.isArray(rawOptions)) {
            parsedOptions = rawOptions
              .filter((option): option is Record<string, unknown> => Boolean(option) && typeof option === 'object')
              .map((option) => ({
                label: String(option.label || option.value || ''),
                value: String(option.value || ''),
              }))
              .filter((option) => option.value.length > 0);
          } else if (rawOptions && typeof rawOptions === 'object') {
            const optObj = rawOptions as Record<string, unknown>;
            parsedOptions = {
              source:
                optObj.source === 'sql' ? 'sql' : optObj.source === 'dict' ? 'dict' : 'static',
              items: Array.isArray(optObj.items)
                ? optObj.items
                    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
                    .map((item) => ({
                      label: String(item.label || item.value || ''),
                      value: String(item.value || ''),
                    }))
                : undefined,
              queryCode: optObj.queryCode ? String(optObj.queryCode) : undefined,
              dictCode: optObj.dictCode ? String(optObj.dictCode) : undefined,
              labelField: optObj.labelField ? String(optObj.labelField) : undefined,
              valueField: optObj.valueField ? String(optObj.valueField) : undefined,
              keywordParam: optObj.keywordParam ? String(optObj.keywordParam) : undefined,
            };
          }

          const op = filter.operator ? String(filter.operator).trim() : undefined;
          return {
            field: String(filter.field || ''),
            label: String(filter.label || filter.field || ''),
            sourceField: filter.sourceField ? String(filter.sourceField) : undefined,
            placeholder: filter.placeholder ? String(filter.placeholder) : undefined,
            type:
              type === 'select' ||
              type === 'date' ||
              type === 'autocomplete' ||
              type === 'text' ||
              type === 'number'
                ? type
                : 'text',
            operator: op || undefined,
            options: parsedOptions,
          } satisfies FilterConfig;
        })
        .filter((filter) => filter.field)
    : [];

const normalizeActions = (actions: unknown): ActionConfig[] =>
  Array.isArray(actions)
    ? actions
        .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === 'object')
        .map((action) => {
          const scope = action.scope;
          const variant = action.variant;
          const type = action.type ? String(action.type) : undefined;
          return {
            code: String(action.code || action.label || ''),
            label: String(action.label || action.code || ''),
            type,
            actionCode: action.actionCode ? String(action.actionCode) : undefined,
            handler: action.handler ? String(action.handler) : undefined,
            dsl: action.dsl ? String(action.dsl) : undefined,
            scope: scope === 'row' ? 'row' : 'page',
            variant:
              variant === 'danger' || variant === 'success' || variant === 'secondary' || variant === 'primary'
                ? variant
                : undefined,
            confirmText: action.confirmText ? String(action.confirmText) : undefined,
            sqlTransaction:
              action.sqlTransaction && typeof action.sqlTransaction === 'object'
                ? (action.sqlTransaction as ActionConfig['sqlTransaction'])
                : undefined,
            openQuery:
              action.openQuery && typeof action.openQuery === 'object'
                ? (action.openQuery as ActionConfig['openQuery'])
                : undefined,
            openPage:
              action.openPage && typeof action.openPage === 'object'
                ? {
                    pageCode: String(
                      (action.openPage as Record<string, unknown>).pageCode || '',
                    ),
                    title: (action.openPage as Record<string, unknown>).title
                      ? String((action.openPage as Record<string, unknown>).title)
                      : undefined,
                    mode:
                      (action.openPage as Record<string, unknown>).mode === 'config'
                        ? 'config'
                        : 'runtime',
                  }
                : undefined,
            when:
              action.when && typeof action.when === 'object'
                ? {
                    field: String((action.when as Record<string, unknown>).field || ''),
                    equals: (action.when as Record<string, unknown>).equals as string | number | boolean | undefined,
                    notEquals: (action.when as Record<string, unknown>).notEquals as
                      | string
                      | number
                      | boolean
                      | undefined,
                    truthy:
                      typeof (action.when as Record<string, unknown>).truthy === 'boolean'
                        ? (action.when as Record<string, unknown>).truthy as boolean
                        : undefined,
                  }
                : undefined,
          } satisfies ActionConfig;
        })
        .filter((action) => action.code && action.label)
    : [];

export const normalizePageDsl = (
  rawConfig: unknown,
  fallbackTitle: string,
  fallbackQueryCode?: string,
): PageDslModel => {
  const config = rawConfig && typeof rawConfig === "object" ? (rawConfig as Record<string, unknown>) : {};

  const legacyColumns = normalizeColumns(config.columns);
  const legacyFilters = normalizeFilters(config.filters);
  const legacyActions = normalizeActions(config.actions);

  const presentation =
    config.presentation && typeof config.presentation === 'object'
      ? (config.presentation as Record<string, unknown>)
      : {};
  const dataSource =
    config.dataSource && typeof config.dataSource === 'object'
      ? (config.dataSource as Record<string, unknown>)
      : {};
  const table = config.table && typeof config.table === 'object' ? (config.table as Record<string, unknown>) : {};
  const features =
    config.features && typeof config.features === 'object'
      ? (config.features as Record<string, unknown>)
      : {};
  const i18n = config.i18n && typeof config.i18n === 'object' ? (config.i18n as Record<string, unknown>) : {};
  const logging = config.logging && typeof config.logging === 'object' ? (config.logging as Record<string, unknown>) : undefined;

  const tableColumns = normalizeColumns(table.columns);
  const tableFilters = normalizeFilters(table.filters);
  const tableActions = normalizeActions(table.actions);

  return {
    i18n: {
      locale: i18n.locale ? String(i18n.locale) : undefined,
      messages:
        i18n.messages && typeof i18n.messages === 'object'
          ? Object.fromEntries(
              Object.entries(i18n.messages as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
            )
          : undefined,
    },
    presentation: {
      title: presentation.title ? String(presentation.title) : fallbackTitle,
      description: presentation.description ? String(presentation.description) : undefined,
      badge: presentation.badge ? String(presentation.badge) : 'SQL-first workspace',
      emptyState: presentation.emptyState
        ? String(presentation.emptyState)
        : 'No rows matched the current SQL and filter configuration.',
    },
    dataSource: {
      queryCode: dataSource.queryCode ? String(dataSource.queryCode) : fallbackQueryCode,
      pageSize: typeof dataSource.pageSize === 'number' ? dataSource.pageSize : undefined,
      pageSizeOptions: Array.isArray(dataSource.pageSizeOptions)
        ? dataSource.pageSizeOptions
            .map((option) => Number(option))
            .filter((option) => Number.isFinite(option) && option > 0)
        : undefined,
      defaultSort:
        dataSource.defaultSort && typeof dataSource.defaultSort === 'object'
          ? {
              field: String((dataSource.defaultSort as Record<string, unknown>).field || ''),
              order:
                String((dataSource.defaultSort as Record<string, unknown>).order || '').toUpperCase() === 'DESC'
                  ? 'DESC'
                  : 'ASC',
            }
          : undefined,
    },
    table: {
      columns: tableColumns.length > 0 ? tableColumns : legacyColumns,
      filters: tableFilters.length > 0 ? tableFilters : legacyFilters,
      actions: tableActions.length > 0 ? tableActions : legacyActions,
    },
    components: normalizeComponents(config.components),
    controller: (() => {
      const raw =
        config.controller && typeof config.controller === 'object'
          ? (config.controller as Record<string, unknown>)
          : null;
      if (!raw) {
        // Legacy shortcut: controllerScriptCode at root
        if (config.controllerScriptCode) {
          return { scriptCode: String(config.controllerScriptCode), enabled: true };
        }
        return undefined;
      }
      const scriptCode = raw.scriptCode ? String(raw.scriptCode) : undefined;
      if (!scriptCode) return undefined;
      return {
        scriptCode,
        enabled: raw.enabled !== false,
      };
    })(),
    features: {
      pagination: features.pagination !== false,
      create: features.create === true,
      edit: features.edit === true,
      delete: features.delete === true,
      export: features.export !== false,
      density: features.density === 'compact' ? 'compact' : 'comfortable',
      loading: features.loading && typeof features.loading === 'object'
        ? {
            enabled: (features.loading as Record<string, unknown>).enabled !== false,
            style: ['spinner', 'skeleton', 'glow'].includes(String((features.loading as Record<string, unknown>).style || ''))
              ? (String((features.loading as Record<string, unknown>).style) as 'spinner' | 'skeleton' | 'glow')
              : 'spinner',
            showDefault: (features.loading as Record<string, unknown>).showDefault !== false,
          }
        : { enabled: true, style: 'spinner', showDefault: true },
    },
    logging: logging
      ? {
          enabled: logging.enabled !== false,
          console: logging.console !== false,
          reportToServer: logging.reportToServer === true,
          events: Array.isArray(logging.events)
            ? (logging.events
                .map((e) => String(e))
                .filter((e): e is NonNullable<PageLoggingConfig['events']>[number] =>
                  ['click', 'query', 'create', 'edit', 'delete', 'filter'].includes(e),
                ) as PageLoggingConfig['events'])
            : undefined,
        }
      : undefined,
  };
};
