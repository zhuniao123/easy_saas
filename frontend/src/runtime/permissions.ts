/**
 * Framework permission helpers for page runtime (PageLoader).
 *
 * Layering:
 * - auth.ts: session + raw can/canPage/canAction/canQuery (shell + any feature)
 * - runtime/permissions.ts: map Page DSL actions/columns → those checks (only PageLoader needs this)
 * - App shell: only can()/canPage() for navigation entries (not page DSL)
 * - Backend interceptors remain the security source of truth
 */
import type { ActionConfig } from '../actionRegistry';
import { can, canAction, canQuery, getProfile } from '../auth';

export { can, canPage, canAction, canQuery } from '../auth';

/** Bare field names denied for the current user (from profile.fieldDenies). */
export function getFieldDenySet(): Set<string> {
  const denies = getProfile()?.fieldDenies || [];
  const bare = new Set<string>();
  for (const d of denies) {
    bare.add(d);
    const dot = d.lastIndexOf('.');
    if (dot >= 0) bare.add(d.substring(dot + 1));
  }
  return bare;
}

export function isFieldAllowed(field: string, denySet: Set<string> = getFieldDenySet()): boolean {
  return !denySet.has(field);
}

export function filterColumnsByPermission<T extends { field: string }>(
  columns: T[],
  denySet: Set<string> = getFieldDenySet()
): T[] {
  return columns.filter((col) => isFieldAllowed(col.field, denySet));
}

/**
 * Unified DSL action gate used by PageLoader for page-level and row-level buttons.
 * - sqlTransaction → action:{actionCode|code}
 * - openQuery → query:{queryCode}
 * - other/builtin → allowed if logged-in profile exists (writable gates stay separate)
 */
export function isActionAllowed(action: ActionConfig): boolean {
  const type = (action.type || '').toLowerCase();
  if (type === 'sqltransaction' || action.sqlTransaction) {
    const code = action.actionCode || action.code;
    if (!code) return false;
    return canAction(code);
  }
  if (type === 'openquery' || action.openQuery) {
    const qc = action.openQuery?.queryCode;
    return !qc || canQuery(qc);
  }
  // builtin / client: no resource code in RBAC catalog yet
  return true;
}

export function filterActionsByPermission(
  actions: ActionConfig[],
  scope?: 'page' | 'row'
): ActionConfig[] {
  return actions.filter((action) => {
    if (scope && (action.scope || 'page') !== scope) return false;
    return isActionAllowed(action);
  });
}

/** Shell helper: system tools need config permission. */
export function canConfig(): boolean {
  return can('perm:config');
}

export function canOpenSystemPage(pageCode: string): boolean {
  return can(`page:${pageCode}`) || canConfig();
}
