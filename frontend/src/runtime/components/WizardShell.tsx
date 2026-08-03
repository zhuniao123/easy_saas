import { useCallback, useMemo, useState } from 'react';
import type { ComponentEvent } from '../componentTypes';
import type { WizardSpec } from '../pageShellTypes';
import { WizardRuntimeProvider } from '../WizardContext';
import { indexSlotsByCode, renderSlotItem, type SlotItem } from './renderSlot';

/**
 * Stepper wizard with shared form state.
 * Finish validates requiredOnFinish and passes state to onFinish.
 */
export default function WizardShell({
  wizard,
  items,
  onEvent,
  onFinish,
}: {
  wizard: WizardSpec;
  items: SlotItem[];
  onEvent?: (event: ComponentEvent) => void;
  onFinish?: (payload: {
    stepCode: string;
    state: Record<string, unknown>;
  }) => void | Promise<void>;
}) {
  const steps = wizard.steps;
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, unknown>>({});
  const byCode = useMemo(() => indexSlotsByCode(items), [items]);
  const step = steps[Math.min(index, steps.length - 1)];
  const isFirst = index <= 0;
  const isLast = index >= steps.length - 1;

  const setField = useCallback((key: string, value: unknown) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);
  const setFields = useCallback((patch: Record<string, unknown>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const wizardRuntime = useMemo(
    () => ({ state, setField, setFields }),
    [state, setField, setFields],
  );

  const required = useMemo(() => {
    const raw = (wizard as { requiredOnFinish?: unknown }).requiredOnFinish;
    if (!Array.isArray(raw)) return [] as string[];
    return raw.map((x) => String(x)).filter(Boolean);
  }, [wizard]);

  const finish = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      for (const key of required) {
        const v = state[key];
        if (v == null || (typeof v === 'string' && !v.trim())) {
          throw new Error(`请先填写/选择：${key}`);
        }
      }
      await onFinish?.({ stepCode: step.code, state: { ...state } });
      setMessage(
        wizard.finishActionCode
          ? `已完成（action: ${wizard.finishActionCode}）`
          : '向导完成',
      );
      onEvent?.({
        type: 'wizardFinish',
        componentCode: 'wizard',
        payload: {
          stepCode: step.code,
          finishActionCode: wizard.finishActionCode,
          state: { ...state },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '完成失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardRuntimeProvider value={wizardRuntime}>
      <div className="space-y-4" data-wizard-shell="true">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Wizard
          </div>
          <ol className="mt-3 flex flex-wrap gap-2">
            {steps.map((s, i) => {
              const active = i === index;
              const done = i < index;
              return (
                <li key={s.code}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-cyan-600 text-white'
                        : done
                          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                          : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
                    }`}
                  >
                    {i + 1}. {s.title}
                  </button>
                </li>
              );
            })}
          </ol>
          {step.description && (
            <p className="mt-2 text-sm text-slate-500">{step.description}</p>
          )}
          {Object.keys(state).length > 0 && (
            <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              当前选择：
              {state.member_name != null && <span className="ml-1">会员={String(state.member_name)}</span>}
              {state.product_name != null && <span className="ml-2">卡项={String(state.product_name)}</span>}
              {state.member_id != null && (
                <span className="ml-2 font-mono text-slate-400">id={String(state.member_id)}</span>
              )}
              {state.product_id != null && (
                <span className="ml-1 font-mono text-slate-400">/ product={String(state.product_id)}</span>
              )}
            </div>
          )}
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-4 text-lg font-semibold text-slate-900">{step.title}</div>
          <div className="space-y-3">
            {step.components.length === 0 && (
              <div className="text-sm text-slate-400">本步未绑定组件</div>
            )}
            {step.components.map((code) => {
              const item = byCode[code];
              if (!item) {
                return (
                  <div
                    key={code}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  >
                    Missing component: {code}
                  </div>
                );
              }
              return <div key={code}>{renderSlotItem(item, onEvent)}</div>;
            })}
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {message && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              disabled={isFirst || busy}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              上一步
            </button>
            <div className="flex gap-2">
              {!isLast && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
                  className="rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-cyan-500"
                >
                  下一步
                </button>
              )}
              {isLast && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finish()}
                  className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  确认开卡
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </WizardRuntimeProvider>
  );
}
