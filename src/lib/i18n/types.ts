/**
 * ✅ Simplified to EN + ZH only (2026-08-10)
 * Other languages (ja, ko, es, fr, de) removed to reduce translation maintenance burden.
 * Future additions will include automatic en + zh translations via LLM.
 */
export const SUPPORTED_LOCALES = ['en', 'zh'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TranslationKey = keyof typeof import('./translations').en;

export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
];

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value.toLowerCase() as Locale);
}
