/**
 * Master-detail page DSL (Slice 8).
 * Header form + editable lines; save goes to POST /pages/{code}/master-detail/save.
 */

export interface MasterDetailFieldSpec {
  field: string;
  label?: string;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  /** When true, amount can be qty * unit_price client-side. */
  computed?: boolean;
}

export interface MasterDetailSideSpec {
  entityCode: string;
  primaryKey?: string;
  /** Query that returns one header row (params: id / headerId). */
  loadQueryCode?: string;
  fields?: Array<string | MasterDetailFieldSpec>;
  versionField?: string;
  statusField?: string;
  /** Header field required on submit (e.g. member_name). */
  requiredMemberField?: string;
  /** Lines only: FK to header pk. */
  fkField?: string;
}

export interface MasterDetailSpec {
  enabled?: boolean;
  header: MasterDetailSideSpec;
  lines: MasterDetailSideSpec;
  draftStatus?: string;
  submitStatus?: string;
  /** Title shown above editor. */
  title?: string;
  /** sessionStorage key for prefill from workspace row click. */
  prefillStorageKey?: string;
}

export type LineRowState = 'added' | 'modified' | 'deleted' | 'unchanged';

export function normalizeMasterDetail(raw: unknown): MasterDetailSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled === false) return undefined;

  const headerRaw = obj.header;
  const linesRaw = obj.lines;
  if (!headerRaw || typeof headerRaw !== 'object' || !linesRaw || typeof linesRaw !== 'object') {
    return undefined;
  }
  const header = headerRaw as Record<string, unknown>;
  const lines = linesRaw as Record<string, unknown>;
  if (!header.entityCode || !lines.entityCode) return undefined;

  const normalizeFields = (fields: unknown): MasterDetailFieldSpec[] | undefined => {
    if (!Array.isArray(fields) || fields.length === 0) return undefined;
    const out: MasterDetailFieldSpec[] = [];
    for (const f of fields) {
      if (typeof f === 'string') {
        const field = f.trim();
        if (field) out.push({ field });
        continue;
      }
      if (f && typeof f === 'object') {
        const m = f as Record<string, unknown>;
        const field = String(m.field || '').trim();
        if (!field) continue;
        out.push({
          field,
          label: m.label != null ? String(m.label) : undefined,
          type: m.type != null ? String(m.type) : undefined,
          required: m.required === true,
          readOnly: m.readOnly === true,
          computed: m.computed === true,
        });
      }
    }
    return out.length ? out : undefined;
  };

  return {
    enabled: obj.enabled !== false,
    title: obj.title != null ? String(obj.title) : undefined,
    draftStatus: obj.draftStatus != null ? String(obj.draftStatus) : 'draft',
    submitStatus: obj.submitStatus != null ? String(obj.submitStatus) : 'submitted',
    prefillStorageKey:
      obj.prefillStorageKey != null ? String(obj.prefillStorageKey) : undefined,
    header: {
      entityCode: String(header.entityCode),
      primaryKey: header.primaryKey != null ? String(header.primaryKey) : 'id',
      loadQueryCode: header.loadQueryCode != null ? String(header.loadQueryCode) : undefined,
      versionField: header.versionField != null ? String(header.versionField) : undefined,
      statusField: header.statusField != null ? String(header.statusField) : 'status',
      requiredMemberField:
        header.requiredMemberField != null ? String(header.requiredMemberField) : undefined,
      fields: normalizeFields(header.fields),
    },
    lines: {
      entityCode: String(lines.entityCode),
      primaryKey: lines.primaryKey != null ? String(lines.primaryKey) : 'id',
      fkField: lines.fkField != null ? String(lines.fkField) : 'order_id',
      loadQueryCode: lines.loadQueryCode != null ? String(lines.loadQueryCode) : undefined,
      fields: normalizeFields(lines.fields),
    },
  };
}

export function fieldList(side: MasterDetailSideSpec): MasterDetailFieldSpec[] {
  if (!side.fields || side.fields.length === 0) return [];
  return side.fields.map((f) => (typeof f === 'string' ? { field: f } : f));
}

let tempSeq = 0;
export function nextTempId(): string {
  tempSeq += 1;
  return `tmp_${Date.now()}_${tempSeq}`;
}
