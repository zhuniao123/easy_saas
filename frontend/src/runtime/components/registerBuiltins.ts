import { registerPageComponent } from '../componentRegistry';
import { renderProbeComponent } from './ProbeComponent';
import { renderSmartGrid } from './SmartGrid';
import { createChartRenderer } from './charts/createChartRenderer';

export function registerBuiltinPageComponents(): void {
  registerPageComponent({
    type: 'smartGrid',
    displayName: 'Smart Grid',
    render: renderSmartGrid,
  });
  registerPageComponent({
    type: 'probe',
    displayName: 'Registry Probe',
    render: renderProbeComponent,
  });

  // Slice 6: SQL-driven presentation components (DataTable + bindings only)
  registerPageComponent({
    type: 'stat',
    displayName: 'Stat',
    render: createChartRenderer('stat'),
  });
  registerPageComponent({
    type: 'barChart',
    displayName: 'Bar Chart',
    render: createChartRenderer('barChart'),
  });
  registerPageComponent({
    type: 'lineChart',
    displayName: 'Line Chart',
    render: createChartRenderer('lineChart'),
  });
  registerPageComponent({
    type: 'pieChart',
    displayName: 'Pie Chart',
    render: createChartRenderer('pieChart'),
  });
  registerPageComponent({
    type: 'text',
    displayName: 'Text',
    render: createChartRenderer('text'),
  });
}

/** Component types that load data via DataSource registry (not the main page grid query). */
export const INDEPENDENT_DATA_COMPONENT_TYPES = new Set([
  'stat',
  'barchart',
  'linechart',
  'piechart',
  'text',
  'probe',
]);
