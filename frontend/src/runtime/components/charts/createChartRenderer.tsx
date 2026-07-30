import type { ComponentRenderContext } from '../../componentTypes';
import type { ChartKind } from '../../charts/types';
import { getChartAdapter } from '../../charts/ChartAdapter';
import { ChartShell } from './ChartViews';

/** Shared renderer factory for registered chart component types. */
export function createChartRenderer(kind: ChartKind) {
  return function renderChartComponent(ctx: ComponentRenderContext) {
    const adapter = getChartAdapter();
    const model = adapter.buildModel({
      kind,
      data: ctx.data,
      bindings: ctx.spec.bindings,
      properties: {
        ...(ctx.properties || {}),
        ...(ctx.spec.properties || {}),
      },
    });

    return (
      <ChartShell
        model={model}
        status={ctx.status}
        error={ctx.error}
        onPointClick={(payload) => {
          ctx.onEvent?.({
            type: 'itemClick',
            componentCode: ctx.spec.componentCode,
            payload: { ...payload, chartKind: kind },
          });
        }}
      />
    );
  };
}
