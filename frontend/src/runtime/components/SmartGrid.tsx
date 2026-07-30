import type { Dispatch, SetStateAction } from 'react';
import type { ActionConfig, FilterConfig } from '../../actionRegistry';
import { formatDecoratedValue, resolveTone, toneClassName } from '../decorators';
import type { ComponentRenderContext } from '../componentTypes';
import { ComponentErrorState, ComponentLoadingState } from './ComponentStates';

export interface SmartGridColumn {
  field: string;
  label: string;
  type: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: 'text' | 'number' | 'boolean' | 'datetime' | 'date' | 'badge' | 'money' | 'percent';
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger';
  toneRules?: Array<{ when?: string; tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger' }>;
}

export interface SmartGridPageContext {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale?: string;
  title?: string;
  emptyState?: string;
  componentCode?: string;
  /** Emit standard component events to page controller (Slice 4). */
  onComponentEvent?: (type: string, payload?: Record<string, unknown>) => void;
  filters: FilterConfig[];
  filterValues: Record<string, string>;
  setFilterValues: Dispatch<SetStateAction<Record<string, string>>>;
  dynamicFilterOptions: Record<string, Array<{ label: string; value: string }>>;
  autocompleteLabels: Record<string, string>;
  autocompleteSuggestions: Record<string, Array<{ label: string; value: string }>>;
  autocompleteLoading: Record<string, boolean>;
  autocompleteActiveField: string | null;
  setAutocompleteActiveField: (field: string | null) => void;
  handleAutocompleteChange: (field: string, value: string, filter: FilterConfig) => void;
  selectAutocompleteOption: (field: string, option: { label: string; value: string }) => void;
  handleFilterApply: () => void;
  onResetFilters: () => void;
  pageActions: ActionConfig[];
  rowActions: ActionConfig[];
  showActionColumn: boolean;
  isPageWritable: boolean;
  features: {
    create?: boolean;
    edit?: boolean;
    delete?: boolean;
    pagination?: boolean;
    loading?: { enabled?: boolean; style?: 'spinner' | 'skeleton' | 'glow'; showDefault?: boolean };
  };
  openCreate: () => void;
  openEdit: (row: Record<string, unknown>) => void;
  handleDelete: (row: Record<string, unknown>) => void;
  runAction: (action: ActionConfig, row?: Record<string, unknown>) => void;
  shouldShowAction: (action: ActionConfig, row?: Record<string, unknown>) => boolean;
  columns: SmartGridColumn[];
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  sortField: string | null;
  sortOrder: 'ASC' | 'DESC' | null;
  pageSizeOptions?: number[];
  handleSort: (field: string) => void;
  handlePageChange: (page: number) => void;
  handlePageSizeChange: (size: number) => void;
  rowPaddingClass: string;
  showConfigSidebar: boolean;
  density?: 'comfortable' | 'compact';
}

const actionClassMap: Record<'primary' | 'secondary' | 'danger' | 'success', string> = {
  primary: 'border border-slate-200 bg-slate-950 text-white hover:bg-slate-800',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:text-cyan-700',
  success: 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  danger: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
};

const toneClass = (tone?: string) => {
  if (tone === 'success') return 'text-emerald-700';
  if (tone === 'danger') return 'text-rose-700';
  if (tone === 'accent') return 'text-cyan-700';
  if (tone === 'muted') return 'text-slate-400';
  return 'text-slate-700';
};

function formatCellValue(
  column: SmartGridColumn,
  value: unknown,
  row?: Record<string, unknown>,
  locale?: string,
) {
  if (value === null || value === undefined || value === '') return '—';
  return formatDecoratedValue(value, {
    format: column.format || column.type,
    type: column.type,
    locale,
    row,
  });
}

function asGridContext(pageContext?: Record<string, unknown>): SmartGridPageContext | null {
  if (!pageContext || typeof pageContext !== 'object') return null;
  return pageContext as unknown as SmartGridPageContext;
}

/**
 * Registered Smart Grid renderer. PageLoader supplies pageContext (data + handlers);
 * new component types must not require changes here.
 */
export function renderSmartGrid(ctx: ComponentRenderContext) {
  const grid = asGridContext(ctx.pageContext);
  if (!grid) {
    return (
      <ComponentErrorState message="smartGrid requires pageContext from PageLoader (Slice 3 bridge)." />
    );
  }

  const loadingEnabled = grid.features.loading?.enabled !== false;
  const showDefaultLoading = grid.features.loading?.showDefault !== false;
  const showLoadingChrome = ctx.status === 'loading' && loadingEnabled && showDefaultLoading;
  const showTable =
    ctx.status !== 'loading' ||
    grid.features.loading?.enabled === false ||
    grid.features.loading?.showDefault === false;

  return (
    <div className="rounded-[26px] border border-slate-200 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            {grid.t('page.smartGrid')}
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {grid.title || grid.t('page.smartGridTitle')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {grid.isPageWritable && grid.features.create && (
            <button
              onClick={() => grid.openCreate()}
              className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              {grid.t('page.addRecord')}
            </button>
          )}
          {grid.pageActions.map((action) => (
            <button
              key={action.code}
              onClick={() => {
                if (action.confirmText && !window.confirm(action.confirmText)) return;
                grid.runAction(action);
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

      {!grid.showConfigSidebar && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          {grid.t('page.pageModelHiddenRuntime')}
        </div>
      )}

      {grid.filters.length > 0 && (
        <div className="mt-5 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
          {grid.filters.map((filter) => (
            <label key={filter.field} className="space-y-1 text-xs font-medium text-slate-600">
              <span>{filter.label}</span>
              {filter.type === 'select' ? (
                <select
                  value={grid.filterValues[filter.field] || ''}
                  onChange={(e) =>
                    grid.setFilterValues((prev) => ({ ...prev, [filter.field]: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                >
                  <option value="">{grid.t('page.all')}</option>
                  {filter.options && !Array.isArray(filter.options) && 'source' in filter.options && filter.options.source === 'sql'
                    ? (grid.dynamicFilterOptions[filter.field] || []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))
                    : (Array.isArray(filter.options) ? filter.options : filter.options?.items || []).map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                </select>
              ) : filter.type === 'autocomplete' ? (
                <div className="relative">
                  <input
                    type="text"
                    value={grid.autocompleteLabels[filter.field] || ''}
                    onFocus={() => grid.setAutocompleteActiveField(filter.field)}
                    onBlur={() => {
                      setTimeout(() => grid.setAutocompleteActiveField(null), 200);
                    }}
                    onChange={(e) => grid.handleAutocompleteChange(filter.field, e.target.value, filter)}
                    placeholder={filter.placeholder || grid.t('page.filterBy', { label: filter.label })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                  />
                  {grid.autocompleteActiveField === filter.field && (
                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
                      {grid.autocompleteLoading[filter.field] && (
                        <div className="px-4 py-2 text-xs text-slate-400">Loading...</div>
                      )}
                      {!grid.autocompleteLoading[filter.field] &&
                        (grid.autocompleteSuggestions[filter.field] || []).length === 0 && (
                          <div className="px-4 py-2 text-xs text-slate-400">No suggestions</div>
                        )}
                      {!grid.autocompleteLoading[filter.field] &&
                        (grid.autocompleteSuggestions[filter.field] || []).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => grid.selectAutocompleteOption(filter.field, option)}
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
                  value={grid.filterValues[filter.field] || ''}
                  onChange={(e) =>
                    grid.setFilterValues((prev) => ({ ...prev, [filter.field]: e.target.value }))
                  }
                  placeholder={filter.placeholder || grid.t('page.filterBy', { label: filter.label })}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400"
                />
              )}
            </label>
          ))}
          <div className="flex items-end gap-2">
            <button
              onClick={grid.handleFilterApply}
              className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              {grid.t('page.applyFilters')}
            </button>
            <button
              onClick={grid.onResetFilters}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              {grid.t('page.reset')}
            </button>
          </div>
        </div>
      )}

      {ctx.error && <ComponentErrorState message={ctx.error} />}

      {showLoadingChrome && (
        <ComponentLoadingState
          style={grid.features.loading?.style || 'spinner'}
          label={grid.t('page.streaming')}
          skeletonColumns={grid.columns}
        />
      )}

      {showTable && (ctx.data || grid.rows) && (
        <div className="mt-6 overflow-hidden rounded-[26px] border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-slate-950 text-[11px] uppercase tracking-[0.24em] text-slate-300">
                <tr>
                  {grid.columns.map((column) => (
                    <th
                      key={column.field}
                      onClick={() => grid.handleSort(column.field)}
                      className="cursor-pointer px-5 py-4 font-semibold transition hover:bg-slate-900"
                      style={column.width ? { width: `${column.width}px` } : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <span>{column.label}</span>
                        <span className="text-cyan-300">
                          {grid.sortField === column.field
                            ? grid.sortOrder === 'ASC'
                              ? '▲'
                              : grid.sortOrder === 'DESC'
                                ? '▼'
                                : '•'
                            : '⇅'}
                        </span>
                      </div>
                    </th>
                  ))}
                  {grid.showActionColumn && (
                    <th className="px-5 py-4 text-right font-semibold">{grid.t('page.tableActions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-sm text-slate-700">
                {grid.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={grid.columns.length + (grid.showActionColumn ? 1 : 0)}
                      className="px-6 py-14 text-center text-sm text-slate-400"
                    >
                      {grid.emptyState || 'No rows matched the current SQL and filter configuration.'}
                    </td>
                  </tr>
                ) : (
                  grid.rows.map((row, index) => (
                    <tr
                      key={index}
                      className="cursor-pointer transition hover:bg-cyan-50/50"
                      onClick={() => {
                        grid.onComponentEvent?.('rowClick', { row, index });
                        grid.onComponentEvent?.('itemClick', { row, index });
                      }}
                      onDoubleClick={() => {
                        grid.onComponentEvent?.('rowDblClick', { row, index });
                        if (grid.isPageWritable && grid.features.edit) {
                          grid.openEdit(row);
                        }
                      }}
                    >
                      {grid.columns.map((column) => {
                        const value = row[column.field];
                        const formattedValue = formatCellValue(column, value, row, grid.locale);
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
                            className={`px-5 ${grid.rowPaddingClass} align-top ${alignClass}`}
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
                                {value ? grid.t('page.true') : grid.t('page.false')}
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
                      {grid.showActionColumn && (
                        <td className={`space-x-2 px-5 ${grid.rowPaddingClass} text-right`}>
                          {grid.rowActions
                            .filter((action) => grid.shouldShowAction(action, row))
                            .map((action) => (
                              <button
                                key={action.code}
                                onClick={() => {
                                  if (action.confirmText && !window.confirm(action.confirmText)) return;
                                  grid.runAction(action, row);
                                }}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                  actionClassMap[action.variant || 'secondary']
                                }`}
                              >
                                {action.label}
                              </button>
                            ))}
                          {grid.isPageWritable && (grid.features.edit || grid.features.delete) && (
                            <>
                              {grid.features.edit && (
                                <button
                                  onClick={() => grid.openEdit(row)}
                                  className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                                >
                                  {grid.t('page.edit')}
                                </button>
                              )}
                              {grid.features.delete && (
                                <button
                                  onClick={() => grid.handleDelete(row)}
                                  className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-200"
                                >
                                  {grid.t('page.delete')}
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
              {grid.t('page.showing')}{' '}
              <span className="font-semibold text-slate-900">
                {grid.total === 0 ? 0 : (grid.page - 1) * grid.pageSize + 1}
              </span>{' '}
              {grid.t('page.to')}{' '}
              <span className="font-semibold text-slate-900">
                {Math.min(grid.page * grid.pageSize, grid.total)}
              </span>{' '}
              {grid.t('page.of')} <span className="font-semibold text-slate-900">{grid.total}</span>{' '}
              {grid.t('page.rowsLabel')}
            </div>
            {grid.features.pagination !== false ? (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={grid.pageSize}
                  onChange={(e) => grid.handlePageSizeChange(Number(e.target.value))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {(grid.pageSizeOptions && grid.pageSizeOptions.length > 0
                    ? grid.pageSizeOptions
                    : [10, 20, 50, 100]
                  ).map((size) => (
                    <option key={size} value={size}>
                      {grid.t('page.perPage', { size })}
                    </option>
                  ))}
                </select>
                <button
                  disabled={grid.page === 1}
                  onClick={() => grid.handlePageChange(grid.page - 1)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  {grid.t('page.previous')}
                </button>
                <button
                  disabled={grid.page * grid.pageSize >= grid.total}
                  onClick={() => grid.handlePageChange(grid.page + 1)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  {grid.t('page.next')}
                </button>
              </div>
            ) : (
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {grid.t('page.paginationDisabled')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
