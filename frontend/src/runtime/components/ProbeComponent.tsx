import type { ComponentRenderContext } from '../componentTypes';
import { ComponentErrorState, ComponentLoadingState } from './ComponentStates';

/**
 * Acceptance probe for the component registry.
 * Register type `probe` — proves new components need zero PageLoader type switches.
 */
export function renderProbeComponent(ctx: ComponentRenderContext) {
  const label = String(ctx.properties.label || ctx.spec.properties?.label || 'Probe Component');
  const detail = String(ctx.properties.detail || ctx.spec.properties?.detail || '');

  if (ctx.status === 'loading') {
    return <ComponentLoadingState label="Probe loading" />;
  }
  if (ctx.status === 'error') {
    return <ComponentErrorState message={ctx.error || 'Probe error'} />;
  }

  return (
    <div
      data-testid="probe-component"
      className="rounded-[26px] border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-900 shadow-[0_12px_40px_rgba(109,40,217,0.08)]"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-500">
        Registered component · {ctx.spec.type}
      </div>
      <div className="mt-2 text-lg font-semibold">{label}</div>
      {detail ? <p className="mt-1 text-sm text-violet-800/80">{detail}</p> : null}
      <div className="mt-3 font-mono text-[11px] text-violet-600">
        code={ctx.spec.componentCode} · status={ctx.status}
      </div>
    </div>
  );
}
