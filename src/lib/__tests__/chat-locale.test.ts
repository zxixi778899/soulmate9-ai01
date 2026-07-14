import { describe, expect, it } from 'vitest';
import { detectMessageLocale, resolveReplyLocale } from '../chat-locale';

describe('detectMessageLocale', () => {
  it('detects Chinese', () => {
    expect(detectMessageLocale('发张自拍给我看看')).toBe('zh');
    expect(detectMessageLocale('想你了宝贝')).toBe('zh');
  });

  it('detects English', () => {
    expect(detectMessageLocale('Send me a sexy selfie baby')).toBe('en');
    expect(detectMessageLocale('I miss you tonight')).toBe('en');
  });

  it('does not mix-up when English has no Chinese', () => {
    expect(detectMessageLocale('come closer and kiss me')).toBe('en');
  });

  it('returns null for media placeholders', () => {
    expect(detectMessageLocale('[Photo]')).toBeNull();
    expect(detectMessageLocale('[media]')).toBeNull();
  });
});

describe('resolveReplyLocale', () => {
  it('follows page UI language by default (not message script)', () => {
    expect(
      resolveReplyLocale({
        message: '你好呀',
        uiLocale: 'en',
        defaultLocale: 'en',
      }),
    ).toBe('en');

    expect(
      resolveReplyLocale({
        message: 'hey baby what are you wearing',
        uiLocale: 'zh',
        defaultLocale: 'zh',
      }),
    ).toBe('zh');
  });

  it('falls back to UI when message has no script', () => {
    expect(
      resolveReplyLocale({
        message: '🔥🔥',
        uiLocale: 'zh',
        defaultLocale: 'en',
      }),
    ).toBe('zh');
  });

  it('autoDetect can still prefer message language when explicitly enabled', () => {
    expect(
      resolveReplyLocale({
        message: '你好呀',
        uiLocale: 'en',
        defaultLocale: 'en',
        autoDetect: true,
      }),
    ).toBe('zh');
  });
});
