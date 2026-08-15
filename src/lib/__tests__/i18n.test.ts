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

  it('serves native bags for translated locales and falls back to English elsewhere', () => {
    expect(getTranslation('common.save', 'ja')).toBe('保存');
    expect(getTranslation('common.save', 'pt')).toBe('Save');
  });

  it('mirrors English values for es/de and never exposes raw keys', () => {
    // es / de carry EN values until native bags land; no locale may expose raw keys.
    const sample: Array<'common.cancel' | 'chat.send' | 'auth.login'> = [
      'common.cancel',
      'chat.send',
      'auth.login',
    ];
    for (const key of sample) {
      expect(getTranslation(key, 'es')).toBe(getTranslation(key, 'en'));
      expect(getTranslation(key, 'de')).toBe(getTranslation(key, 'en'));
    }
    for (const locale of ['zh', 'ja', 'ko', 'es', 'fr', 'de']) {
      const value = getTranslation('common.cancel', locale);
      expect(value).not.toBe('common.cancel');
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it('interpolates localized parameters', () => {
    expect(getTranslation('chat.usageWarning', 'en', { count: 3, limit: 50 }))
      .toBe('You used 3/50 free messages today');
  });
});
