import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ActionConfig, type FilterConfig, type DrillDownRequest, resolveActionHandler } from './actionRegistry';
import { createTranslator, resolveLocale } from './i18n';
import { normalizePageDsl } from './pageDsl';
import { logEvent } from './logger';
import { editorTypeFromFieldType, htmlInputTypeForEditor } from './editors';
import { formatDecoratedValue, resolveTone, toneClassName } from './runtime/decorators';
import {
  filterActionsByPermission,
  filterColumnsByPermission,
  getFieldDenySet,
} from './runtime/permissions';
import DrillDownDrawer from './runtime/DrillDownDrawer';

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
  format?: 'text' | 'number' | 'boolean' | 'datetime' | 'date' | 'badge' | 'money' | 'percent';
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger';
  toneRules?: Array<{ when?: string; tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger' }>;
}

interface QueryResult {
  columns: ColumnMeta[];
  rows: Array<Record<string, unknown>>;
  total?: number;
}

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
}: {
  pageCode: string;
  mode?: 'config' | 'runtime';
}) {
  const [config, setConfig] = useState<PageConfig | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [queryCode, setQueryCode] = useState<string | null>(null);
  const [entityCode, setEntityCode] = useState<string | null>(null);
  const [sqlText, setSqlText] = useState('');
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

  const [entityFields, setEntityFields] = useState<ColumnMeta[]>([]);
  const [entityMeta, setEntityMeta] = useState<EntityConfig | null>(null);

  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [currentRow, setCurrentRow] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeStudioPanel, setActiveStudioPanel] = useState<StudioPanel>('sql');
  const [showPreviewPanel, setShowPreviewPanel] = useState(mode !== 'config');
  const [sqlValidation, setSqlValidation] = useState<SqlValidationState>({ status: 'idle' });
  const [drillDown, setDrillDown] = useState<DrillDownRequest | null>(null);

  const [dynamicFilterOptions, setDynamicFilterOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [autocompleteLoading, setAutocompleteLoading] = useState<Record<string, boolean>>({});
  const [autocompleteActiveField, setAutocompleteActiveField] = useState<string | null>(null);
  const [autocompleteLabels, setAutocompleteLabels] = useState<Record<string, string>>({});

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
  const fieldDenies = useMemo(() => getFieldDenySet(), [config]);

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
          acc.push({
            ...matched,
            label: column.label || matched.label,
            width: column.width,
            align: column.align,
            format: column.format || matched.format,
            tone: column.tone || matched.tone,
            toneRules: column.toneRules,
          });
          return acc;
        }, []);
    return filterColumnsByPermission(source, fieldDenies);
  }, [pageDsl.table.columns, queryResult, fieldDenies]);

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
  const actionClassMap: Record<'primary' | 'secondary' | 'danger' | 'success', string> = {
    primary: 'border border-slate-200 bg-slate-950 text-white hover:bg-slate-800',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:text-cyan-700',
    success: 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    danger: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  };

  const notify = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2500);
  };

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
      throw new Error(t('error.failedToSaveSql'));
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
      .map((filter) => ({
        field: filter.sourceField || filter.field,
        label: filter.label,
        type: filter.type || 'text',
        value: normalizedParams[filter.field] || '',
      }))
      .filter((filter) => String(filter.value).trim().length > 0);

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

    fetch(`/api/v1/queries/${queryCodeValue}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        params: {
          ...normalizedParams,
          _page: nextPage,
          _pageSize: nextPageSize,
          _sortField: nextSortField,
          _sortOrder: nextSortOrder,
        },
        filters: nextActiveFilters,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(t('error.queryExecutionFailed'));
        return res.json();
      })
      .then((data) => {
        setQueryResult(data);
        setTotal(data.total || 0);
        logEvent(
          pageCode,
          pageDsl.logging,
          'query',
          queryCodeValue,
          `Successfully fetched data query: ${data.rows?.length || 0} rows retrieved`,
          { count: data.rows?.length || 0, total: data.total || 0 }
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
  }, [filterValues, filters, page, pageSize, sortField, sortOrder, t]);

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

  const loadQueryEditor = useCallback((queryCodeValue: string) => {
    fetch(`/api/v1/queries/${queryCodeValue}`)
      .then((res) => res.json())
      .then((queryConfig) => setSqlText(queryConfig.sqlText || ''))
      .catch(() => setSqlText(''));
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

    void handler(action, {
      row,
      rows: queryResult.rows,
      columns: runtimeColumns.map((column) => ({ field: column.field, label: column.label })),
      pageCode,
      refresh: () => refreshData(),
      openCreate,
      openDrillDown: setDrillDown,
      notify,
      t,
    }).catch(() => {
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

  const toneClass = (tone?: ColumnMeta['tone']) => {
    switch (tone) {
      case 'muted':
        return 'text-slate-500';
      case 'accent':
        return 'text-cyan-700';
      case 'success':
        return 'text-emerald-700';
      case 'danger':
        return 'text-rose-700';
      default:
        return 'text-slate-700';
    }
  };

  const formatCellValue = (column: ColumnMeta, value: unknown, row?: Record<string, unknown>) => {
    if (value === null || value === undefined || value === '') return '—';
    return formatDecoratedValue(value, {
      format: column.format || column.type,
      type: column.type,
      locale,
      row,
    });
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
    if (!queryCode) return;
    setSaveStatus(t('status.savingSql'));
    try {
      const saveResponse = await fetch(`/api/v1/queries/${queryCode}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sqlText }),
      });
      if (!saveResponse.ok) {
        throw new Error(t('error.failedToSaveSql'));
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

      if (!pageSaveResponse.ok || !entitySaveResponse.ok) {
        throw new Error(t('error.failedToSavePageModel'));
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

  const handleSaveSchema = () => {
    if (!entityCode) return;
    if (!entityModelValidation.valid) {
      setSaveStatus(entityModelValidation.message || t('error.invalidJson'));
      return;
    }
    const parsed = JSON.parse(fieldsJsonStr);
    setEntityFields(parsed || []);
    setSaveStatus(t('status.savingSchema'));
    fetch(`/api/v1/pages/entities/${entityCode}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldsJson: fieldsJsonStr, primaryKey: entityMeta?.primaryKey || null }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(t('error.failedToSaveSchema'));
        return res.json();
      })
      .then(() => {
        setSaveStatus(t('status.schemaSaved'));
        window.setTimeout(() => setSaveStatus(null), 2500);
      })
      .catch((err) => setSaveStatus(err.message || t('error.failedToSaveSchema')));
  };

  const handleSavePageConfig = () => {
    if (!pageModelValidation.valid) {
      setSaveStatus(pageModelValidation.message || t('error.invalidPageModelJson'));
      return;
    }
    const parsed = JSON.parse(pageConfigJsonStr);
    setConfig((prev) => (prev ? { ...prev, config: parsed } : prev));
    setPageConfigJsonStr(JSON.stringify(parsed, null, 2));
    setSaveStatus(t('status.savingPageModel'));
    fetch(`/api/v1/pages/${pageCode}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configJson: JSON.stringify(parsed) }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(t('error.failedToSavePageModel'));
        return res.json();
      })
      .then(() => {
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
      })
      .catch((err) => setSaveStatus(err.message || t('error.failedToSavePageModel')));
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

      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.16),_transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] p-6 text-white shadow-[0_30px_80px_rgba(2,6,23,0.38)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
              {pageDsl.presentation.badge || t('page.sqlFirstWorkspace')}
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                {pageDsl.presentation.title || config.title}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                {pageDsl.presentation.description || t('page.runtimeDescription')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-left text-xs text-slate-200 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.rows')}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{total}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.columns')}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{runtimeColumns.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.filters')}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{filters.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{t('page.actions')}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{pageActions.length + rowActions.length}</div>
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
                  配置态以 studio 为主，表格只作为预览面板按需展开，不再挤占第一视觉层。
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
        <div className="rounded-[26px] border border-slate-200 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{t('page.smartGrid')}</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{t('page.smartGridTitle')}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isPageWritable && pageDsl.features.create && (
                <button
                  onClick={() => openCreate()}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
                >
                  {t('page.addRecord')}
                </button>
              )}
              {pageActions.map((action) => (
                <button
                  key={action.code}
                  onClick={() => {
                    if (action.confirmText && !window.confirm(action.confirmText)) return;
                    runAction(action);
                  }}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    actionClassMap[action.variant || 'primary']
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {!showConfigSidebar && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              {t('page.pageModelHiddenRuntime')}
            </div>
          )}

          {filters.length > 0 && (
            <div className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
              {filters.map((filter) => (
                <label key={filter.field} className="space-y-1 text-xs font-medium text-slate-600">
                  <span>{filter.label}</span>
                  {filter.type === 'select' ? (
                    <select
                      value={filterValues[filter.field] || ''}
                      onChange={(e) => setFilterValues((prev) => ({ ...prev, [filter.field]: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                    >
                      <option value="">{t('page.all')}</option>
                      {filter.options && !Array.isArray(filter.options) && 'source' in filter.options && filter.options.source === 'sql'
                        ? (dynamicFilterOptions[filter.field] || []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))
                        : (Array.isArray(filter.options) ? filter.options : (filter.options?.items || [])).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                    </select>
                  ) : filter.type === 'autocomplete' ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={autocompleteLabels[filter.field] || ''}
                        onFocus={() => setAutocompleteActiveField(filter.field)}
                        onBlur={() => {
                          // Allow click selection to complete
                          setTimeout(() => setAutocompleteActiveField(null), 200);
                        }}
                        onChange={(e) => handleAutocompleteChange(filter.field, e.target.value, filter)}
                        placeholder={filter.placeholder || t('page.filterBy', { label: filter.label })}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                      />
                      {autocompleteActiveField === filter.field && (
                        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
                          {autocompleteLoading[filter.field] && (
                            <div className="px-4 py-2 text-xs text-slate-400">Loading...</div>
                          )}
                          {!autocompleteLoading[filter.field] && (autocompleteSuggestions[filter.field] || []).length === 0 && (
                            <div className="px-4 py-2 text-xs text-slate-400">No suggestions</div>
                          )}
                          {!autocompleteLoading[filter.field] && (autocompleteSuggestions[filter.field] || []).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => selectAutocompleteOption(filter.field, option)}
                              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-cyan-50"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type={filter.type === 'date' ? 'date' : 'text'}
                      value={filterValues[filter.field] || ''}
                      onChange={(e) => setFilterValues((prev) => ({ ...prev, [filter.field]: e.target.value }))}
                      placeholder={filter.placeholder || t('page.filterBy', { label: filter.label })}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                    />
                  )}
                </label>
              ))}
              <div className="flex items-end gap-2">
                <button
                  onClick={handleFilterApply}
                  className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  {t('page.applyFilters')}
                </button>
                <button
                  onClick={() => {
                    setFilterValues({});
                    setAutocompleteLabels({});
                    setAutocompleteSuggestions({});
                    setPage(1);
                    refreshData(1, pageSize, sortField, sortOrder, {});
                  }}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  {t('page.reset')}
                </button>
              </div>
            </div>
          )}

          {queryError && (
            <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {queryError}
            </div>
          )}

          {/* Query Loading State */}
          {loadingQuery && pageDsl.features.loading?.enabled !== false && pageDsl.features.loading?.showDefault !== false && (
            <>
              {pageDsl.features.loading?.style === 'skeleton' && (
                <div className="mt-6 overflow-hidden rounded-[26px] border border-slate-200/60 bg-white/50 dark:bg-slate-900/50 p-6 space-y-4">
                  <div className="flex gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                    {runtimeColumns.map((c, i) => (
                      <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700/60 rounded animate-pulse" style={{ width: c.width ? `${c.width}px` : '120px' }}></div>
                    ))}
                  </div>
                  {[1, 2, 3, 4, 5].map((rowIdx) => (
                    <div key={rowIdx} className="flex gap-4 py-2 border-b border-slate-50 dark:border-slate-800/40 last:border-0">
                      {runtimeColumns.map((c, i) => (
                        <div key={i} className="h-6 bg-slate-100 dark:bg-slate-800/30 rounded animate-pulse" style={{ width: c.width ? `${c.width}px` : '100px' }}></div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {pageDsl.features.loading?.style === 'glow' && (
                <div className="mt-6 relative overflow-hidden rounded-[26px] border border-cyan-500/20 bg-slate-950/80 p-8 shadow-[0_0_50px_rgba(6,182,212,0.15)] text-center py-20">
                  <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-[50px] animate-pulse"></div>
                  <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-[50px] animate-pulse"></div>
                  <div className="relative space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-400/30 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                      <svg className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-400 animate-pulse">
                      Streaming Data Engine
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Executing server raw SQL transaction log sequence...</p>
                  </div>
                </div>
              )}

              {(pageDsl.features.loading?.style === 'spinner' || !pageDsl.features.loading?.style) && (
                <div className="mt-6 flex flex-col items-center justify-center rounded-[26px] border border-slate-200/60 bg-white/50 dark:bg-slate-900/50 py-16">
                  <div className="relative h-12 w-12">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-20"></span>
                    <span className="relative flex h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-cyan-500"></span>
                  </div>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400 animate-pulse">
                    {t('page.streaming')}
                  </p>
                </div>
              )}
            </>
          )}

          {(!loadingQuery || pageDsl.features.loading?.enabled === false || pageDsl.features.loading?.showDefault === false) && queryResult && (
            <div className="mt-6 overflow-hidden rounded-[26px] border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead className="bg-slate-950 text-[11px] uppercase tracking-[0.24em] text-slate-300">
                    <tr>
                      {runtimeColumns.map((column) => (
                        <th
                          key={column.field}
                          onClick={() => handleSort(column.field)}
                          className="cursor-pointer px-5 py-4 font-semibold transition hover:bg-slate-900"
                          style={column.width ? { width: `${column.width}px` } : undefined}
                        >
                          <div className="flex items-center gap-2">
                            <span>{column.label}</span>
                            <span className="text-cyan-300">
                              {sortField === column.field ? (sortOrder === 'ASC' ? '▲' : sortOrder === 'DESC' ? '▼' : '•') : '⇅'}
                            </span>
                          </div>
                        </th>
                      ))}
                      {showActionColumn && (
                        <th className="px-5 py-4 text-right font-semibold">{t('page.tableActions')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
                    {queryResult.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={runtimeColumns.length + (showActionColumn ? 1 : 0)}
                          className="px-6 py-14 text-center text-sm text-slate-400"
                        >
                          {pageDsl.presentation.emptyState}
                        </td>
                      </tr>
                    ) : (
                      queryResult.rows.map((row, index) => (
                        <tr
                          key={index}
                          className="cursor-pointer transition hover:bg-cyan-50/50"
                          onDoubleClick={() => {
                            if (isPageWritable && pageDsl.features.edit) {
                              openEdit(row);
                            }
                          }}
                        >
                          {runtimeColumns.map((column) => {
                            const value = row[column.field];
                            const formattedValue = formatCellValue(column, value, row);
                            const effectiveTone = resolveTone(value, column.tone, column.toneRules, row);
                            const alignClass =
                              column.align === 'right'
                                ? 'text-right'
                                : column.align === 'center'
                                  ? 'text-center'
                                  : 'text-left';
                            return (
                              <td
                                key={column.field}
                                className={`px-5 ${rowPaddingClass} align-top ${alignClass}`}
                                style={column.width ? { width: `${column.width}px` } : undefined}
                              >
                                {column.format === 'badge' ? (
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneClassName(effectiveTone)}`}
                                  >
                                    {formattedValue}
                                  </span>
                                ) : column.type === 'boolean' || column.format === 'boolean' ? (
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      value
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {value ? t('page.true') : t('page.false')}
                                  </span>
                                ) : column.format === 'money' ||
                                  column.type === 'integer' ||
                                  column.type === 'number' ||
                                  column.format === 'number' ? (
                                  <span className={`font-mono ${toneClass(effectiveTone)}`}>{formattedValue}</span>
                                ) : (
                                  <span className={toneClass(effectiveTone)}>{formattedValue}</span>
                                )}
                              </td>
                            );
                          })}
                          {showActionColumn && (
                            <td className={`space-x-2 px-5 ${rowPaddingClass} text-right`}>
                              {rowActions.filter((action) => shouldShowAction(action, row)).map((action) => (
                                <button
                                  key={action.code}
                                  onClick={() => {
                                    if (action.confirmText && !window.confirm(action.confirmText)) return;
                                    runAction(action, row);
                                  }}
                                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                    actionClassMap[action.variant || 'secondary']
                                  }`}
                                >
                                  {action.label}
                                </button>
                              ))}
                              {isPageWritable && (pageDsl.features.edit || pageDsl.features.delete) && (
                                <>
                                  {pageDsl.features.edit && (
                                    <button
                                      onClick={() => openEdit(row)}
                                      className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                                    >
                                      {t('page.edit')}
                                    </button>
                                  )}
                                  {pageDsl.features.delete && (
                                    <button
                                      onClick={() => handleDelete(row)}
                                      className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-200"
                                    >
                                      {t('page.delete')}
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-medium text-slate-500">
                  {t('page.showing')} <span className="font-semibold text-slate-900">{total === 0 ? 0 : (page - 1) * pageSize + 1}</span>{' '}
                  {t('page.to')} <span className="font-semibold text-slate-900">{Math.min(page * pageSize, total)}</span>{' '}
                  {t('page.of')} <span className="font-semibold text-slate-900">{total}</span> {t('page.rowsLabel')}
                </div>
                {pageDsl.features.pagination ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {(pageDsl.dataSource.pageSizeOptions && pageDsl.dataSource.pageSizeOptions.length > 0
                        ? pageDsl.dataSource.pageSizeOptions
                        : [10, 20, 50, 100]
                      ).map((size) => (
                        <option key={size} value={size}>
                          {t('page.perPage', { size })}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={page === 1}
                      onClick={() => handlePageChange(page - 1)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      {t('page.previous')}
                    </button>
                    <button
                      disabled={page * pageSize >= total}
                      onClick={() => handlePageChange(page + 1)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      {t('page.next')}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t('page.paginationDisabled')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

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
