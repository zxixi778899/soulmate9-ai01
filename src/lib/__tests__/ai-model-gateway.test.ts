import { describe, expect, it } from 'vitest';
import { createDefaultAiModules } from '@/lib/ai-modules/defaults';
import { isGatewayV2Enrolled, resolveChatCall, resolveImageCall, scoreChatComplexity } from '@/lib/ai-modules/resolve';

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

  it('downgrades Free adult intent and isolates eligible paid adult traffic', () => {
    const config = createDefaultAiModules();
    const free = resolveChatCall(config, { tier: 'free', message: 'get naked', intimacyLevel: 6, adultCharacterVerified: true });
    const pro = resolveChatCall(config, { tier: 'pro', rolloutPercent: 100, message: 'get naked', intimacyLevel: 6, adultCharacterVerified: true });
    expect(free.channel).toBe('sfw');
    expect(free.blockedReason).toBe('tier_no_nsfw');
    expect(pro.channel).toBe('nsfw');
    expect(pro.endpoint.provider).toBe('runpod');
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