/**
 * Page shell templates (post Slice 8): workspace / wizard.
 * Calendar is a registered component, not a full page shell.
 */

export interface WorkspaceRegionSpec {
  /** 1–12 grid span. Defaults: left 3, center 6, right 3. */
  span?: number;
  title?: string;
  description?: string;
  components: string[];
}

export interface WorkspaceSpec {
  enabled?: boolean;
  gap?: number;
  left?: WorkspaceRegionSpec;
  center?: WorkspaceRegionSpec;
  right?: WorkspaceRegionSpec;
}

export interface WizardStepSpec {
  code: string;
  title: string;
  description?: string;
  components: string[];
}

export interface WizardSpec {
  enabled?: boolean;
  /** Optional actionCode called on finish (sqlTransaction / client). */
  finishActionCode?: string;
  steps: WizardStepSpec[];
}

const clampSpan = (raw: unknown, fallback: number): number => {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(12, Math.max(1, Math.round(n)));
};

const normalizeRegion = (
  raw: unknown,
  defaultSpan: number,
): WorkspaceRegionSpec | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const codesRaw = obj.components ?? obj.componentCodes;
  const codes = Array.isArray(codesRaw)
    ? codesRaw.map((c) => String(c || '').trim()).filter(Boolean)
    : obj.componentCode
      ? [String(obj.componentCode).trim()].filter(Boolean)
      : [];
  if (codes.length === 0) return undefined;
  return {
    span: clampSpan(obj.span ?? obj.colSpan, defaultSpan),
    title: obj.title != null ? String(obj.title) : undefined,
    description: obj.description != null ? String(obj.description) : undefined,
    components: codes,
  };
};

export function normalizeWorkspace(raw: unknown): WorkspaceSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled === false) return undefined;
  const left = normalizeRegion(obj.left, 3);
  const center = normalizeRegion(obj.center ?? obj.main, 6);
  const right = normalizeRegion(obj.right, 3);
  if (!left && !center && !right) return undefined;
  return {
    enabled: true,
    gap:
      typeof obj.gap === 'number' && Number.isFinite(obj.gap) && obj.gap >= 0
        ? obj.gap
        : 16,
    left,
    center,
    right,
  };
}

export function normalizeWizard(raw: unknown): WizardSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled === false) return undefined;
  const stepsRaw = obj.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) return undefined;
  const steps: WizardStepSpec[] = [];
  for (let i = 0; i < stepsRaw.length; i++) {
    const s = stepsRaw[i];
    if (!s || typeof s !== 'object') continue;
    const step = s as Record<string, unknown>;
    const codesRaw = step.components ?? step.componentCodes;
    const codes = Array.isArray(codesRaw)
      ? codesRaw.map((c) => String(c || '').trim()).filter(Boolean)
      : [];
    const title = step.title != null ? String(step.title) : `步骤 ${i + 1}`;
    const code = step.code != null ? String(step.code) : `step_${i + 1}`;
    steps.push({
      code,
      title,
      description: step.description != null ? String(step.description) : undefined,
      components: codes,
    });
  }
  if (steps.length === 0) return undefined;
  return {
    enabled: true,
    finishActionCode:
      obj.finishActionCode != null ? String(obj.finishActionCode) : undefined,
    steps,
  };
}
