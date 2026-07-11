import { describe, it, expect } from 'vitest';
import { createDefaultAiModules, resolveChatCall, resolveImageCall } from '@/lib/ai-modules';

describe('ai-modules resolve', () => {
  it('routes free users to SFW even with nsfw keywords', () => {
    const cfg = createDefaultAiModules();
    const r = resolveChatCall(cfg, {
      tier: 'free',
      intimacyLevel: 6,
      message: 'kiss me hard',
    });
    expect(r.channel).toBe('sfw');
    expect(r.blockedReason).toBe('tier_no_nsfw');
    expect(r.endpoint.id).toBe(cfg.chat.tiers.free.sfw_endpoint_id);
  });

  it('routes pro users to NSFW when intimacy unlocks', () => {
    const cfg = createDefaultAiModules();
    const r = resolveChatCall(cfg, {
      tier: 'pro',
      intimacyLevel: cfg.chat.nsfw_min_intimacy,
      message: 'kiss me hard',
    });
    expect(r.channel).toBe('nsfw');
    expect(r.endpoint.nsfw_capable).toBe(true);
  });

  it('locks NSFW when intimacy is low', () => {
    const cfg = createDefaultAiModules();
    const r = resolveChatCall(cfg, {
      tier: 'pro',
      intimacyLevel: 1,
      message: 'kiss me hard',
    });
    expect(r.channel).toBe('sfw');
    expect(r.blockedReason).toBe('intimacy_locked');
  });

  it('resolves image scene presets and daily limit by tier', () => {
    const cfg = createDefaultAiModules();
    const free = resolveImageCall(cfg, { scene: 'chat_selfie', tier: 'free' });
    expect(free.config.width).toBe(cfg.image.scenes.chat_selfie.width);
    expect(free.dailyLimit).toBe(cfg.image.free_daily_images);
    expect(free.tokenCost).toBe(cfg.image.scenes.chat_selfie.token_cost);

    const pro = resolveImageCall(cfg, { scene: 'chat_selfie', tier: 'pro' });
    expect(pro.dailyLimit).toBe(cfg.image.pro_daily_images);
  });
});
