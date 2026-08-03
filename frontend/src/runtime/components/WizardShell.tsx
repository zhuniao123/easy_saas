import { useMemo, useState } from 'react';
import type { ComponentEvent } from '../componentTypes';
import type { WizardSpec } from '../pageShellTypes';
import { indexSlotsByCode, renderSlotItem, type SlotItem } from './renderSlot';

/**
 * Stepper wizard shell — one step of components at a time.
 * Finish can notify via onFinish (page may call Action / endpoint).
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
  onFinish?: (stepCode: string) => void | Promise<void>;
}) {
  const steps = wizard.steps;
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const byCode = useMemo(() => indexSlotsByCode(items), [items]);
  const step = steps[Math.min(index, steps.length - 1)];
  const isFirst = index <= 0;
  const isLast = index >= steps.length - 1;

  const finish = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await onFinish?.(step.code);
      setMessage(
        wizard.finishActionCode
          ? `已完成（可接 action: ${wizard.finishActionCode}）`
          : '向导完成',
      );
      onEvent?.({
        type: 'wizardFinish',
        componentCode: 'wizard',
        payload: { stepCode: step.code, finishActionCode: wizard.finishActionCode },
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '完成失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-wizard-shell="true">
      {/* Stepper header */}
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
      </div>

      {/* Step body */}
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

        {message && (
          <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div>
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
                完成
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
