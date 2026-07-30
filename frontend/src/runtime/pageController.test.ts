import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  loadPageControllerModule,
  mountPageController,
  type PageControllerModule,
} from './pageController';
import {
  __resetComponentRegistryForTests,
  registerComponentHandle,
  ensureDefaultPageComponents,
} from './componentRegistry';
import { registerBuiltinPageComponents } from './components/registerBuiltins';

beforeEach(() => {
  __resetComponentRegistryForTests();
  ensureDefaultPageComponents(registerBuiltinPageComponents);
});

describe('page controller runtime', () => {
  test('loads published ES module and runs lifecycle hooks', async () => {
    const source = `
      export default {
        async onInit(ctx) { ctx.state.set('phase', 'init'); },
        async onReady(ctx) { ctx.state.set('phase', 'ready'); ctx.ui.log('info', 'ready'); },
        async onEvent(event, ctx) { ctx.state.set('lastEvent', event.type); },
        async onDispose(ctx) { ctx.state.set('phase', 'disposed'); },
      };
    `;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scriptContent: source, version: 3, status: 'PUBLISHED' }),
    });

    const runtime = await mountPageController({
      pageCode: 'demo_page',
      scriptCode: 'ctrl_demo',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(runtime).not.toBeNull();
    expect(runtime!.version).toBe(3);
    expect(runtime!.ctx.state.get('phase')).toBe('ready');

    runtime!.dispatch({ type: 'rowClick', componentCode: 'grid', payload: { id: 1 } });
    // allow microtask for async onEvent
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(runtime!.ctx.state.get('lastEvent')).toBe('rowClick');

    await runtime!.dispose();
    expect(runtime!.ctx.state.get('phase')).toBe('disposed');
  });

  test('isolates controller errors without throwing to host', async () => {
    const source = `
      export default {
        async onReady() { throw new Error('boom-ready'); },
        async onError(err, ctx) { ctx.state.set('caught', String(err.message || err)); },
      };
    `;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scriptContent: source, version: 1 }),
    });
    const runtime = await mountPageController({
      pageCode: 'p',
      scriptCode: 'c',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(runtime).not.toBeNull();
    expect(runtime!.ctx.state.get('caught')).toContain('boom-ready');
  });

  test('components.refresh uses registered handles', async () => {
    const refresh = vi.fn();
    registerComponentHandle({
      componentCode: 'grid_a',
      type: 'smartGrid',
      getStatus: () => 'ready',
      refresh,
      getData: () => null,
      getProperties: () => ({}),
      setProperties: () => undefined,
    });
    const source = `
      export default {
        async onReady(ctx) { await ctx.components.refresh('grid_a'); },
      };
    `;
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ scriptContent: source, version: 1 }),
    });
    await mountPageController({
      pageCode: 'p',
      scriptCode: 'c',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(refresh).toHaveBeenCalled();
  });

  test('loadPageControllerModule rejects unpublished errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'Script is not published (status=DRAFT)' }),
    });
    await expect(
      loadPageControllerModule('x', fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/not published/i);
  });
});

// silence unused import lint in case tree-shaking
void (0 as unknown as PageControllerModule);
