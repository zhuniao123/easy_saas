/**
 * Editor registry types — shared by filters, forms, and future inline edit.
 * Independent of page templates (singleTable / rawSql / masterDetail).
 */

export type EditorType =
  | 'text'
  | 'number'
  | 'textarea'
  | 'boolean'
  | 'select'
  | 'autocomplete'
  | 'date'
  | 'datetime'
  | 'money';

export interface EditorOptionItem {
  label: string;
  value: string;
}

export interface SqlOptionsSource {
  source: 'sql';
  queryCode: string;
  labelField: string;
  valueField: string;
  keywordParam?: string;
  preload?: boolean;
}

export interface StaticOptionsSource {
  source: 'static';
  items: EditorOptionItem[];
}

export type OptionsSource = SqlOptionsSource | StaticOptionsSource | EditorOptionItem[];

export interface EditorDefinition {
  type: EditorType;
  placeholder?: string;
  options?: OptionsSource;
  minChars?: number;
  /** Form / filter hint only */
  required?: boolean;
}

/** Map entity/field type string to a default editor */
export const editorTypeFromFieldType = (type?: string): EditorType => {
  const t = (type || 'string').toLowerCase();
  if (t === 'integer' || t === 'number' || t === 'money') return t === 'money' ? 'money' : 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'datetime' || t === 'timestamp') return 'datetime';
  if (t === 'date') return 'date';
  if (t === 'text' || t === 'textarea') return 'textarea';
  return 'text';
};

export const htmlInputTypeForEditor = (editor: EditorType): string => {
  switch (editor) {
    case 'number':
    case 'money':
      return 'number';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime-local';
    case 'boolean':
      return 'checkbox';
    default:
      return 'text';
  }
};
