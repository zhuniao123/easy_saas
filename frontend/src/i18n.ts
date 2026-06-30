import enUS from './locales/en-US.json';
import zhCN from './locales/zh-CN.json';

export type LocaleCode = 'zh-CN' | 'en-US';
export type MessageKey = keyof typeof zhCN;
export type Translator = (key: string, values?: Record<string, string | number>) => string;

const LOCALES: Record<LocaleCode, Record<string, string>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

const normalizeLocale = (locale?: string | null): LocaleCode => {
  if (!locale) return 'zh-CN';
  const normalized = locale.toLowerCase();
  if (normalized.startsWith('zh')) return 'zh-CN';
  return 'en-US';
};

export const getDefaultLocale = () => {
  if (typeof window === 'undefined') return 'zh-CN' as LocaleCode;
  const persisted = window.localStorage.getItem('easy_saas_locale');
  return normalizeLocale(persisted || window.navigator.language);
};

export const resolveLocale = (preferred?: string | null) => normalizeLocale(preferred || getDefaultLocale());

const interpolate = (template: string, values?: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_match, key) => String(values?.[key] ?? ''));

export const createTranslator = (locale: LocaleCode, overrides?: Record<string, string>): Translator => {
  const messages = {
    ...LOCALES[locale],
    ...(overrides || {}),
  };

  return (key: string, values?: Record<string, string | number>) => {
    const template = messages[key] || LOCALES['zh-CN'][key as MessageKey] || key;
    return interpolate(template, values);
  };
};
