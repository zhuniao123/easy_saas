import type { ComponentRenderContext } from '../componentTypes';
import { ComponentEmptyState, ComponentErrorState, ComponentLoadingState } from './ComponentStates';

/**
 * Lightweight read-only grid bound to an independent dataSource (for workspace side panels).
 * Main editable Smart Grid remains page-level.
 */
export function renderSimpleGrid(ctx: ComponentRenderContext) {
  const { status, error, data, properties, onEvent, spec } = ctx;
  if (status === 'loading') return <ComponentLoadingState label="加载表格…" />;
  if (status === 'error') return <ComponentErrorState message={error || 'Load failed'} />;

  const rows = data?.rows || [];
  const columns =
    (data?.columns && data.columns.length > 0
      ? data.columns.map((c) => ({
          field: String(c.field),
          label: String(c.label || c.field),
        }))
      : rows[0]
        ? Object.keys(rows[0]).map((k) => ({ field: k, label: k }))
        : []) || [];

  const title = properties.title != null ? String(properties.title) : '';
  const maxRows = Number(properties.maxRows) > 0 ? Number(properties.maxRows) : 50;
  const shown = rows.slice(0, maxRows);

  if (status === 'empty' || rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        {title && <div className="mb-2 text-xs font-semibold text-slate-500">{title}</div>}
        <ComponentEmptyState message="无数据" />
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-xl border border-slate-100" data-component-type="simpleGrid">
      {title && (
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          {title}
        </div>
      )}
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            {columns.map((c) => (
              <th key={c.field} className="px-2 py-1.5 font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr
              key={i}
              className="cursor-pointer border-t border-slate-50 hover:bg-cyan-50/50"
              onClick={() =>
                onEvent?.({
                  type: 'rowClick',
                  componentCode: spec.componentCode,
                  payload: { row, name: String(row.member_name ?? row.name ?? row.id ?? i) },
                })
              }
            >
              {columns.map((c) => (
                <td key={c.field} className="px-2 py-1.5 text-slate-700">
                  {row[c.field] == null ? '' : String(row[c.field])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
