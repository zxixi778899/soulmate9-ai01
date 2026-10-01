import { describe, expect, it } from 'vitest';
import { createDefaultAiModules } from '@/lib/ai-modules/defaults';
import { resolveChatCall, resolveImageCall, scoreChatComplexity } from '@/lib/ai-modules/resolve';

describe('AI Model Gateway v2', () => {
  it('keeps free ordinary chat on the economy model', () => {
    const result = resolveChatCall(createDefaultAiModules(), { tier: 'free', message: 'Hi there', locale: 'en' });
    expect(result.endpoint.id).toBe('together-qwen35-9b');
    expect(result.routeReason).toBe('standard_chat');
    expect(result.qualityTier).toBe('economy');
  });

  it('upgrades Unlimited long-memory conversations to Kimi', () => {
    const result = resolveChatCall(createDefaultAiModules(), { tier: 'unlimited', rolloutPercent: 100, message: 'Do you remember our relationship conflict last time? Continue the story.', memoryCount: 3, contextMessageCount: 22 });
    expect(scoreChatComplexity({ tier: 'unlimited', rolloutPercent: 100, message: 'remember our relationship', memoryCount: 2 })).toBeGreaterThanOrEqual(5);
    expect(result.endpoint.id).toBe('together-kimi-k26');
    expect(result.routeReason).toBe('complex_or_memory_upgrade');
  });

  it('opens Free adult intent to the NSFW channel and isolates eligible paid adult traffic', () => {
    const config = createDefaultAiModules();
    const free = resolveChatCall(config, { tier: 'free', message: 'get naked', intimacyLevel: 6, adultCharacterVerified: true });
    const pro = resolveChatCall(config, { tier: 'pro', rolloutPercent: 100, message: 'get naked', intimacyLevel: 6, adultCharacterVerified: true });
    // v6: free/basic tiers allow NSFW — adult intent at Lv2+ routes to the
    // NSFW channel instead of being force-downgraded to SFW.
    expect(free.channel).toBe('nsfw');
    expect(free.allowNsfw).toBe(true);
    expect(pro.channel).toBe('nsfw');
    expect(pro.endpoint.provider).toBe('runpod');
  });

  it('still locks Free adult intent below the intimacy threshold', () => {
    const config = createDefaultAiModules();
    const free = resolveChatCall(config, { tier: 'free', message: 'get naked', intimacyLevel: 1, adultCharacterVerified: true });
    expect(free.channel).toBe('sfw');
    expect(free.blockedReason).toBe('intimacy_locked');
  });

  it('applies image quality and reference limits by membership', () => {
    const config = createDefaultAiModules();
    const free = resolveImageCall(config, { tier: 'free', scene: 'chat_selfie' });
    const unlimited = resolveImageCall(config, { tier: 'unlimited', scene: 'chat_selfie' });
    expect(free.maxReferences).toBe(1);
    expect(unlimited.maxReferences).toBe(3);
    expect(unlimited.qualityTier).toBe('premium');
  });
});