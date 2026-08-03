import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ActionConfig,
  type FilterConfig,
  type DrillDownRequest,
  defaultFilterOperator,
  resolveActionHandler,
} from './actionRegistry';
import { createTranslator, resolveLocale } from './i18n';
import { normalizePageDsl } from './pageDsl';
import { logEvent } from './logger';
import { editorTypeFromFieldType, htmlInputTypeForEditor } from './editors';
import {
  canConfig,
  filterActionsByPermission,
  filterColumnsByPermission,
  getFieldDenySet,
} from './runtime/permissions';
import DrillDownDrawer from './runtime/DrillDownDrawer';
import {
  buildSqlDataSourceSpec,
  ensureDefaultDataSourceProviders,
  resolveDataSource,
  type DataTable,
} from './runtime/dataSource';
import {
  ensureDefaultPageComponents,
  resolvePageComponentSpecs,
} from './runtime/componentRegistry';
import { resolveComponentStatus, type ComponentStatus } from './runtime/componentTypes';
import {
  registerBuiltinPageComponents,
  INDEPENDENT_DATA_COMPONENT_TYPES,
} from './runtime/components/registerBuiltins';
import ComponentHost, { type ComponentHostItem } from './runtime/components/ComponentHost';
import MasterDetailEditor from './runtime/components/MasterDetailEditor';
import WorkspaceShell from './runtime/components/WorkspaceShell';
import WizardShell from './runtime/components/WizardShell';
import type { SmartGridPageContext } from './runtime/components/SmartGrid';
import {
  mountPageController,
  type PageControllerRuntime,
} from './runtime/pageController';

ensureDefaultDataSourceProviders();
ensureDefaultPageComponents(registerBuiltinPageComponents);

interface PageConfig {
  pageCode: string;
  title: string;
  routePath?: string;
  queryCode?: string;
  entityCode?: string;
  config: unknown;
  writable?: boolean;
}

interface EntityConfig {
  entityCode: string;
  tableName?: string;
  primaryKey?: string;
  fields?: ColumnMeta[];
}

interface ColumnMeta {
  field: string;
  label: string;
  type: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'number' | 'boolean' | 'datetime' | 'date' | 'badge' | 'money' | 'percent' | 'dict';
  dictCode?: string;
  dictMap?: Record<string, string>;
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger';
  toneRules?: Array<{ when?: string; tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger' }>;
}

/** Smart Grid grid payload — DataTable contract (columns/rows/total/metadata). */
interface QueryResult {
  columns: ColumnMeta[];
  rows: Array<Record<string, unknown>>;
  total?: number;
  metadata?: Record<string, unknown>;
}

const toQueryResult = (table: DataTable): QueryResult => ({
  columns: (table.columns || []).map((col) => ({
    field: String(col.field || ''),
    label: String(col.label || col.field || ''),
    type: String(col.type || 'string'),
    width: typeof col.width === 'number' ? col.width : undefined,
    align: col.align === 'left' || col.align === 'center' || col.align === 'right' ? col.align : undefined,
    format:
      col.format === 'text' ||
      col.format === 'number' ||
      col.format === 'boolean' ||
      col.format === 'datetime' ||
      col.format === 'date' ||
      col.format === 'badge' ||
      col.format === 'money' ||
      col.format === 'percent' ||
      col.format === 'dict'
        ? col.format
        : undefined,
    dictCode: typeof col.dictCode === 'string' ? col.dictCode : undefined,
    tone:
      col.tone === 'default' ||
      col.tone === 'muted' ||
      col.tone === 'accent' ||
      col.tone === 'success' ||
      col.tone === 'danger'
        ? col.tone
        : undefined,
  })),
  rows: table.rows || [],
  total: table.total,
  metadata: table.metadata,
});

type EditorMode = 'create' | 'edit' | null;
type StudioPanel = 'sql' | 'page' | 'entity' | 'raw';
type SqlValidationState =
  | { status: 'idle'; message?: string | null }
  | { status: 'validating'; message?: string | null }
  | { status: 'valid'; message?: string | null }
  | { status: 'invalid'; message: string };

const inferInputType = (type: string) => {
  const editor = editorTypeFromFieldType(type);
  return htmlInputTypeForEditor(editor);
};

export default function PageLoader({
  pageCode,
  mode = 'runtime',
  onOpenConfig,
  onOpenPage,
}: {
  pageCode: string;
  mode?: 'config' | 'runtime';
  /** Shell can switch this page into Factory config mode */
  onOpenConfig?: () => void;
  /** Shell opens another page as a runtime tab */
  onOpenPage?: (targetPageCode: string, title?: string) => void;
}) {
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [queryCode, setQueryCode] = useState<string | null>(null);
  const [entityCode, setEntityCode] = useState<string | null>(null);
  const [sqlText, setSqlText] = useState('');
  const [countSqlText, setCountSqlText] = useState('');
  const [pageConfigJsonStr, setPageConfigJsonStr] = useState('');
  const [fieldsJsonStr, setFieldsJsonStr] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [rawSql, setRawSql] = useState('');
  const [executeStatus, setExecuteStatus] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC' | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  /** field → (value → label) for format=dict columns */
  const [columnDictMaps, setColumnDictMaps] = useState<Record<string, Record<string, string>>>({});

  const [entityFields, setEntityFields] = useState<ColumnMeta[]>([]);
  const [entityMeta, setEntityMeta] = useState<EntityConfig | null>(null);

  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [currentRow, setCurrentRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeStudioPanel, setActiveStudioPanel] = useState<StudioPanel>('sql');
  // Always show grid preview in config mode so editors can verify columns/actions while editing.
  const [showPreviewPanel, setShowPreviewPanel] = useState(true);
  const [sqlValidation, setSqlValidation] = useState<SqlValidationState>({ status: 'idle' });
  const [drillDown, setDrillDown] = useState<DrillDownRequest | null>(null);

  const [dynamicFilterOptions, setDynamicFilterOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [autocompleteLoading, setAutocompleteLoading] = useState<Record<string, boolean>>({});
  const [autocompleteActiveField, setAutocompleteActiveField] = useState<string | null>(null);
  const [autocompleteLabels, setAutocompleteLabels] = useState<Record<string, string>>({});
  const controllerRef = useRef<PageControllerRuntime | null>(null);
  /** Independent component slots (charts/stat/text) loaded via DataSource registry. */
  const [slotStates, setSlotStates] = useState<
    Record<string, { status: ComponentStatus; error?: string | null; data?: DataTable | null }>
  >({});
  const slotRefreshRef = useRef<Record<string, () => void>>({});

  const pageDsl = useMemo(
    () => normalizePageDsl(config?.config, config?.title || pageCode, config?.queryCode),
    [config, pageCode],
  );

  const isPageWritable = config?.writable === true;

  const locale = useMemo(() => resolveLocale(pageDsl.i18n.locale), [pageDsl.i18n.locale]);
  const t = useMemo(() => createTranslator(locale, pageDsl.i18n.messages), [locale, pageDsl.i18n.messages]);
  const pageModelValidation = useMemo(() => {
    try {
      if (!pageConfigJsonStr.trim()) return { valid: false, message: t('error.invalidPageModelJson') };
      JSON.parse(pageConfigJsonStr);
      return { valid: true, message: null };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : t('error.invalidPageModelJson') };
    }
  }, [pageConfigJsonStr, t]);
  const entityModelValidation = useMemo(() => {
    try {
      if (!fieldsJsonStr.trim()) return { valid: false, message: t('error.invalidJson') };
      JSON.parse(fieldsJsonStr);
      return { valid: true, message: null };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : t('error.invalidJson') };
    }
  }, [fieldsJsonStr, t]);

  // Page runtime permission policy lives in runtime/permissions (framework base), not ad-hoc here.
  const fieldDenies = useMemo(() => getFieldDenySet(), []);

  const runtimeColumns = useMemo<ColumnMeta[]>(() => {
    if (!queryResult) return [];
    const configured = pageDsl.table.columns || [];
    const source = configured.length === 0
      ? queryResult.columns
      : configured.reduce<ColumnMeta[]>((acc, column) => {
          if (column.hidden) return acc;
          const byField = new Map(queryResult.columns.map((c) => [c.field, c]));
          const matched = byField.get(column.field);
          if (!matched) return acc;
          const dictCode = column.dictCode;
          const format = column.format || matched.format;
          acc.push({
            ...matched,
            label: column.label || matched.label,
            width: column.width,
            align: column.align,
            format: format === 'dict' ? 'dict' : format || matched.format,
            dictCode,
            dictMap: columnDictMaps[column.field] || (dictCode ? columnDictMaps[dictCode] : undefined),
            tone: column.tone || matched.tone,
            toneRules: column.toneRules,
          });
          return acc;
        }, []);
    return filterColumnsByPermission(source, fieldDenies);
  }, [pageDsl.table.columns, queryResult, fieldDenies, columnDictMaps]);

  const pageActions = useMemo(
    () => filterActionsByPermission(pageDsl.table.actions, 'page'),
    [pageDsl.table.actions]
  );
  const rowActions = useMemo(
    () => filterActionsByPermission(pageDsl.table.actions, 'row'),
    [pageDsl.table.actions]
  );
  const showActionColumn = rowActions.length > 0 || (isPageWritable && (pageDsl.features.edit || pageDsl.features.delete));
  const filters = pageDsl.table.filters;
  const rowPaddingClass = pageDsl.features.density === 'compact' ? 'py-2.5' : 'py-4';
  const showConfigSidebar = mode === 'config';

  const notify = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2500);
  };

  const emitControllerEvent = useCallback(
    (type: string, componentCode?: string, payload?: Record<string, unknown>) => {
      try {
        controllerRef.current?.dispatch({ type, componentCode, payload });
      } catch (err) {
        console.error('[PageController] dispatch failed', err);
      }
    },
    [],
  );

  // Mount published page controller when page DSL binds controller.scriptCode.
  useEffect(() => {
    let cancelled = false;
    const scriptCode = pageDsl.controller?.enabled === false ? null : pageDsl.controller?.scriptCode;
    if (!scriptCode || !config) {
      void controllerRef.current?.dispose();
      controllerRef.current = null;
      return;
    }

    void (async () => {
      await controllerRef.current?.dispose();
      if (cancelled) return;
      const runtime = await mountPageController({
        pageCode,
        scriptCode,
        notify,
        openPage: (next) => {
          if (onOpenPage) {
            onOpenPage(next);
            return;
          }
          notify(`openPage: ${next}（壳层未接入跳转）`);
        },
      });
      if (cancelled) {
        await runtime?.dispose();
        return;
      }
      controllerRef.current = runtime;
      if (runtime) {
        runtime.dispatch({ type: 'ready', payload: { scriptCode, version: runtime.version } });
      }
    })();

    return () => {
      cancelled = true;
      void controllerRef.current?.dispose();
      controllerRef.current = null;
    };
    // notify / onOpenPage intentionally not listed — remount only when controller binding or page changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCode, pageDsl.controller?.scriptCode, pageDsl.controller?.enabled, config?.pageCode, onOpenPage]);

  const normalizeRequestParams = (params: Record<string, string>) =>
    Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value.trim() === '' ? null : value]));

  const primaryKeyField = entityMeta?.primaryKey || 'id';
  const studioPanels: Array<{ key: StudioPanel; label: string }> = [
    { key: 'sql', label: t('page.sqlSource') },
    { key: 'page', label: t('page.pageModelJson') },
    { key: 'entity', label: t('page.entityFieldsJson') },
    { key: 'raw', label: t('page.remoteRawSqlConsole') },
  ];

  const mergePageConfigWithSuggestion = (currentConfig: unknown, suggestion: unknown) => {
    const current = currentConfig && typeof currentConfig === 'object' ? (currentConfig as Record<string, unknown>) : {};
    const next = suggestion && typeof suggestion === 'object' ? (suggestion as Record<string, unknown>) : {};
    const currentTable = current.table && typeof current.table === 'object' ? (current.table as Record<string, unknown>) : {};
    const nextTable = next.table && typeof next.table === 'object' ? (next.table as Record<string, unknown>) : {};
    const currentDataSource =
      current.dataSource && typeof current.dataSource === 'object' ? (current.dataSource as Record<string, unknown>) : {};
    const nextDataSource =
      next.dataSource && typeof next.dataSource === 'object' ? (next.dataSource as Record<string, unknown>) : {};

    return {
      ...current,
      ...next,
      dataSource: {
        ...currentDataSource,
        ...nextDataSource,
      },
      table: {
        actions:
          Array.isArray(currentTable.actions) && currentTable.actions.length > 0
            ? currentTable.actions
            : nextTable.actions || [],
        ...currentTable,
        ...nextTable,
      },
    };
  };

  const introspectQueryModel = async (queryCodeValue: string) => {
    setSqlValidation({ status: 'validating', message: 'Inspecting SQL model...' });
    const res = await fetch(`/api/v1/queries/${queryCodeValue}/introspect`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error(await readApiError(res, t('error.failedToSaveSql')));
    }
    const data = await res.json();
    if (!data.valid) {
      setSqlValidation({ status: 'invalid', message: data.error || t('error.queryExecutionFailed') });
      throw new Error(data.error || t('error.queryExecutionFailed'));
    }
    setSqlValidation({ status: 'valid', message: 'SQL parsed and schema inferred.' });
    return data as {
      valid: true;
      pageConfig: Record<string, unknown>;
      entityFields: Array<Record<string, unknown>>;
      primaryKey?: string;
    };
  };

  const buildRowPayload = (row: Record<string, unknown>, mode: 'create' | 'edit') => {
    const entries = Object.entries(row).filter(([key, value]) => {
      if (!/^[a-zA-Z0-9_]+$/.test(key)) return false;
      if (mode === 'create' && key === primaryKeyField && (value === '' || value === null || value === undefined)) {
        return false;
      }
      return true;
    });

    return Object.fromEntries(entries);
  };

  const executeQuery = useCallback((
    queryCodeValue: string,
    nextPage = page,
    nextPageSize = pageSize,
    nextSortField = sortField,
    nextSortOrder = sortOrder,
    nextFilterValues = filterValues,
  ) => {
    const normalizedParams = normalizeRequestParams(nextFilterValues);
    const nextActiveFilters = filters
      .map((filter) => {
        const operator = defaultFilterOperator(filter.type, filter.operator);
        const opNorm = operator.toLowerCase().replace(/[_-]/g, '');
        const field = filter.sourceField || filter.field;
        if (opNorm === 'isnull' || opNorm === 'isnotnull') {
          // UI uses select "1" to activate null operators (avoid always-on filters).
          const enabled = String(normalizedParams[filter.field] || '').trim();
          if (!enabled) return null;
          return {
            field,
            label: filter.label,
            type: filter.type || 'text',
            operator,
            value: true,
          };
        }
        if (opNorm === 'between') {
          const from = String(normalizedParams[filter.field] || '').trim();
          const to = String(normalizedParams[`${filter.field}__to`] || '').trim();
          if (!from && !to) return null;
          return {
            field,
            label: filter.label,
            type: filter.type || 'text',
            operator: 'between',
            value: [from, to],
            valueFrom: from || null,
            valueTo: to || null,
          };
        }
        if (opNorm === 'in') {
          const raw = String(normalizedParams[filter.field] || '').trim();
          if (!raw) return null;
          return {
            field,
            label: filter.label,
            type: filter.type || 'text',
            operator: 'in',
            value: raw,
          };
        }
        const value = normalizedParams[filter.field] || '';
        if (!String(value).trim()) return null;
        return {
          field,
          label: filter.label,
          type: filter.type || 'text',
          operator,
          value,
        };
      })
      .filter((filter): filter is NonNullable<typeof filter> => filter != null);

    setLoadingQuery(true);
    setQueryError(null);

    logEvent(
      pageCode,
      pageDsl.logging,
      'query',
      queryCodeValue,
      `Fetching data query model: "${queryCodeValue}"`,
      { params: normalizedParams, filters: nextActiveFilters }
    );

    const spec = buildSqlDataSourceSpec(
      queryCodeValue,
      {
        ...normalizedParams,
        _page: nextPage,
        _pageSize: nextPageSize,
        _sortField: nextSortField,
        _sortOrder: nextSortOrder,
      },
      nextActiveFilters,
      pageCode,
    );

    resolveDataSource(spec)
      .then((data) => {
        const result = toQueryResult(data);
        setQueryResult(result);
        setTotal(result.total || 0);
        logEvent(
          pageCode,
          pageDsl.logging,
          'query',
          queryCodeValue,
          `Successfully fetched data query: ${result.rows?.length || 0} rows retrieved`,
          { count: result.rows?.length || 0, total: result.total || 0 }
        );
      })
      .catch((err: Error) => {
        const errMsg = err.message || t('error.failedToLoadData');
        setQueryError(errMsg);
        logEvent(
          pageCode,
          pageDsl.logging,
          'query',
          queryCodeValue,
          `Failed to fetch query: ${errMsg}`,
          { error: errMsg }
        );
      })
      .finally(() => setLoadingQuery(false));
  }, [filterValues, filters, page, pageCode, pageDsl.logging, pageSize, sortField, sortOrder, t]);

  const refreshData = (
    nextPage = page,
    nextPageSize = pageSize,
    nextSortField = sortField,
    nextSortOrder = sortOrder,
    nextFilterValues = filterValues,
  ) => {
    if (!queryCode) return;
    executeQuery(queryCode, nextPage, nextPageSize, nextSortField, nextSortOrder, nextFilterValues);
  };

  const readApiError = async (res: Response, fallback: string) => {
    try {
      const body = await res.json();
      return String(body.message || body.error || fallback);
    } catch {
      return fallback;
    }
  };

  const loadQueryEditor = useCallback((queryCodeValue: string) => {
    fetch(`/api/v1/queries/${queryCodeValue}`)
      .then(async (res) => {
        if (!res.ok) {
          const msg = await readApiError(res, 'Failed to load query SQL');
          setSaveStatus(msg);
          setSqlText('');
          return null;
        }
        return res.json();
      })
      .then((queryConfig) => {
        if (!queryConfig) return;
        setSqlText(queryConfig.sqlText || '');
        setCountSqlText(queryConfig.countSqlText || '');
      })
      .catch(() => {
        setSqlText('');
        setCountSqlText('');
        setSaveStatus('Failed to load query SQL');
      });
  }, []);

  const closeEditor = () => {
    setEditorMode(null);
    setCurrentRow(null);
    setFormData({});
    setCrudError(null);
  };

  const openCreate = (seed?: Record<string, unknown>) => {
    setFormData(seed || {});
    setCurrentRow(null);
    setCrudError(null);
    setEditorMode('create');
  };

  const openEdit = (row: Record<string, unknown>) => {
    setCurrentRow(row);
    setFormData({ ...row });
    setCrudError(null);
    setEditorMode('edit');
  };

  const runAction = (action: ActionConfig, row?: Record<string, unknown>) => {
    const handler = resolveActionHandler(action);
    if (!handler || !queryResult) {
      notify(t('action.notRegistered', { label: action.label }));
      return;
    }

    logEvent(
      pageCode,
      pageDsl.logging,
      'click',
      action.code,
      `User clicked button: "${action.label}"`,
      {
        scope: action.scope,
        actionCode: action.actionCode || action.code,
        rowId: row ? row[primaryKeyField || 'id'] : undefined,
      }
    );

    void Promise.resolve(handler(action, {
      row,
      rows: queryResult.rows,
      columns: runtimeColumns.map((column) => ({ field: column.field, label: column.label })),
      pageCode,
      refresh: () => refreshData(),
      openCreate,
      openDrillDown: setDrillDown,
      openPage: (target, title) => {
        if (onOpenPage) {
          onOpenPage(target, title);
          return;
        }
        notify(`openPage: ${target}（壳层未接入跳转）`);
      },
      notify,
      t,
    })).catch(() => {
      /* notify already shown for sqlTransaction failures */
    });
  };

  const shouldShowAction = (action: ActionConfig, row?: Record<string, unknown>) => {
    if (!action.when || !row) return true;
    const value = row[action.when.field];
    if (action.when.truthy !== undefined) {
      const isTruthy = !!value;
      return action.when.truthy ? isTruthy : !isTruthy;
    }
    if (action.when.equals !== undefined) {
      return String(value) === String(action.when.equals);
    }
    if (action.when.notEquals !== undefined) {
      return String(value) !== String(action.when.notEquals);
    }
    return true;
  };

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/v1/pages/${pageCode}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load page configuration');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;

        setConfig({ ...data, config: data.config || {} });
        setPageConfigJsonStr(JSON.stringify(data.config || {}, null, 2));

        const normalizedPage = normalizePageDsl(data.config || {}, data.title, data.queryCode);
        const resolvedQueryCode = normalizedPage.dataSource.queryCode || data.queryCode;

        setFilterValues({});
        setAutocompleteLabels({});
        setAutocompleteSuggestions({});
        setDynamicFilterOptions({});
        setColumnDictMaps({});

        // Column format=dict → label maps
        const dictColumns = normalizedPage.table.columns.filter(
          (c) => c.dictCode || c.format === 'dict',
        );
        dictColumns.forEach((col) => {
          const dictCode = col.dictCode;
          if (!dictCode) return;
          fetch(`/api/v1/dicts/${encodeURIComponent(dictCode)}/options`)
            .then((res) => (res.ok ? res.json() : []))
            .then((items: Array<{ label?: string; value?: string }>) => {
              if (cancelled) return;
              const map: Record<string, string> = {};
              (items || []).forEach((it) => {
                if (it.value != null) map[String(it.value)] = String(it.label ?? it.value);
              });
              setColumnDictMaps((prev) => ({
                ...prev,
                [col.field]: map,
                [dictCode]: map,
              }));
            })
            .catch(() => {
              /* optional dict */
            });
        });

        // Trigger SQL / dict option lists loading
        const dynamicFilters = normalizedPage.table.filters.filter(
          (f) =>
            f.type === 'select' &&
            f.options &&
            !Array.isArray(f.options) &&
            'source' in f.options &&
            (f.options.source === 'sql' || f.options.source === 'dict'),
        );

        dynamicFilters.forEach((filter) => {
          const opts = filter.options as {
            source?: string;
            queryCode?: string;
            labelField?: string;
            valueField?: string;
            dictCode?: string;
          };
          if (opts.source === 'dict' && opts.dictCode) {
            fetch(`/api/v1/dicts/${encodeURIComponent(opts.dictCode)}/options`)
              .then((res) => {
                if (!res.ok) throw new Error();
                return res.json();
              })
              .then((data) => {
                if (cancelled) return;
                setDynamicFilterOptions((prev) => ({
                  ...prev,
                  [filter.field]: data,
                }));
              })
              .catch(() => {
                /* ignore dict load failure */
              });
            return;
          }
          if (opts.queryCode && opts.labelField && opts.valueField) {
            fetch(`/api/v1/queries/options/provide?queryCode=${opts.queryCode}&labelField=${opts.labelField}&valueField=${opts.valueField}`)
              .then((res) => {
                if (!res.ok) throw new Error();
                return res.json();
              })
              .then((data) => {
                if (cancelled) return;
                setDynamicFilterOptions((prev) => ({
                  ...prev,
                  [filter.field]: data,
                }));
              })
              .catch(() => {
                if (cancelled) return;
                setDynamicFilterOptions((prev) => ({
                  ...prev,
                  [filter.field]: [],
                }));
              });
          }
        });

        if (resolvedQueryCode) {
          const initialPageSize = normalizedPage.dataSource.pageSize || 10;
          const initialSortField = normalizedPage.dataSource.defaultSort?.field || null;
          const initialSortOrder = normalizedPage.dataSource.defaultSort?.order || null;

          setQueryCode(resolvedQueryCode);
          setPageSize(initialPageSize);
          setSortField(initialSortField);
          setSortOrder(initialSortOrder);
          executeQuery(resolvedQueryCode, 1, initialPageSize, initialSortField, initialSortOrder, {});
          loadQueryEditor(resolvedQueryCode);
        }

        if (data.entityCode) {
          setEntityCode(data.entityCode);
          fetch(`/api/v1/pages/entities/${data.entityCode}`)
            .then((res) => res.json())
            .then((entityConfig) => {
              if (cancelled) return;
              setEntityMeta(entityConfig);
              setFieldsJsonStr(JSON.stringify(entityConfig.fields || [], null, 2));
              setEntityFields(entityConfig.fields || []);
            })
            .catch(() => {
              if (cancelled) return;
              setEntityMeta(null);
              setFieldsJsonStr('[]');
              setEntityFields([]);
            });
        } else {
          setEntityMeta(null);
          setFieldsJsonStr('[]');
          setEntityFields([]);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setQueryError(err.message || 'Failed to load page');
      });

    return () => {
      cancelled = true;
    };
    // Page initialization should run only when switching pages.
    // executeQuery and t are intentionally excluded to avoid fetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCode]);

  const handleSort = (field: string) => {
    let nextOrder: 'ASC' | 'DESC' | null = 'ASC';
    if (sortField === field) {
      if (sortOrder === 'ASC') nextOrder = 'DESC';
      else if (sortOrder === 'DESC') nextOrder = null;
    }
    const nextField = nextOrder ? field : null;
    setSortField(nextField);
    setSortOrder(nextOrder);
    setPage(1);
    refreshData(1, pageSize, nextField, nextOrder);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    refreshData(nextPage, pageSize, sortField, sortOrder);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
    refreshData(1, nextPageSize, sortField, sortOrder);
  };

  const handleAutocompleteChange = (field: string, val: string, filter: FilterConfig) => {
    setAutocompleteLabels((prev) => ({ ...prev, [field]: val }));
    if (val.trim().length === 0) {
      setFilterValues((prev) => ({ ...prev, [field]: '' }));
      setAutocompleteSuggestions((prev) => ({ ...prev, [field]: [] }));
      return;
    }

    const opts = filter.options as { queryCode: string; labelField: string; valueField: string; keywordParam?: string };
    if (!opts || !opts.queryCode) return;

    setAutocompleteLoading((prev) => ({ ...prev, [field]: true }));
    const keywordParam = opts.keywordParam || 'keyword';
    
    fetch(`/api/v1/queries/options/suggest?queryCode=${opts.queryCode}&labelField=${opts.labelField}&valueField=${opts.valueField}&keyword=${encodeURIComponent(val)}&keywordParam=${keywordParam}`)
      .then((res) => res.json())
      .then((data) => {
        setAutocompleteSuggestions((prev) => ({ ...prev, [field]: data }));
      })
      .catch(() => {
        setAutocompleteSuggestions((prev) => ({ ...prev, [field]: [] }));
      })
      .finally(() => {
        setAutocompleteLoading((prev) => ({ ...prev, [field]: false }));
      });
  };

  const selectAutocompleteOption = (field: string, option: { label: string; value: string }) => {
    setAutocompleteLabels((prev) => ({ ...prev, [field]: option.label }));
    setFilterValues((prev) => ({ ...prev, [field]: option.value }));
    setAutocompleteActiveField(null);
  };

  const handleFilterApply = () => {
    setPage(1);
    refreshData(1, pageSize, sortField, sortOrder, filterValues);
    logEvent(
      pageCode,
      pageDsl.logging,
      'filter',
      'apply_filters',
      `User applied filters to grid`,
      { filters: filterValues }
    );
  };

  const handleInsert = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCrudError(null);
    try {
      const res = await fetch(`/api/v1/pages/${pageCode}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRowPayload(formData, 'create')),
      });
      if (!res.ok) throw new Error(t('error.failedToInsertRecord'));
      closeEditor();
      refreshData();
      notify(t('page.recordCreated'));
      logEvent(
        pageCode,
        pageDsl.logging,
        'create',
        'insert_row',
        `User successfully inserted a new record`,
        { formData }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('error.failedToInsertRecord');
      setCrudError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRow) return;
    setSubmitting(true);
    setCrudError(null);
    const id = currentRow[primaryKeyField];
    if (id === null || id === undefined || id === '') {
      setCrudError(`${t('error.failedToUpdateRecord')}: missing primary key "${primaryKeyField}"`);
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/pages/${pageCode}/data/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRowPayload(formData, 'edit')),
      });
      if (!res.ok) throw new Error(t('error.failedToUpdateRecord'));
      closeEditor();
      refreshData();
      notify(t('page.recordUpdated'));
      logEvent(
        pageCode,
        pageDsl.logging,
        'edit',
        `update_row_${id}`,
        `User successfully updated record with ID: ${id}`,
        { id, formData }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('error.failedToUpdateRecord');
      setCrudError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: Record<string, unknown>) => {
    const id = row[primaryKeyField];
    if (id === null || id === undefined || id === '') {
      window.alert(`${t('error.failedToDeleteRecord')}: missing primary key "${primaryKeyField}"`);
      return;
    }
    if (!window.confirm(t('page.rowDeletedConfirm', { id: String(id) }))) return;
    try {
      const res = await fetch(`/api/v1/pages/${pageCode}/data/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('error.failedToDeleteRecord'));
      refreshData();
      notify(t('page.recordDeleted'));
      logEvent(
        pageCode,
        pageDsl.logging,
        'delete',
        `delete_row_${id}`,
        `User successfully deleted record with ID: ${id}`,
        { id }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('error.failedToDeleteRecord');
      window.alert(message);
    }
  };

  const handleSaveSql = async () => {
    if (!queryCode) {
      setSaveStatus('No queryCode bound to this page — cannot save SQL.');
      return;
    }
    if (!sqlText.trim()) {
      setSaveStatus('SQL is empty — load failed or not yet filled in.');
      return;
    }
    setSaveStatus(t('status.savingSql'));
    try {
      const saveResponse = await fetch(`/api/v1/queries/${queryCode}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sqlText, countSqlText }),
      });
      if (!saveResponse.ok) {
        throw new Error(await readApiError(saveResponse, t('error.failedToSaveSql')));
      }

      const introspection = await introspectQueryModel(queryCode);
      const nextPageConfig = mergePageConfigWithSuggestion(config?.config, introspection.pageConfig);
      const nextPageConfigJson = JSON.stringify(nextPageConfig, null, 2);
      const nextEntityJson = JSON.stringify(introspection.entityFields || [], null, 2);

      const [pageSaveResponse, entitySaveResponse] = await Promise.all([
        fetch(`/api/v1/pages/${pageCode}/configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ configJson: JSON.stringify(nextPageConfig) }),
        }),
        entityCode
          ? fetch(`/api/v1/pages/entities/${entityCode}/configure`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fieldsJson: nextEntityJson,
                primaryKey: introspection.primaryKey || entityMeta?.primaryKey || null,
              }),
            })
          : Promise.resolve(new Response(null, { status: 200 })),
      ]);

      if (!pageSaveResponse.ok) {
        throw new Error(await readApiError(pageSaveResponse, t('error.failedToSavePageModel')));
      }
      if (!entitySaveResponse.ok) {
        throw new Error(await readApiError(entitySaveResponse, t('error.failedToSaveSchema')));
      }

      setConfig((prev) => (prev ? { ...prev, config: nextPageConfig } : prev));
      setPageConfigJsonStr(nextPageConfigJson);
      setFieldsJsonStr(nextEntityJson);
      setEntityMeta((prev) =>
        prev
          ? {
              ...prev,
              primaryKey: introspection.primaryKey || prev.primaryKey,
            }
          : prev,
      );
      setEntityFields((introspection.entityFields || []).map((field) => ({
        field: String(field.field || ''),
        label: String(field.label || field.field || ''),
        type: String(field.type || 'string'),
        width: typeof field.width === 'number' ? field.width : undefined,
        align: field.align === 'left' || field.align === 'center' || field.align === 'right' ? field.align : undefined,
        format:
          field.format === 'text' ||
          field.format === 'number' ||
          field.format === 'boolean' ||
          field.format === 'datetime' ||
          field.format === 'badge'
            ? field.format
            : undefined,
        tone:
          field.tone === 'default' ||
          field.tone === 'muted' ||
          field.tone === 'accent' ||
          field.tone === 'success' ||
          field.tone === 'danger'
            ? field.tone
            : undefined,
      })));
      setSaveStatus('SQL saved. Page model and entity model were refreshed from the query.');
      setShowPreviewPanel(true);
      setPage(1);
      refreshData(1, pageSize, sortField, sortOrder, filterValues);
      window.setTimeout(() => setSaveStatus(null), 3500);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error.failedToSaveSql');
      setSaveStatus(message);
    }
  };

  const handleSaveSchema = async () => {
    if (!entityCode) {
      setSaveStatus('No entityCode bound — cannot save entity model.');
      return;
    }
    if (!entityModelValidation.valid) {
      setSaveStatus(entityModelValidation.message || t('error.invalidJson'));
      return;
    }
    try {
      const parsed = JSON.parse(fieldsJsonStr);
      setEntityFields(parsed || []);
      setSaveStatus(t('status.savingSchema'));
      const res = await fetch(`/api/v1/pages/entities/${entityCode}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldsJson: fieldsJsonStr, primaryKey: entityMeta?.primaryKey || null }),
      });
      if (!res.ok) throw new Error(await readApiError(res, t('error.failedToSaveSchema')));
      setSaveStatus(t('status.schemaSaved'));
      window.setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : t('error.failedToSaveSchema'));
    }
  };

  const handleSavePageConfig = async () => {
    if (!pageModelValidation.valid) {
      setSaveStatus(pageModelValidation.message || t('error.invalidPageModelJson'));
      return;
    }
    try {
      const parsed = JSON.parse(pageConfigJsonStr);
      setConfig((prev) => (prev ? { ...prev, config: parsed } : prev));
      setPageConfigJsonStr(JSON.stringify(parsed, null, 2));
      setSaveStatus(t('status.savingPageModel'));
      const res = await fetch(`/api/v1/pages/${pageCode}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configJson: JSON.stringify(parsed) }),
      });
      if (!res.ok) throw new Error(await readApiError(res, t('error.failedToSavePageModel')));
      setSaveStatus(t('status.pageModelSaved'));
      const normalizedPage = normalizePageDsl(parsed, config?.title || pageCode, queryCode || undefined);
      const nextQueryCode = normalizedPage.dataSource.queryCode || queryCode;
      const nextPageSize = normalizedPage.dataSource.pageSize || pageSize;
      const nextSortField = normalizedPage.dataSource.defaultSort?.field || null;
      const nextSortOrder = normalizedPage.dataSource.defaultSort?.order || null;

      if (nextQueryCode) {
        setQueryCode(nextQueryCode);
        loadQueryEditor(nextQueryCode);
        setPage(1);
        setPageSize(nextPageSize);
        setSortField(nextSortField);
        setSortOrder(nextSortOrder);
        setFilterValues({});
        executeQuery(nextQueryCode, 1, nextPageSize, nextSortField, nextSortOrder, {});
      }
      window.setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : t('error.failedToSavePageModel'));
    }
  };

  const handleExecuteRawSql = () => {
    if (!rawSql.trim()) return;
    setExecuteStatus(t('status.executingRawSql'));
    fetch('/api/v1/queries/execute-raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: rawSql }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(t('error.rawSqlExecutionFailed'));
        return res.json();
      })
      .then(() => {
        setExecuteStatus(t('status.rawSqlExecuted'));
        refreshData();
        window.setTimeout(() => setExecuteStatus(null), 2500);
      })
      .catch((err) => setExecuteStatus(err.message || t('error.rawSqlExecutionFailed')));
  };

  const componentSpecs = useMemo(
    () =>
      resolvePageComponentSpecs({
        components: pageDsl.components,
        queryCode: queryCode || pageDsl.dataSource.queryCode,
        pageCode,
      }),
    [pageDsl.components, pageDsl.dataSource.queryCode, queryCode, pageCode],
  );

  // Load DataTable for registered non-grid components (charts/stat/text/probe with dataSource).
  // Batch state updates once so multi-chart pages don't thrash ECharts with N re-renders.
  useEffect(() => {
    let cancelled = false;
    const independent = componentSpecs.filter((spec) =>
      INDEPENDENT_DATA_COMPONENT_TYPES.has((spec.type || '').toLowerCase()),
    );

    const loadOne = async (spec: (typeof independent)[number]) => {
      const code = spec.componentCode;
      const ds = spec.dataSource;
      const type = (spec.type || '').toLowerCase();

      if (!ds || (!ds.queryCode && ds.type !== 'static' && !(ds.options && (ds.options as { rows?: unknown }).rows))) {
        if (type === 'text' || type === 'probe') {
          return { code, status: 'ready' as const, data: null, error: null };
        }
        return { code, status: 'empty' as const, data: null, error: null };
      }

      try {
        // sharedParams (page-level) < component dataSource.params < active filters
        const table = await resolveDataSource({
          type: ds.type || 'sql',
          queryCode: ds.queryCode,
          cacheKey: ds.cacheKey,
          params: {
            ...(pageDsl.sharedParams || {}),
            ...(ds.params || {}),
            ...Object.fromEntries(
              Object.entries(filterValues).filter(([, v]) => String(v || '').trim().length > 0),
            ),
          },
          options: ds.options,
        });
        return {
          code,
          status: resolveComponentStatus({
            hasDataPayload: true,
            rowCount: table.rows?.length ?? 0,
          }),
          data: table,
          error: null as string | null,
        };
      } catch (err) {
        return {
          code,
          status: 'error' as const,
          data: null,
          error: err instanceof Error ? err.message : 'Failed to load component data',
        };
      }
    };

    const refreshMap: Record<string, () => void> = {};
    const reloadAll = () => {
      // optimistic loading flags
      setSlotStates((prev) => {
        const next = { ...prev };
        for (const spec of independent) {
          const code = spec.componentCode;
          next[code] = { status: 'loading', data: prev[code]?.data ?? null, error: null };
        }
        return next;
      });
      void Promise.all(independent.map((spec) => loadOne(spec))).then((results) => {
        if (cancelled) return;
        setSlotStates((prev) => {
          const next = { ...prev };
          for (const r of results) {
            next[r.code] = { status: r.status, data: r.data, error: r.error };
          }
          return next;
        });
      });
    };

    for (const spec of independent) {
      refreshMap[spec.componentCode] = () => {
        void loadOne(spec).then((r) => {
          if (cancelled) return;
          setSlotStates((prev) => ({
            ...prev,
            [r.code]: { status: r.status, data: r.data, error: r.error },
          }));
        });
      };
    }
    slotRefreshRef.current = refreshMap;
    reloadAll();
    return () => {
      cancelled = true;
    };
  }, [componentSpecs, filterValues, pageDsl.sharedParams]);

  const smartGridStatus = resolveComponentStatus({
    loading: loadingQuery,
    error: queryError,
    rowCount: queryResult?.rows?.length ?? null,
    hasDataPayload: queryResult != null,
  });

  // Handlers are recreated each render (legacy PageLoader style); rebuilding context is intentional.
  const smartGridPageContext: SmartGridPageContext = {
    t,
    locale,
    // Keep panel subtitle as Smart Grid i18n label (not page presentation title).
    title: undefined,
    emptyState: pageDsl.presentation.emptyState,
    componentCode: pageCode ? `${pageCode}__grid` : 'mainGrid',
    onComponentEvent: (type, payload) =>
      emitControllerEvent(type, pageCode ? `${pageCode}__grid` : 'mainGrid', payload),
    filters,
    filterValues,
    setFilterValues,
    dynamicFilterOptions,
    autocompleteLabels,
    autocompleteSuggestions,
    autocompleteLoading,
    autocompleteActiveField,
    setAutocompleteActiveField,
    handleAutocompleteChange,
    selectAutocompleteOption,
    handleFilterApply,
    onResetFilters: () => {
      setFilterValues({});
      setAutocompleteLabels({});
      setAutocompleteSuggestions({});
      setPage(1);
      if (queryCode) {
        executeQuery(queryCode, 1, pageSize, sortField, sortOrder, {});
      }
    },
    pageActions,
    rowActions,
    showActionColumn,
    isPageWritable,
    features: pageDsl.features,
    openCreate,
    openEdit,
    handleDelete,
    runAction,
    shouldShowAction,
    columns: runtimeColumns,
    rows: queryResult?.rows || [],
    total,
    page,
    pageSize,
    sortField,
    sortOrder,
    pageSizeOptions: pageDsl.dataSource.pageSizeOptions,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
    rowPaddingClass,
    showConfigSidebar,
  };

  const componentHostItems: ComponentHostItem[] = componentSpecs.map((spec) => {
    const type = (spec.type || 'smartGrid').toLowerCase();
    if (type === 'smartgrid') {
      const table: DataTable | null = queryResult
        ? {
            columns: queryResult.columns.map((c) => ({
              field: c.field,
              label: c.label,
              type: c.type,
              width: c.width,
              align: c.align,
              format: c.format,
              tone: c.tone,
            })),
            rows: queryResult.rows,
            total: queryResult.total,
            metadata: queryResult.metadata,
          }
        : null;
      return {
        spec,
        status: smartGridStatus,
        error: queryError,
        data: table,
        properties: spec.properties,
        pageContext: smartGridPageContext as unknown as Record<string, unknown>,
        handle: {
          refresh: () => {
            if (queryCode) {
              executeQuery(queryCode, page, pageSize, sortField, sortOrder, filterValues);
            }
          },
          getData: () => table,
        },
      };
    }

    const slot = slotStates[spec.componentCode];
    return {
      spec,
      status: slot?.status || (config ? 'loading' : 'loading'),
      error: slot?.error ?? null,
      data: slot?.data ?? null,
      properties: spec.properties || {},
      handle: {
        refresh: () => slotRefreshRef.current[spec.componentCode]?.(),
        getData: () => slot?.data ?? null,
      },
    };
  });

  if (!config) {
    return <div className="p-8 text-center text-sm text-slate-400">{t('page.loadingWorkspace')}</div>;
  }

  return (
    <div className="relative mx-auto max-w-[1600px] space-y-6 px-6 py-8 lg:px-8">
      {toastMessage && (
        <div className="pointer-events-none fixed right-6 top-6 z-50 rounded-full border border-cyan-400/30 bg-slate-950/95 px-4 py-2 text-xs font-semibold text-cyan-100 shadow-[0_12px_40px_rgba(14,165,233,0.18)]">
          {toastMessage}
        </div>
      )}

      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.96))] p-7 text-white shadow-[0_16px_48px_rgba(2,6,23,0.26)] lg:p-8">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
              {pageDsl.presentation.badge || t('page.sqlFirstWorkspace')}
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
                {pageDsl.presentation.title || config.title}
              </h1>
              <p className="max-w-2xl text-sm leading-8 text-slate-300 sm:text-base">
                {pageDsl.presentation.description || t('page.runtimeDescription')}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3">
            {mode === 'runtime' && canConfig() && onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="rounded-full border border-amber-300/30 bg-amber-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-950 shadow-[0_0_16px_rgba(251,191,36,0.2)] transition hover:bg-amber-200"
              >
                {t('app.openConfig')}
              </button>
            )}
            {mode === 'config' && (
              <div className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                {t('page.configMode')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3.5 text-left text-xs text-slate-200 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.rows')}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{total}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.columns')}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{runtimeColumns.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.filters')}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{filters.length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.actions')}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{pageActions.length + rowActions.length}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showConfigSidebar && (
        <section className="space-y-4">
          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t('page.configMode')}</div>
                <div className="mt-2 text-xl font-semibold text-slate-950">{t('page.configModeTitle')}</div>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
                  配置态：编辑 SQL / Page JSON / Entity JSON 后点保存。下方表格为实时预览。若 SQL
                  区为空，说明查询加载失败（权限或绑定），请看上方红色/青色状态条。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {studioPanels.map((panel) => (
                  <button
                    key={panel.key}
                    onClick={() => setActiveStudioPanel(panel.key)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                      activeStudioPanel === panel.key
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700'
                    }`}
                  >
                    {panel.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowPreviewPanel((prev) => !prev)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  {showPreviewPanel ? 'Hide Preview' : 'Show Preview'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 text-white shadow-[0_30px_80px_rgba(2,6,23,0.4)]">
              <div className="border-b border-white/10 px-6 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300">{t('page.pageModel')}</div>
                <div className="mt-2 text-xl font-semibold">
                  {studioPanels.find((panel) => panel.key === activeStudioPanel)?.label}
                </div>
              </div>

              <div className="space-y-5 p-6">
                {saveStatus && (
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-xs text-cyan-100">
                    {saveStatus}
                  </div>
                )}

                {activeStudioPanel === 'sql' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => void handleSaveSql()}
                        disabled={!queryCode}
                        className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                      >
                        {t('page.saveSqlModel')}
                      </button>
                      <button
                        onClick={() => {
                          if (queryCode) {
                            void introspectQueryModel(queryCode).catch(() => undefined);
                          }
                        }}
                        disabled={!queryCode}
                        className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Validate SQL
                      </button>
                      <span
                        className={`text-xs ${
                          sqlValidation.status === 'invalid'
                            ? 'text-rose-300'
                            : sqlValidation.status === 'valid'
                              ? 'text-emerald-300'
                              : 'text-slate-400'
                        }`}
                      >
                        {sqlValidation.message || 'Save or validate the SQL model to refresh inferred page/entity metadata.'}
                      </span>
                    </div>
                    <textarea
                      value={sqlText}
                      onChange={(e) => {
                        setSqlText(e.target.value);
                        setSqlValidation({ status: 'idle', message: null });
                      }}
                      rows={18}
                      className="min-h-[28rem] w-full resize-y rounded-3xl border border-white/10 bg-slate-900 px-4 py-4 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400/40"
                    />
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Count SQL (optional)
                      </label>
                      <p className="text-xs text-slate-500">
                        Return one numeric value. Used when no runtime grid filters are active; filtered queries use automatic count.
                      </p>
                      <textarea
                        value={countSqlText}
                        onChange={(e) => setCountSqlText(e.target.value)}
                        rows={4}
                        placeholder="SELECT COUNT(*) FROM ..."
                        className="w-full resize-y rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400/40"
                      />
                    </div>
                  </div>
                )}

                {activeStudioPanel === 'page' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleSavePageConfig}
                        className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white"
                      >
                        {t('page.savePageModel')}
                      </button>
                      <span className={`text-xs ${pageModelValidation.valid ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {pageModelValidation.valid ? 'JSON syntax valid.' : pageModelValidation.message}
                      </span>
                    </div>
                    <textarea
                      value={pageConfigJsonStr}
                      onChange={(e) => setPageConfigJsonStr(e.target.value)}
                      rows={18}
                      className="min-h-[28rem] w-full resize-y rounded-3xl border border-white/10 bg-slate-900 px-4 py-4 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400/40"
                    />
                  </div>
                )}

                {activeStudioPanel === 'entity' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleSaveSchema}
                        disabled={!entityCode}
                        className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t('page.saveEntityModel')}
                      </button>
                      <span className={`text-xs ${entityModelValidation.valid ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {entityModelValidation.valid
                          ? 'Entity overrides syntax valid. Base field types come from database metadata.'
                          : entityModelValidation.message}
                      </span>
                    </div>
                    <textarea
                      value={fieldsJsonStr}
                      onChange={(e) => setFieldsJsonStr(e.target.value)}
                      rows={18}
                      className="min-h-[28rem] w-full resize-y rounded-3xl border border-white/10 bg-slate-900 px-4 py-4 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400/40"
                    />
                  </div>
                )}

                {activeStudioPanel === 'raw' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleExecuteRawSql}
                        className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950"
                      >
                        {t('page.executeRawSql')}
                      </button>
                      {executeStatus && <span className="text-xs text-amber-100">{executeStatus}</span>}
                    </div>
                    <textarea
                      value={rawSql}
                      onChange={(e) => setRawSql(e.target.value)}
                      placeholder="CREATE TABLE demo (...); INSERT INTO demo ...; SELECT * FROM demo;"
                      rows={18}
                      className="min-h-[28rem] w-full resize-y rounded-3xl border border-amber-300/20 bg-slate-900 px-4 py-4 font-mono text-sm text-slate-100 outline-none focus:border-amber-300/40"
                    />
                    <p className="text-xs leading-6 text-slate-400">{t('page.rawSqlHint')}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Bindings</div>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.route')}</div>
                    <div className="mt-2 font-mono text-xs text-slate-900">{config.routePath || config.pageCode}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.queryCode')}</div>
                    <div className="mt-2 font-mono text-xs text-slate-900">{queryCode || t('page.unbound')}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.entityCode')}</div>
                    <div className="mt-2 font-mono text-xs text-slate-900">{entityCode || t('page.unbound')}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Primary key</div>
                    <div className="mt-2 font-mono text-xs text-slate-900">{entityMeta?.primaryKey || 'id'}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Studio Notes</div>
                <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                  <p>SQL 保存后会自动校验，并回填默认 page model。</p>
                  <p>Entity JSON 只保留标签、格式、隐藏和语义增强，不再重复维护字段类型。</p>
                  <p>大表格只作为 preview，不再强占配置态的主工作区。</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {(!showConfigSidebar || showPreviewPanel) && (
      <section className="space-y-4">
        {pageDsl.masterDetail?.enabled ? (
          <MasterDetailEditor
            pageCode={pageCode}
            spec={pageDsl.masterDetail}
            listRows={queryResult?.rows}
            listLoading={loadingQuery}
            onRefreshList={() => {
              if (queryCode) {
                executeQuery(queryCode, page, pageSize, sortField, sortOrder, filterValues);
              }
            }}
          />
        ) : pageDsl.workspace?.enabled ? (
          <WorkspaceShell
            workspace={pageDsl.workspace}
            items={componentHostItems}
            onEvent={(event) => {
              if (event.type === 'requestOpenPage' && event.payload?.pageCode) {
                const target = String(event.payload.pageCode);
                const title =
                  event.payload.title != null ? String(event.payload.title) : undefined;
                if (onOpenPage) {
                  onOpenPage(target, title);
                } else {
                  notify(`openPage: ${target}（壳层未接入跳转）`);
                }
              }
              emitControllerEvent(event.type, event.componentCode, event.payload);
            }}
          />
        ) : pageDsl.wizard?.enabled ? (
          <WizardShell
            wizard={pageDsl.wizard}
            items={componentHostItems}
            onEvent={(event) => emitControllerEvent(event.type, event.componentCode, event.payload)}
            onFinish={async ({ state }) => {
              const code = pageDsl.wizard?.finishActionCode;
              if (!code) {
                notify('向导完成（未配置 finishActionCode）');
                return;
              }
              const res = await fetch(`/api/v1/actions/${encodeURIComponent(code)}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  pageCode,
                  params: { ...state },
                  row: {},
                  form: { ...state },
                }),
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(String(body.message || body.error || 'Finish action failed'));
              }
              notify(String(body.message || '操作成功'));
              if (queryCode) {
                executeQuery(queryCode, page, pageSize, sortField, sortOrder, filterValues);
              }
            }}
          />
        ) : (
          <ComponentHost
            items={componentHostItems}
            layout={pageDsl.layout}
            onEvent={(event) => emitControllerEvent(event.type, event.componentCode, event.payload)}
          />
        )}
      </section>
      )}

      {editorMode && (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]">
          <button className="absolute inset-0 cursor-default" onClick={closeEditor} aria-label="close editor panel" />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  {editorMode === 'create' ? t('page.createRow') : t('page.editRow')}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {editorMode === 'create' ? t('page.createRowTitle') : t('page.editRowTitle')}
                </div>
              </div>
              <button onClick={closeEditor} className="text-2xl text-slate-400">
                ×
              </button>
            </div>

            <form onSubmit={editorMode === 'create' ? handleInsert : handleUpdate} className="flex min-h-0 flex-1 flex-col">
              {crudError && <div className="mx-6 mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{crudError}</div>}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {entityFields.map((field) => (
                  <label key={field.field} className="block space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {field.label || field.field}
                    </span>
                    {field.type === 'boolean' ? (
                      <select
                        value={formData[field.field] ? 'true' : 'false'}
                        onChange={(e) => setFormData({ ...formData, [field.field]: e.target.value === 'true' })}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                      >
                        <option value="false">{t('page.false')}</option>
                        <option value="true">{t('page.true')}</option>
                      </select>
                    ) : (
                      <input
                        type={inferInputType(field.type)}
                        value={formData[field.field] !== undefined ? String(formData[field.field]) : ''}
                        disabled={editorMode === 'edit' && field.field === primaryKeyField}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            [field.field]:
                              field.type === 'integer' || field.type === 'number'
                                ? e.target.value === ''
                                  ? ''
                                  : Number(e.target.value)
                                : e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 disabled:opacity-50"
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-5">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  {t('page.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white"
                >
                  {editorMode === 'create'
                    ? submitting
                      ? t('page.creatingRecord')
                      : t('page.createRecord')
                    : submitting
                      ? t('page.savingChanges')
                      : t('page.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DrillDownDrawer request={drillDown} onClose={() => setDrillDown(null)} />
    </div>
  );
}
