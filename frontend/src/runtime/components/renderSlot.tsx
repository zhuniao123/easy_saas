import type { ReactNode } from 'react';
import type { ComponentEvent, ComponentSpec, ComponentStatus } from '../componentTypes';
import { tryGetPageComponent } from '../componentRegistry';
import type { DataTable } from '../dataSource';
import { ComponentErrorState } from './ComponentStates';

export interface SlotItem {
  spec: ComponentSpec;
  status: ComponentStatus;
  error?: string | null;
  data?: DataTable | null;
  properties?: Record<string, unknown>;
  pageContext?: Record<string, unknown>;
}

export function renderSlotItem(
  item: SlotItem,
  onEvent?: (event: ComponentEvent) => void,
): ReactNode {
  const def = tryGetPageComponent(item.spec.type);
  if (!def) {
    return (
      <div key={item.spec.componentCode} data-component-code={item.spec.componentCode}>
        <ComponentErrorState
          message={`Unknown component type "${item.spec.type}". Register it with registerPageComponent().`}
        />
      </div>
    );
  }
  return (
    <div
      key={item.spec.componentCode}
      data-component-code={item.spec.componentCode}
      data-component-type={item.spec.type}
      data-component-status={item.status}
    >
      {def.render({
        spec: item.spec,
        status: item.status,
        error: item.error,
        data: item.data,
        properties: item.properties || item.spec.properties || {},
        pageContext: item.pageContext,
        onEvent,
      })}
    </div>
  );
}

export function indexSlotsByCode(items: SlotItem[]): Record<string, SlotItem> {
  const map: Record<string, SlotItem> = {};
  for (const item of items) {
    map[item.spec.componentCode] = item;
  }
  return map;
}
