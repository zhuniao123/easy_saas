import { buildChartModel } from './bindings';
import type { ChartAdapter } from './types';

/**
 * Default adapter: pure model builder. Rendering is handled by view components
 * (SVG or ECharts) so the library can be swapped without changing page DSL.
 */
export const defaultChartAdapter: ChartAdapter = {
  name: 'default',
  buildModel: buildChartModel,
};

let activeAdapter: ChartAdapter = defaultChartAdapter;

export function getChartAdapter(): ChartAdapter {
  return activeAdapter;
}

export function setChartAdapter(adapter: ChartAdapter): void {
  activeAdapter = adapter;
}

export function resetChartAdapter(): void {
  activeAdapter = defaultChartAdapter;
}
