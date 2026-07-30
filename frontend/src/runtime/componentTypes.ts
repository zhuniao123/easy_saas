import type { ReactNode } from 'react';
import type { DataSourceSpec, DataTable } from './dataSource';

/** Standard lifecycle status for registered page components. */
export type ComponentStatus = 'loading' | 'empty' | 'error' | 'ready';

/**
 * Declarative component slot in a page (future dashboard / master-detail).
 * Existing Smart Grid pages omit this and get a default smartGrid slot.
 */
export interface ComponentSpec {
  componentCode: string;
  type: string;
  dataSource?: DataSourceSpec;
  bindings?: Record<string, string>;
  properties?: Record<string, unknown>;
}

/** Envelope for component → page / controller events (Slice 4 will expand). */
export interface ComponentEvent {
  type: string;
  componentCode: string;
  payload?: Record<string, unknown>;
}

/**
 * Imperative handle for JS Page Controllers (Slice 4).
 * Slice 3 exposes the shape and a simple registry of live handles.
 */
export interface ComponentHandle {
  componentCode: string;
  type: string;
  getStatus: () => ComponentStatus;
  refresh: () => void | Promise<void>;
  getData: () => DataTable | null;
  getProperties: () => Record<string, unknown>;
  setProperties: (props: Record<string, unknown>) => void;
}

export interface ComponentRenderContext {
  spec: ComponentSpec;
  status: ComponentStatus;
  error?: string | null;
  data?: DataTable | null;
  properties: Record<string, unknown>;
  /** Transitional page-owned context for Smart Grid until full data ownership moves in. */
  pageContext?: Record<string, unknown>;
  onEvent?: (event: ComponentEvent) => void;
}

export interface PageComponentDefinition {
  type: string;
  displayName?: string;
  render: (ctx: ComponentRenderContext) => ReactNode;
}

export function resolveComponentStatus(input: {
  loading?: boolean;
  error?: string | null;
  rowCount?: number | null;
  hasDataPayload?: boolean;
}): ComponentStatus {
  if (input.loading) return 'loading';
  if (input.error) return 'error';
  if (input.hasDataPayload === false) return 'loading';
  if ((input.rowCount ?? 0) === 0) return 'empty';
  return 'ready';
}
