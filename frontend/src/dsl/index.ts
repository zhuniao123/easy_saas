/** Core DSL re-exports — keep template compilers thin; runtime imports from here. */
export { normalizePageDsl } from '../pageDsl';
export type { PageDslModel, PageDataSource, PagePresentation, PageFeatures } from '../pageDsl';
export type { ActionConfig, ColumnConfig, FilterConfig, ActionContext } from '../actionRegistry';
export { resolveActionHandler } from '../actionRegistry';
