import { useMemo } from 'react';
import type { ComponentEvent } from '../componentTypes';
import type { WorkspaceRegionSpec, WorkspaceSpec } from '../pageShellTypes';
import { colSpanClass } from '../layoutTypes';
import { indexSlotsByCode, renderSlotItem, type SlotItem } from './renderSlot';

function Region({
  region,
  byCode,
  onEvent,
  side,
}: {
  region?: WorkspaceRegionSpec;
  byCode: Record<string, SlotItem>;
  onEvent?: (event: ComponentEvent) => void;
  side: string;
}) {
  if (!region) return null;
  const span = region.span && region.span >= 1 && region.span <= 12 ? region.span : 4;
  return (
    <div
      className={`${colSpanClass(span)} min-w-0`}
      data-workspace-region={side}
      data-span={span}
    >
      <div className="flex h-full min-h-[12rem] flex-col rounded-[22px] border border-slate-200/90 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        {(region.title || region.description) && (
          <div className="mb-3 border-b border-slate-100 pb-2">
            {region.title && (
              <div className="text-sm font-semibold text-slate-900">{region.title}</div>
            )}
            {region.description && (
              <div className="mt-0.5 text-xs text-slate-500">{region.description}</div>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          {region.components.map((code) => {
            const item = byCode[code];
            if (!item) {
              return (
                <div
                  key={code}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                >
                  Missing component: {code}
                </div>
              );
            }
            return <div key={code}>{renderSlotItem(item, onEvent)}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Three-column workspace shell (left / center / right).
 * Components are referenced by componentCode from the page components list.
 */
export default function WorkspaceShell({
  workspace,
  items,
  onEvent,
}: {
  workspace: WorkspaceSpec;
  items: SlotItem[];
  onEvent?: (event: ComponentEvent) => void;
}) {
  const byCode = useMemo(() => indexSlotsByCode(items), [items]);
  const gap = workspace.gap ?? 16;

  return (
    <div
      className="grid grid-cols-12"
      style={{ gap }}
      data-workspace-shell="true"
    >
      <Region region={workspace.left} byCode={byCode} onEvent={onEvent} side="left" />
      <Region region={workspace.center} byCode={byCode} onEvent={onEvent} side="center" />
      <Region region={workspace.right} byCode={byCode} onEvent={onEvent} side="right" />
    </div>
  );
}
