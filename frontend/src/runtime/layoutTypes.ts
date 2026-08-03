/**
 * Fixed dashboard layout: Row → Column → Section → component codes.
 * No drag designer — span is 1–12 on a CSS grid.
 */

export interface DashboardSectionSpec {
  title?: string;
  description?: string;
  /** Show a section-level refresh control for contained independent components. */
  refreshable?: boolean;
}

export interface DashboardColSpec {
  /** Column span on a 12-column grid. Default 12. */
  span?: number;
  section?: DashboardSectionSpec;
  /** componentCode list rendered top-to-bottom in this column. */
  components: string[];
}

export interface DashboardRowSpec {
  minHeight?: number;
  cols: DashboardColSpec[];
}

export interface DashboardLayoutSpec {
  /** Reserved for future layout kinds; currently always dashboard grid. */
  type?: 'dashboard' | string;
  /** Gap between cells in px. Default 16. */
  gap?: number;
  rows: DashboardRowSpec[];
}

const clampSpan = (raw: unknown): number => {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 12;
  return Math.min(12, Math.max(1, Math.round(n)));
};

/**
 * Normalize page DSL `layout` object.
 * Returns undefined when empty / invalid so runtime falls back to vertical stack.
 */
export function normalizeDashboardLayout(raw: unknown): DashboardLayoutSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const rowsRaw = obj.rows;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return undefined;

  const rows: DashboardRowSpec[] = [];
  for (const rowItem of rowsRaw) {
    if (!rowItem || typeof rowItem !== 'object') continue;
    const row = rowItem as Record<string, unknown>;
    const colsRaw = row.cols ?? row.columns;
    if (!Array.isArray(colsRaw) || colsRaw.length === 0) continue;

    const cols: DashboardColSpec[] = [];
    for (const colItem of colsRaw) {
      if (!colItem || typeof colItem !== 'object') continue;
      const col = colItem as Record<string, unknown>;
      const codesRaw = col.components ?? col.componentCodes;
      const codes = Array.isArray(codesRaw)
        ? codesRaw.map((c) => String(c || '').trim()).filter(Boolean)
        : col.componentCode
          ? [String(col.componentCode).trim()].filter(Boolean)
          : [];
      if (codes.length === 0) continue;

      let section: DashboardSectionSpec | undefined;
      if (col.section && typeof col.section === 'object') {
        const s = col.section as Record<string, unknown>;
        section = {
          title: s.title != null ? String(s.title) : undefined,
          description: s.description != null ? String(s.description) : undefined,
          refreshable: s.refreshable === true,
        };
      } else if (col.title != null || col.description != null) {
        section = {
          title: col.title != null ? String(col.title) : undefined,
          description: col.description != null ? String(col.description) : undefined,
          refreshable: col.refreshable === true,
        };
      }

      cols.push({
        span: clampSpan(col.span ?? col.colSpan ?? 12),
        section,
        components: codes,
      });
    }
    if (cols.length === 0) continue;
    rows.push({
      minHeight: typeof row.minHeight === 'number' ? row.minHeight : undefined,
      cols,
    });
  }

  if (rows.length === 0) return undefined;

  const gap =
    typeof obj.gap === 'number' && Number.isFinite(obj.gap) && obj.gap >= 0
      ? obj.gap
      : 16;

  return {
    type: obj.type != null ? String(obj.type) : 'dashboard',
    gap,
    rows,
  };
}

/** Tailwind-safe span classes (dynamic class names are not emitted by JIT). */
export const COL_SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

export function colSpanClass(span?: number): string {
  const s = span && span >= 1 && span <= 12 ? span : 12;
  return COL_SPAN_CLASS[s] || COL_SPAN_CLASS[12];
}

/**
 * Codes placed by layout, plus any component codes not referenced (orphans).
 * Orphans are rendered in a trailing full-width stack so nothing is silently dropped.
 */
export function partitionLayoutCodes(
  layout: DashboardLayoutSpec,
  allCodes: string[],
): { placed: Set<string>; orphans: string[] } {
  const placed = new Set<string>();
  for (const row of layout.rows) {
    for (const col of row.cols) {
      for (const code of col.components) {
        placed.add(code);
      }
    }
  }
  const orphans = allCodes.filter((c) => !placed.has(c));
  return { placed, orphans };
}
