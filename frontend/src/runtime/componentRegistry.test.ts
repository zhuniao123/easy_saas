import { describe, expect, test, beforeEach } from 'vitest';
import {
  __resetComponentRegistryForTests,
  ensureDefaultPageComponents,
  getComponentHandle,
  getPageComponent,
  listComponentHandles,
  registerComponentHandle,
  registerPageComponent,
  registeredPageComponentTypes,
  resolvePageComponentSpecs,
  unregisterComponentHandle,
} from './componentRegistry';
import { resolveComponentStatus } from './componentTypes';
import { registerBuiltinPageComponents } from './components/registerBuiltins';

beforeEach(() => {
  __resetComponentRegistryForTests();
  ensureDefaultPageComponents(registerBuiltinPageComponents);
});

describe('component registry', () => {
  test('registers smartGrid and probe by default', () => {
    // Registry keys are normalized to lowercase.
    expect(registeredPageComponentTypes()).toEqual(
      expect.arrayContaining(['probe', 'smartgrid', 'stat', 'barchart', 'linechart', 'piechart', 'text']),
    );
    expect(getPageComponent('smartGrid').displayName).toBe('Smart Grid');
    expect(getPageComponent('probe').type).toBe('probe');
    expect(getPageComponent('barChart').displayName).toBe('Bar Chart');
  });

  test('default page without components gets a single smartGrid slot', () => {
    const specs = resolvePageComponentSpecs({
      pageCode: 'orders',
      queryCode: 'q_orders',
    });
    expect(specs).toHaveLength(1);
    expect(specs[0].type).toBe('smartGrid');
    expect(specs[0].componentCode).toBe('orders__grid');
    expect(specs[0].dataSource?.queryCode).toBe('q_orders');
  });

  test('explicit components list is preserved', () => {
    const specs = resolvePageComponentSpecs({
      components: [
        { componentCode: 'kpi', type: 'probe', properties: { label: 'KPI' } },
        { componentCode: 'grid', type: 'smartGrid' },
      ],
    });
    expect(specs.map((s) => s.type)).toEqual(['probe', 'smartGrid']);
  });

  test('new component type can be registered without PageLoader changes', () => {
    registerPageComponent({
      type: 'hello',
      render: () => 'hello-world',
    });
    expect(getPageComponent('hello').render({
      spec: { componentCode: 'h1', type: 'hello' },
      status: 'ready',
      properties: {},
    })).toBe('hello-world');
  });

  test('component handles can be registered and listed', () => {
    registerComponentHandle({
      componentCode: 'main',
      type: 'smartGrid',
      getStatus: () => 'ready',
      refresh: () => undefined,
      getData: () => null,
      getProperties: () => ({}),
      setProperties: () => undefined,
    });
    expect(getComponentHandle('main')?.type).toBe('smartGrid');
    expect(listComponentHandles()).toHaveLength(1);
    unregisterComponentHandle('main');
    expect(getComponentHandle('main')).toBeNull();
  });
});

describe('resolveComponentStatus', () => {
  test('maps loading empty error ready', () => {
    expect(resolveComponentStatus({ loading: true })).toBe('loading');
    expect(resolveComponentStatus({ error: 'boom' })).toBe('error');
    expect(resolveComponentStatus({ hasDataPayload: false })).toBe('loading');
    expect(resolveComponentStatus({ hasDataPayload: true, rowCount: 0 })).toBe('empty');
    expect(resolveComponentStatus({ hasDataPayload: true, rowCount: 2 })).toBe('ready');
  });
});
