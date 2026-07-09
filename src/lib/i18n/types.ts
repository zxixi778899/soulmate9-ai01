export type Locale = 'en' | 'zh';

export const LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'zh', label: '简体中文', nativeLabel: '简体中文' },
];