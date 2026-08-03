import { useState } from 'react';
import { useWizardRuntime } from '../WizardContext';
import type { ComponentRenderContext } from '../componentTypes';
import { ComponentEmptyState, ComponentErrorState, ComponentLoadingState } from './ComponentStates';

/**
 * Lightweight grid bound to independent dataSource.
 * - selectable + selectionMap → writes wizard state on row click
 * - openPageOnClick → emit requestOpenPage for shell navigation + optional prefill storage
 */
function SimpleGridView(ctx: ComponentRenderContext) {
  const { status, error, data, properties, onEvent, spec } = ctx;
  const wizard = useWizardRuntime();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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
  const selectable = properties.selectable === true;
  const selectionMap =
    properties.selectionMap && typeof properties.selectionMap === 'object'
      ? (properties.selectionMap as Record<string, string>)
      : null;
  const openPageOnClick =
    properties.openPageOnClick && typeof properties.openPageOnClick === 'object'
      ? (properties.openPageOnClick as Record<string, unknown>)
      : null;
  const shown = rows.slice(0, maxRows);

  if (status === 'empty' || rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
        {title && <div className="mb-2 text-xs font-semibold text-slate-500">{title}</div>}
        <ComponentEmptyState message="无数据" />
      </div>
    );
  }

  const onRowClick = (row: Record<string, unknown>, i: number) => {
    const key = String(row.id ?? row.member_code ?? row.product_code ?? i);
    setSelectedKey(key);

    if (selectable && selectionMap && wizard) {
      const patch: Record<string, unknown> = {};
      for (const [stateKey, rowField] of Object.entries(selectionMap)) {
        patch[stateKey] = row[rowField];
      }
      wizard.setFields(patch);
    }

    if (openPageOnClick?.pageCode) {
      const map =
        openPageOnClick.map && typeof openPageOnClick.map === 'object'
          ? (openPageOnClick.map as Record<string, string>)
          : {};
      const prefill: Record<string, unknown> = {};
      for (const [k, rowField] of Object.entries(map)) {
        prefill[k] = row[rowField];
      }
      const storageKey =
        openPageOnClick.prefillKey != null
          ? String(openPageOnClick.prefillKey)
          : `page_prefill_${String(openPageOnClick.pageCode)}`;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(prefill));
      } catch {
        // ignore
      }
      onEvent?.({
        type: 'requestOpenPage',
        componentCode: spec.componentCode,
        payload: {
          pageCode: String(openPageOnClick.pageCode),
          title: openPageOnClick.title != null ? String(openPageOnClick.title) : undefined,
          prefill,
          prefillKey: storageKey,
          row,
        },
      });
    }

    onEvent?.({
      type: 'rowClick',
      componentCode: spec.componentCode,
      payload: {
        row,
        name: String(row.member_name ?? row.product_name ?? row.name ?? row.id ?? i),
        selected: selectable,
      },
    });
  };

  return (
    <div className="overflow-auto rounded-xl border border-slate-100" data-component-type="simpleGrid">
      {title && (
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          {title}
          {selectable && <span className="ml-2 font-normal text-cyan-700">点击选中</span>}
          {openPageOnClick && <span className="ml-2 font-normal text-emerald-700">点击打开页面</span>}
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
          {shown.map((row, i) => {
            const key = String(row.id ?? row.member_code ?? row.product_code ?? i);
            const active = selectedKey === key;
            return (
              <tr
                key={key}
                className={`cursor-pointer border-t border-slate-50 hover:bg-cyan-50/50 ${
                  active ? 'bg-cyan-50 ring-1 ring-inset ring-cyan-200' : ''
                }`}
                onClick={() => onRowClick(row, i)}
              >
                {columns.map((c) => (
                  <td key={c.field} className="px-2 py-1.5 text-slate-700">
                    {row[c.field] == null ? '' : String(row[c.field])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function renderSimpleGrid(ctx: ComponentRenderContext) {
  return <SimpleGridView {...ctx} />;
}
