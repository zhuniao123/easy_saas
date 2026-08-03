import { useWizardRuntime } from '../WizardContext';
import type { ComponentRenderContext } from '../componentTypes';

interface FieldDef {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  readOnly?: boolean;
}

function FormFieldsView(ctx: ComponentRenderContext) {
  const wizard = useWizardRuntime();
  const rawFields = Array.isArray(ctx.properties.fields) ? ctx.properties.fields : [];
  const fields: FieldDef[] = rawFields
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
    .map((f) => ({
      name: String(f.name || f.field || ''),
      label: f.label != null ? String(f.label) : undefined,
      type: f.type != null ? String(f.type) : 'text',
      required: f.required === true,
      placeholder: f.placeholder != null ? String(f.placeholder) : undefined,
      readOnly: f.readOnly === true,
    }))
    .filter((f) => f.name);

  const title = ctx.properties.title != null ? String(ctx.properties.title) : '';
  const state = wizard?.state || {};

  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        formFields: 请配置 properties.fields
      </div>
    );
  }

  return (
    <div
      className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm"
      data-component-type="formFields"
    >
      {title && <div className="mb-3 text-sm font-semibold text-slate-900">{title}</div>}
      {!wizard && (
        <div className="mb-2 text-xs text-amber-700">未在 Wizard 内：输入不会提交到 finishAction</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const inputType =
            f.type === 'number' || f.type === 'integer'
              ? 'number'
              : f.type === 'date'
                ? 'date'
                : 'text';
          const value = state[f.name];
          return (
            <label key={f.name} className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {f.label || f.name}
                {f.required ? ' *' : ''}
              </span>
              <input
                type={inputType}
                value={value == null ? '' : String(value)}
                placeholder={f.placeholder}
                readOnly={f.readOnly || !wizard}
                disabled={f.readOnly || !wizard}
                onChange={(e) => {
                  if (!wizard) return;
                  const v =
                    e.target.type === 'number'
                      ? e.target.value === ''
                        ? ''
                        : Number(e.target.value)
                      : e.target.value;
                  wizard.setField(f.name, v);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400 disabled:opacity-60"
              />
            </label>
          );
        })}
      </div>
      {wizard && Object.keys(state).length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-500">
          已填: {Object.keys(state).join(', ')}
        </div>
      )}
    </div>
  );
}

/** Registry entry — must render a real component so hooks work. */
export function renderFormFields(ctx: ComponentRenderContext) {
  return <FormFieldsView {...ctx} />;
}
