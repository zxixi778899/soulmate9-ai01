import { describe, expect, it } from 'vitest';
import { getTranslation } from '@/lib/i18n/translations';
import { isSupportedLocale, SUPPORTED_LOCALES } from '@/lib/i18n/types';

describe('i18n locale contract', () => {
  it('exposes the seven supported launch locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de']);
  });

  it('normalizes case but rejects unsupported locales', () => {
    expect(isSupportedLocale('JA')).toBe(true);
    expect(isSupportedLocale('pt')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it('falls back to English instead of exposing empty translation placeholders', () => {
    expect(getTranslation('common.save', 'ja')).toBe('Save');
    expect(getTranslation('common.save', 'pt')).toBe('Save');
  });

  it('interpolates localized parameters', () => {
    expect(getTranslation('chat.usageWarning', 'en', { count: 3, limit: 50 }))
      .toBe('You used 3/50 free messages today');
  });
});
