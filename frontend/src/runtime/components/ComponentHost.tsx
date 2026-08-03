import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ComponentEvent, ComponentHandle, ComponentSpec, ComponentStatus } from '../componentTypes';
import {
  registerComponentHandle,
  tryGetPageComponent,
  unregisterComponentHandle,
} from '../componentRegistry';
import type { DataTable } from '../dataSource';
import type { DashboardLayoutSpec } from '../layoutTypes';
import { ComponentErrorState } from './ComponentStates';
import DashboardLayout from './DashboardLayout';

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
  layout,
}: {
  items: ComponentHostItem[];
  onEvent?: (event: ComponentEvent) => void;
  /** When set, arrange components in a fixed dashboard grid instead of a vertical stack. */
  layout?: DashboardLayoutSpec | null;
}) {
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const codesKey = items.map((i) => `${i.spec.componentCode}:${i.spec.type}`).join('|');
  const statusKey = items.map((i) => `${i.spec.componentCode}:${i.status}:${i.error || ''}`).join('|');
  const dataKey = items
    .map((i) => `${i.spec.componentCode}:${i.data?.rows?.length ?? 'x'}:${i.data?.total ?? ''}`)
    .join('|');

  // Register handles when component slot identity changes (not every parent render).
  useEffect(() => {
    const snapshot = itemsRef.current;
    const codes: string[] = [];
    for (const item of snapshot) {
      const code = item.spec.componentCode;
      codes.push(code);
      const properties = item.properties || item.spec.properties || {};
      let mutableProps = { ...properties };
      const handle: ComponentHandle = {
        componentCode: code,
        type: item.spec.type,
        getStatus: () => {
          const live = itemsRef.current.find((x) => x.spec.componentCode === code);
          return live?.status || 'loading';
        },
        refresh: () => {
          const live = itemsRef.current.find((x) => x.spec.componentCode === code);
          live?.handle?.refresh?.();
        },
        getData: () => {
          const live = itemsRef.current.find((x) => x.spec.componentCode === code);
          return live?.handle?.getData?.() ?? live?.data ?? null;
        },
        getProperties: () => {
          const live = itemsRef.current.find((x) => x.spec.componentCode === code);
          return live?.handle?.getProperties?.() ?? live?.properties ?? mutableProps;
        },
        setProperties: (props) => {
          mutableProps = { ...mutableProps, ...props };
          const live = itemsRef.current.find((x) => x.spec.componentCode === code);
          live?.handle?.setProperties?.(mutableProps);
        },
      };
      registerComponentHandle(handle);
    }
    return () => {
      codes.forEach((code) => unregisterComponentHandle(code));
    };
  }, [codesKey]);

  const renderItem = (item: ComponentHostItem): ReactNode => {
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
  };

  const nodesByCode = useMemo(() => {
    const map: Record<string, ReactNode> = {};
    for (const item of items) {
      map[item.spec.componentCode] = renderItem(item);
    }
    return map;
    // Fingerprints avoid thrashing when parent rebuilds item object identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codesKey, statusKey, dataKey, onEvent, items]);

  const allCodes = items.map((i) => i.spec.componentCode);

  const onRefreshCodes = (codes: string[]) => {
    for (const code of codes) {
      const live = itemsRef.current.find((x) => x.spec.componentCode === code);
      live?.handle?.refresh?.();
    }
  };

  if (layout && layout.rows && layout.rows.length > 0) {
    return (
      <DashboardLayout
        layout={layout}
        nodesByCode={nodesByCode}
        allCodes={allCodes}
        onRefreshCodes={onRefreshCodes}
      />
    );
  }

  return (
    <div className="space-y-4" data-component-host="true">
      {allCodes.map((code) => (
        <div key={code}>{nodesByCode[code]}</div>
      ))}
    </div>
  );
}
