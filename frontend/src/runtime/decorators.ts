/**
 * Column display decorators — template-agnostic presentation helpers.
 */

export type DecoratorFormat =
  | 'text'
  | 'number'
  | 'money'
  | 'percent'
  | 'boolean'
  | 'datetime'
  | 'date'
  | 'badge'
  | string;

export interface ToneRule {
  /** Compare cell value to a constant or sibling field: "value <= row.safety_qty" */
  when?: string;
  tone?: 'default' | 'muted' | 'accent' | 'success' | 'danger';
}

export interface DecorateOptions {
  format?: DecoratorFormat;
  type?: string;
  tone?: string;
  toneRules?: ToneRule[];
  row?: Record<string, unknown>;
  locale?: string;
  currency?: string;
}

const parseToneRule = (rule: string, value: unknown, row?: Record<string, unknown>): boolean => {
  const trimmed = rule.trim();
  // value <= row.field | value >= 0 | value == 'x'
  const match = trimmed.match(/^value\s*(<=|>=|==|!=|<|>)\s*(.+)$/);
  if (!match) return false;
  const op = match[1];
  const rightRaw = match[2].trim();
  let right: unknown = rightRaw;

  if (rightRaw.startsWith('row.') && row) {
    right = row[rightRaw.slice(4)];
  } else if ((rightRaw.startsWith("'") && rightRaw.endsWith("'")) || (rightRaw.startsWith('"') && rightRaw.endsWith('"'))) {
    right = rightRaw.slice(1, -1);
  } else if (rightRaw === 'true' || rightRaw === 'false') {
    right = rightRaw === 'true';
  } else if (!Number.isNaN(Number(rightRaw))) {
    right = Number(rightRaw);
  }

  const leftNum = typeof value === 'number' ? value : Number(value);
  const rightNum = typeof right === 'number' ? right : Number(right);
  const bothNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);

  switch (op) {
    case '<=':
      return bothNumeric ? leftNum <= rightNum : String(value) <= String(right);
    case '>=':
      return bothNumeric ? leftNum >= rightNum : String(value) >= String(right);
    case '<':
      return bothNumeric ? leftNum < rightNum : String(value) < String(right);
    case '>':
      return bothNumeric ? leftNum > rightNum : String(value) > String(right);
    case '!=':
      return String(value) !== String(right);
    case '==':
    default:
      return String(value) === String(right);
  }
};

export const resolveTone = (
  value: unknown,
  tone: string | undefined,
  toneRules: ToneRule[] | undefined,
  row?: Record<string, unknown>,
): string | undefined => {
  if (toneRules && toneRules.length > 0) {
    for (const rule of toneRules) {
      if (rule.when && parseToneRule(rule.when, value, row) && rule.tone) {
        return rule.tone;
      }
    }
  }
  return tone;
};

export const formatDecoratedValue = (value: unknown, options: DecorateOptions = {}): string => {
  if (value === null || value === undefined) return '';

  const format = options.format || options.type || 'text';
  const locale = options.locale || undefined;

  if (format === 'datetime' || format === 'date') {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return format === 'date'
      ? date.toLocaleDateString(locale)
      : date.toLocaleString(locale);
  }

  if (format === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return 'Yes';
    if (value === false || value === 'false' || value === 0 || value === '0') return 'No';
    return String(value);
  }

  if (format === 'money') {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return String(value);
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: options.currency || 'CNY',
        minimumFractionDigits: 2,
      }).format(num);
    } catch {
      return num.toFixed(2);
    }
  }

  if (format === 'percent') {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return String(value);
    return `${(num * 100).toFixed(1)}%`;
  }

  if (format === 'number' || options.type === 'integer' || options.type === 'number') {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return String(value);
    return new Intl.NumberFormat(locale).format(num);
  }

  return String(value);
};

export const toneClassName = (tone?: string): string => {
  switch (tone) {
    case 'danger':
      return 'bg-rose-100 text-rose-700';
    case 'success':
      return 'bg-emerald-100 text-emerald-700';
    case 'accent':
      return 'bg-cyan-100 text-cyan-800';
    case 'muted':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};
