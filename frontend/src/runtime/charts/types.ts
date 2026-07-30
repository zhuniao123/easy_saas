import type { DataTable } from '../dataTable';

export type ChartKind = 'stat' | 'barChart' | 'lineChart' | 'pieChart' | 'text';

export interface ChartBindings {
  /** Category / label field (bar/line/pie) */
  category?: string;
  /** Numeric value field */
  value?: string;
  /** Optional series split field (multi-series later; v1 unused) */
  series?: string;
  /** Text / stat content field */
  text?: string;
}

export interface ChartProperties {
  title?: string;
  subtitle?: string;
  legend?: boolean;
  height?: number;
  format?: 'number' | 'money' | 'percent' | 'text';
  emptyMessage?: string;
  content?: string;
  unit?: string;
  color?: string;
}

export interface ChartSeriesPoint {
  name: string;
  value: number;
  row: Record<string, unknown>;
  dataIndex: number;
}

export interface ChartModel {
  kind: ChartKind;
  title?: string;
  subtitle?: string;
  legend: boolean;
  height: number;
  format: ChartProperties['format'];
  unit?: string;
  color?: string;
  points: ChartSeriesPoint[];
  /** For text/stat display */
  displayText?: string;
  emptyMessage: string;
}

export interface ChartClickPayload {
  name: string;
  value: number;
  dataIndex: number;
  row: Record<string, unknown>;
}

export interface ChartAdapter {
  readonly name: string;
  /** Build library-agnostic model from DataTable + bindings. */
  buildModel: (input: {
    kind: ChartKind;
    data: DataTable | null | undefined;
    bindings?: Record<string, string> | ChartBindings;
    properties?: ChartProperties;
  }) => ChartModel;
}
