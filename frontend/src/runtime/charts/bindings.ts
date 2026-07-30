import type { DataTable } from '../dataTable';
import type { ChartBindings, ChartKind, ChartModel, ChartProperties, ChartSeriesPoint } from './types';

export function normalizeBindings(
  bindings?: Record<string, string> | ChartBindings | null,
): ChartBindings {
  if (!bindings || typeof bindings !== 'object') return {};
  return {
    category: bindings.category ? String(bindings.category) : undefined,
    value: bindings.value ? String(bindings.value) : undefined,
    series: bindings.series ? String(bindings.series) : undefined,
    text: bindings.text ? String(bindings.text) : undefined,
  };
}

export function formatChartValue(
  value: number,
  format?: ChartProperties['format'],
  unit?: string,
): string {
  if (!Number.isFinite(value)) return '—';
  let text: string;
  if (format === 'money') {
    text = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'CNY',
      maximumFractionDigits: 2,
    }).format(value);
  } else if (format === 'percent') {
    text = `${(value * 100).toFixed(1)}%`;
  } else if (format === 'number') {
    text = new Intl.NumberFormat().format(value);
  } else {
    text = String(value);
  }
  return unit ? `${text}${unit}` : text;
}

function toNumber(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Project a DataTable into chart points using column-name bindings only.
 * Replacing queryCode keeps the same bindings contract.
 */
export function dataTableToPoints(
  data: DataTable | null | undefined,
  bindings: ChartBindings,
): ChartSeriesPoint[] {
  const rows = data?.rows || [];
  if (rows.length === 0) return [];

  const categoryField =
    bindings.category ||
    guessField(data, ['name', 'label', 'category', 'day', 'date', 'x']) ||
    firstColumn(data);
  const valueField =
    bindings.value ||
    guessField(data, ['value', 'amount', 'total', 'count', 'y', 'revenue']) ||
    secondColumn(data, categoryField);

  return rows.map((row, dataIndex) => {
    const name = categoryField != null ? String(row[categoryField] ?? '') : String(dataIndex + 1);
    const value = valueField != null ? toNumber(row[valueField]) : toNumber(Object.values(row)[0]);
    return {
      name: name || `#${dataIndex + 1}`,
      value: Number.isFinite(value) ? value : 0,
      row,
      dataIndex,
    };
  });
}

export function buildChartModel(input: {
  kind: ChartKind;
  data: DataTable | null | undefined;
  bindings?: Record<string, string> | ChartBindings;
  properties?: ChartProperties;
}): ChartModel {
  const bindings = normalizeBindings(input.bindings);
  const props = input.properties || {};
  const points = dataTableToPoints(input.data, bindings);
  const emptyMessage = props.emptyMessage || 'No chart data';

  let displayText: string | undefined;
  if (input.kind === 'text') {
    if (props.content != null) {
      displayText = String(props.content);
    } else {
      const field = bindings.text || bindings.value || firstColumn(input.data);
      const row = input.data?.rows?.[0];
      displayText = field && row ? String(row[field] ?? '') : '';
    }
  }
  if (input.kind === 'stat') {
    const field = bindings.value || firstNumericField(input.data) || firstColumn(input.data);
    const row = input.data?.rows?.[0];
    const raw = field && row ? row[field] : points[0]?.value;
    const num = toNumber(raw);
    displayText = Number.isFinite(num)
      ? formatChartValue(num, props.format || 'number', props.unit)
      : raw != null
        ? String(raw)
        : '—';
  }

  return {
    kind: input.kind,
    title: props.title,
    subtitle: props.subtitle,
    legend: props.legend !== false,
    height: typeof props.height === 'number' ? props.height : input.kind === 'stat' || input.kind === 'text' ? 120 : 280,
    format: props.format || 'number',
    unit: props.unit,
    color: props.color,
    points,
    displayText,
    emptyMessage,
  };
}

function firstColumn(data?: DataTable | null): string | undefined {
  return data?.columns?.[0]?.field || (data?.rows?.[0] ? Object.keys(data.rows[0])[0] : undefined);
}

function secondColumn(data: DataTable | null | undefined, skip?: string): string | undefined {
  const fields =
    data?.columns?.map((c) => c.field).filter(Boolean) ||
    (data?.rows?.[0] ? Object.keys(data.rows[0]) : []);
  return fields.find((f) => f !== skip) || fields[0];
}

function guessField(data: DataTable | null | undefined, candidates: string[]): string | undefined {
  const fields = new Set(
    (data?.columns?.map((c) => c.field) || Object.keys(data?.rows?.[0] || {})).map((f) =>
      f.toLowerCase(),
    ),
  );
  for (const c of candidates) {
    if (fields.has(c.toLowerCase())) {
      // return original casing from columns/rows
      const col = data?.columns?.find((x) => x.field.toLowerCase() === c.toLowerCase());
      if (col) return col.field;
      const key = Object.keys(data?.rows?.[0] || {}).find((k) => k.toLowerCase() === c.toLowerCase());
      if (key) return key;
    }
  }
  return undefined;
}

function firstNumericField(data?: DataTable | null): string | undefined {
  const row = data?.rows?.[0];
  if (!row) return undefined;
  for (const [k, v] of Object.entries(row)) {
    if (Number.isFinite(toNumber(v))) return k;
  }
  return undefined;
}
