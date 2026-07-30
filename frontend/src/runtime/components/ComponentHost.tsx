import { useEffect, useMemo } from 'react';
import type { ComponentEvent, ComponentHandle, ComponentSpec, ComponentStatus } from '../componentTypes';
import {
  registerComponentHandle,
  tryGetPageComponent,
  unregisterComponentHandle,
} from '../componentRegistry';
import type { DataTable } from '../dataSource';
import { ComponentErrorState } from './ComponentStates';

export interface ComponentHostItem {
  spec: ComponentSpec;
  status: ComponentStatus;
  error?: string | null;
  data?: DataTable | null;
  properties?: Record<string, unknown>;
  pageContext?: Record<string, unknown>;
  /** Optional handle hooks provided by the page for this slot. */
  handle?: Partial<Pick<ComponentHandle, 'refresh' | 'getData' | 'setProperties' | 'getProperties'>>;
}

export default function ComponentHost({
  items,
  onEvent,
}: {
  items: ComponentHostItem[];
  onEvent?: (event: ComponentEvent) => void;
}) {
  // Register / refresh handles when items change.
  useEffect(() => {
    const codes: string[] = [];
    for (const item of items) {
      const code = item.spec.componentCode;
      codes.push(code);
      const properties = item.properties || item.spec.properties || {};
      let mutableProps = { ...properties };
      const handle: ComponentHandle = {
        componentCode: code,
        type: item.spec.type,
        getStatus: () => item.status,
        refresh: () => item.handle?.refresh?.(),
        getData: () => item.handle?.getData?.() ?? item.data ?? null,
        getProperties: () => item.handle?.getProperties?.() ?? mutableProps,
        setProperties: (props) => {
          mutableProps = { ...mutableProps, ...props };
          item.handle?.setProperties?.(mutableProps);
        },
      };
      registerComponentHandle(handle);
    }
    return () => {
      codes.forEach((code) => unregisterComponentHandle(code));
    };
  }, [items]);

  const nodes = useMemo(
    () =>
      items.map((item) => {
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
      }),
    [items, onEvent],
  );

  return <div className="space-y-4" data-component-host="true">{nodes}</div>;
}
