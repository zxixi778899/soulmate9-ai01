import { describe, it, expect } from 'vitest';
import { moderateText, inferNsfwLevel, requiresEnhancedDeletion, isCacheableOnPublicCdn } from '@/lib/content-moderation';

describe('content-moderation: moderateText', () => {
  it('allows normal adult content', () => {
    expect(moderateText('I love you, would you like to spend the evening together?').allowed).toBe(true);
    expect(moderateText('Tell me about your day').allowed).toBe(true);
  });

  it('blocks content with minor-related keywords', () => {
    const result = moderateText('I want to roleplay with a minor');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('content_violates_policy');
  });

  it('blocks content with Chinese minor keywords', () => {
    expect(moderateText('\u8FD9\u4E2A\u89D2\u8272\u770B\u8D77\u6765\u672A\u6210\u5E74').allowed).toBe(false);
    expect(moderateText('\u6211\u559C\u6B22\u5C11\u5973\u89D2\u8272').allowed).toBe(false);
  });

  it('blocks non-consensual content', () => {
    expect(moderateText('force the character to do something').allowed).toBe(false);
    expect(moderateText('rape scene').allowed).toBe(false);
    expect(moderateText('\u5F3A\u8FEB\u5979\u505A\u67D0\u4E8B').allowed).toBe(false);
  });

  it('blocks real person references', () => {
    expect(moderateText('I want to chat with a celebrity').allowed).toBe(false);
    expect(moderateText('\u6211\u60F3\u548C\u660E\u661F\u804A\u5929').allowed).toBe(false);
  });

  it('handles empty / undefined safely', () => {
    expect(moderateText('').allowed).toBe(true);
    expect(moderateText('').nsfwLevel).toBe('sfw');
  });

  it('truncates long input to prevent ReDoS', () => {
    const longText = 'a'.repeat(20000) + ' minor';
    // 10000  minor 
    expect(moderateText(longText).allowed).toBe(true);
  });

  it('is case insensitive for English keywords', () => {
    expect(moderateText('MINOR character').allowed).toBe(false);
    expect(moderateText('Minor').allowed).toBe(false);
  });

  it('blocks sexual content in SFW mode but permits it in adult mode', () => {
    const sfw = moderateText('Send me a nude photo', 'sfw');
    expect(sfw.allowed).toBe(false);
    expect(sfw.reason).toBe('explicit_content_disabled');
    expect(moderateText('Send me a nude photo', 'adult')).toEqual({
      allowed: true,
      nsfwLevel: 'explicit',
    });
  });

  it('does not treat every adult student reference as a minor', () => {
    expect(moderateText('I am a university student studying physics').allowed).toBe(true);
  });
});

describe('content-moderation: inferNsfwLevel', () => {
  it('returns explicit for explicit images', () => {
    expect(inferNsfwLevel({ hasExplicitImage: true })).toBe('explicit');
  });

  it('returns sfw when girlfriend disallows NSFW', () => {
    expect(inferNsfwLevel({ girlfriendAllowNsfw: false })).toBe('sfw');
  });

  it('returns moderate by default', () => {
    expect(inferNsfwLevel({ girlfriendAllowNsfw: true })).toBe('moderate');
  });
});

describe('content-moderation: requiresEnhancedDeletion', () => {
  it('flags moderate and explicit for enhanced deletion', () => {
    expect(requiresEnhancedDeletion('sfw')).toBe(false);
    expect(requiresEnhancedDeletion('mild')).toBe(false);
    expect(requiresEnhancedDeletion('moderate')).toBe(true);
    expect(requiresEnhancedDeletion('explicit')).toBe(true);
  });
});

describe('content-moderation: isCacheableOnPublicCdn', () => {
  it('never allows public CDN cache (NSFW protection)', () => {
    expect(isCacheableOnPublicCdn('sfw')).toBe(false);
    expect(isCacheableOnPublicCdn('moderate')).toBe(false);
    expect(isCacheableOnPublicCdn('explicit')).toBe(false);
  });
});
