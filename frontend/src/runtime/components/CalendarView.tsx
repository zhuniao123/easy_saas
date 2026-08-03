import type { ComponentRenderContext } from '../componentTypes';
import { ComponentEmptyState, ComponentErrorState, ComponentLoadingState } from './ComponentStates';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  resourceId?: string;
  status?: string;
  row?: Record<string, unknown>;
}

function pick(row: Record<string, unknown>, key: string | undefined, fallbacks: string[]): unknown {
  if (key && row[key] != null) return row[key];
  for (const f of fallbacks) {
    if (row[f] != null) return row[f];
  }
  return undefined;
}

function toEvents(
  rows: Array<Record<string, unknown>>,
  bindings: Record<string, string> | undefined,
): CalendarEvent[] {
  const b = bindings || {};
  return rows.map((row, i) => {
    const id = String(pick(row, b.id, ['id', 'event_id']) ?? `ev_${i}`);
    const title = String(pick(row, b.title, ['title', 'name', 'service_name', 'member_name']) ?? '事件');
    const start = String(pick(row, b.start, ['start', 'start_at', 'start_time', 'appt_at']) ?? '');
    const endRaw = pick(row, b.end, ['end', 'end_at', 'end_time']);
    const resourceId = pick(row, b.resourceId, ['resource_id', 'staff_id', 'staff_name']);
    const status = pick(row, b.status, ['status']);
    return {
      id,
      title,
      start,
      end: endRaw != null ? String(endRaw) : undefined,
      resourceId: resourceId != null ? String(resourceId) : undefined,
      status: status != null ? String(status) : undefined,
      row,
    };
  });
}

function dayKey(iso: string): string {
  if (!iso) return 'unknown';
  // accept date or datetime
  return iso.slice(0, 10);
}

function buildDayRange(center: Date, days: number): string[] {
  const start = new Date(center);
  start.setHours(0, 0, 0, 0);
  // align to Monday
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

/**
 * SQL-driven calendar (week grid). Click event → itemClick.
 * Expected bindings: id, title, start, end?, resourceId?, status?
 */
export function renderCalendar(ctx: ComponentRenderContext) {
  const { status, error, data, properties, bindings, onEvent, spec } = {
    ...ctx,
    bindings: ctx.spec.bindings,
  };

  if (status === 'loading') {
    return <ComponentLoadingState label="加载日程…" />;
  }
  if (status === 'error') {
    return <ComponentErrorState message={error || 'Calendar load failed'} />;
  }

  const rows = data?.rows || [];
  const events = toEvents(rows, bindings);
  if (status === 'empty' || events.length === 0) {
    // still show empty week chrome
  }

  const viewDays = Number(properties.days) > 0 ? Number(properties.days) : 7;
  const height = Number(properties.height) > 0 ? Number(properties.height) : 420;
  const title = properties.title != null ? String(properties.title) : '日程';
  const days = buildDayRange(new Date(), viewDays);

  const dayMap = new Map<string, CalendarEvent[]>();
  for (const d of days) dayMap.set(d, []);
  for (const ev of events) {
    const k = dayKey(ev.start);
    if (!dayMap.has(k)) dayMap.set(k, []);
    dayMap.get(k)!.push(ev);
  }

  return (
    <div
      className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)]"
      data-component-type="calendar"
      style={{ minHeight: height }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <div className="text-[11px] text-slate-400">
          {events.length} 条 · SQL bindings
        </div>
      </div>
      {events.length === 0 ? (
        <ComponentEmptyState message="本周暂无预约（检查 query / bindings）" />
      ) : null}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((d) => {
          const list = dayMap.get(d) || [];
          const label = d.slice(5); // MM-DD
          return (
            <div
              key={d}
              className="min-h-[10rem] rounded-xl border border-slate-100 bg-slate-50/80 p-2"
              data-cal-day={d}
            >
              <div className="mb-2 text-center text-[11px] font-semibold text-slate-500">{label}</div>
              <div className="space-y-1.5">
                {list.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className="w-full rounded-lg border border-cyan-100 bg-white px-2 py-1.5 text-left text-xs shadow-sm hover:border-cyan-300 hover:bg-cyan-50"
                    onClick={() =>
                      onEvent?.({
                        type: 'itemClick',
                        componentCode: spec.componentCode,
                        payload: {
                          id: ev.id,
                          name: ev.title,
                          title: ev.title,
                          start: ev.start,
                          end: ev.end,
                          resourceId: ev.resourceId,
                          status: ev.status,
                          row: ev.row,
                        },
                      })
                    }
                  >
                    <div className="font-medium text-slate-800 line-clamp-2">{ev.title}</div>
                    {ev.resourceId && (
                      <div className="mt-0.5 text-[10px] text-slate-400">{ev.resourceId}</div>
                    )}
                    {ev.status && (
                      <div className="mt-0.5 text-[10px] text-cyan-700">{ev.status}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
