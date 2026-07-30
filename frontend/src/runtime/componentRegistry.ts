import type {
  ComponentHandle,
  ComponentSpec,
  PageComponentDefinition,
} from './componentTypes';

const definitions = new Map<string, PageComponentDefinition>();
const liveHandles = new Map<string, ComponentHandle>();

export function registerPageComponent(definition: PageComponentDefinition): void {
  if (!definition?.type) {
    throw new Error('PageComponentDefinition.type is required');
  }
  definitions.set(definition.type.trim().toLowerCase(), definition);
}

export function getPageComponent(type: string): PageComponentDefinition {
  const key = (type || '').trim().toLowerCase();
  const def = definitions.get(key);
  if (!def) {
    throw new Error(
      `Unknown page component type '${key}'. Registered: ${[...definitions.keys()].join(', ')}`,
    );
  }
  return def;
}

export function tryGetPageComponent(type: string): PageComponentDefinition | null {
  const key = (type || '').trim().toLowerCase();
  return definitions.get(key) || null;
}

export function registeredPageComponentTypes(): string[] {
  return [...definitions.keys()].sort();
}

export function registerComponentHandle(handle: ComponentHandle): void {
  liveHandles.set(handle.componentCode, handle);
}

export function unregisterComponentHandle(componentCode: string): void {
  liveHandles.delete(componentCode);
}

export function getComponentHandle(componentCode: string): ComponentHandle | null {
  return liveHandles.get(componentCode) || null;
}

export function listComponentHandles(): ComponentHandle[] {
  return [...liveHandles.values()];
}

export function clearComponentHandles(): void {
  liveHandles.clear();
}

/**
 * Build the component list for a page.
 * Backward compatible: pages without `components` get a single smartGrid slot.
 */
export function resolvePageComponentSpecs(input: {
  components?: ComponentSpec[] | null;
  queryCode?: string | null;
  pageCode?: string;
}): ComponentSpec[] {
  if (Array.isArray(input.components) && input.components.length > 0) {
    return input.components.map((c, index) => ({
      componentCode: c.componentCode || `component_${index + 1}`,
      type: c.type || 'smartGrid',
      dataSource: c.dataSource,
      bindings: c.bindings,
      properties: c.properties || {},
    }));
  }
  return [
    {
      componentCode: input.pageCode ? `${input.pageCode}__grid` : 'mainGrid',
      type: 'smartGrid',
      dataSource: input.queryCode
        ? { type: 'sql', queryCode: input.queryCode }
        : { type: 'sql' },
      properties: {},
    },
  ];
}

let bootstrapped = false;

/** Idempotent registration of built-in components. */
export function ensureDefaultPageComponents(
  registerBuiltins: () => void,
): void {
  if (bootstrapped) return;
  registerBuiltins();
  bootstrapped = true;
}

/** Test helper: reset bootstrap flag and maps. */
export function __resetComponentRegistryForTests(): void {
  definitions.clear();
  liveHandles.clear();
  bootstrapped = false;
}
