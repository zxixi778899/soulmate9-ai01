import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDefaultAiModules,
  resolveChatCall,
  resolveImageCall,
  detectNsfwIntent,
} from '@/lib/ai-modules';

describe('ai-modules resolve', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      'TOGETHER_API_KEY',
      'RUNPOD_VLLM_URL',
      'RUNPOD_VLLM_API_KEY',
      'RUNPOD_API_KEY',
    ]) {
      envBackup[k] = process.env[k];
    }
    // Simulate local .env: RunPod present, Together absent
    delete process.env.TOGETHER_API_KEY;
    process.env.RUNPOD_VLLM_URL = 'https://api.runpod.ai/v2/test';
    process.env.RUNPOD_VLLM_API_KEY = 'test-key';
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('detects nsfw keywords with word boundaries', () => {
    expect(detectNsfwIntent('kiss me hard')).toBe(true);
    expect(detectNsfwIntent('hello there')).toBe(false);
  });

  it('routes free users to SFW even with nsfw keywords', () => {
    const cfg = createDefaultAiModules();
    const r = resolveChatCall(cfg, {
      tier: 'free',
      intimacyLevel: 6,
      message: 'kiss me hard',
    });
    expect(r.channel).toBe('sfw');
    expect(r.blockedReason).toBe('tier_no_nsfw');
    // Free SFW must land on a configured endpoint (RunPod when Together is missing)
    expect(r.endpoint.provider).toBe('runpod');
  });

  it('skips Together when key is missing and uses RunPod', () => {
    const cfg = createDefaultAiModules();
    cfg.chat.tiers.free.sfw_endpoint_id = 'together-llama-8b';
    cfg.chat.fallback_endpoint_id = 'together-llama-8b';
    const r = resolveChatCall(cfg, {
      tier: 'free',
      intimacyLevel: 1,
      message: 'hello',
    });
    expect(r.endpoint.provider).toBe('runpod');
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
