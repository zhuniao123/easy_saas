import type { ReactNode } from 'react';
import type { DashboardLayoutSpec } from '../layoutTypes';
import { colSpanClass, partitionLayoutCodes } from '../layoutTypes';

export interface DashboardLayoutProps {
  layout: DashboardLayoutSpec;
  /** Map componentCode → already-rendered node (including wrappers). */
  nodesByCode: Record<string, ReactNode>;
  /** All known codes in host order (for orphan detection). */
  allCodes: string[];
  /** Optional section refresh: invoke for each component code in the section. */
  onRefreshCodes?: (codes: string[]) => void;
}

/**
 * Renders a fixed 12-col CSS grid from DashboardLayoutSpec.
 * Components not listed in layout are stacked below as orphans (never dropped).
 */
export default function DashboardLayout({
  layout,
  nodesByCode,
  allCodes,
  onRefreshCodes,
}: DashboardLayoutProps) {
  const { orphans } = partitionLayoutCodes(layout, allCodes);
  const gap = layout.gap ?? 16;

  return (
    <div className="space-y-4" data-dashboard-layout="true" data-layout-type={layout.type || 'dashboard'}>
      {layout.rows.map((row, ri) => (
        <div
          key={`row-${ri}`}
          className="grid grid-cols-12"
          style={{
            gap,
            minHeight: row.minHeight,
          }}
          data-dashboard-row={ri}
        >
          {row.cols.map((col, ci) => {
            const span = col.span && col.span >= 1 && col.span <= 12 ? col.span : 12;
            const section = col.section;
            const codes = col.components;
            return (
              <div
                key={`col-${ri}-${ci}`}
                className={`${colSpanClass(span)} min-w-0`}
                data-dashboard-col={ci}
                data-span={span}
              >
                <div
                  className={
                    section?.title || section?.description
                      ? 'h-full rounded-[22px] border border-slate-200/90 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)]'
                      : 'h-full min-w-0'
                  }
                  data-dashboard-section={section?.title ? 'chrome' : 'bare'}
                >
                  {(section?.title || section?.description || section?.refreshable) && (
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {section?.title && (
                          <div className="text-sm font-semibold text-slate-900">{section.title}</div>
                        )}
                        {section?.description && (
                          <div className="mt-0.5 text-xs leading-5 text-slate-500">{section.description}</div>
                        )}
                      </div>
                      {section?.refreshable && onRefreshCodes && (
                        <button
                          type="button"
                          className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                          onClick={() => onRefreshCodes(codes)}
                          data-section-refresh="true"
                        >
                          刷新
                        </button>
                      )}
                    </div>
                  )}
                  <div className="space-y-3">
                    {codes.map((code) => (
                      <div key={code} data-layout-slot={code}>
                        {nodesByCode[code] ?? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Missing component: {code}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {orphans.length > 0 && (
        <div className="space-y-4" data-dashboard-orphans="true">
          {orphans.map((code) => (
            <div key={code} data-layout-slot={code}>
              {nodesByCode[code]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
