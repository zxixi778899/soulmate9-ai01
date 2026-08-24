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
      'RUNPOD_PRO_CHAT_URL',
      'RUNPOD_UNLIMITED_CHAT_URL',
      'RUNPOD_VLLM_API_KEY',
      'RUNPOD_API_KEY',
      'DASHSCOPE_API_KEY',
    ]) {
      envBackup[k] = process.env[k];
    }
    // Simulate local .env: RunPod + DashScope present, Together absent
    delete process.env.TOGETHER_API_KEY;
    process.env.DASHSCOPE_API_KEY = 'test-dashscope-key';
    process.env.RUNPOD_VLLM_URL = 'https://api.runpod.ai/v2/test';
    process.env.RUNPOD_PRO_CHAT_URL = 'https://api.runpod.ai/v2/pro/openai/v1';
    process.env.RUNPOD_UNLIMITED_CHAT_URL = 'https://api.runpod.ai/v2/unlimited/openai/v1';
    process.env.RUNPOD_VLLM_API_KEY = 'test-key';
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('detects nsfw keywords with word boundaries', () => {
    expect(detectNsfwIntent('have sex with me')).toBe(true);
    expect(detectNsfwIntent('hello there')).toBe(false);
  });

  it('routes free users to SFW even with nsfw keywords', () => {
    const cfg = createDefaultAiModules();
    cfg.chat.tiers.free.fallback_endpoint_ids = ['runpod-qwen3-8b-pro-nsfw'];
    const r = resolveChatCall(cfg, {
      tier: 'free',
      intimacyLevel: 6,
      message: 'have sex with me',
      rolloutPercent: 100,
    });
    expect(r.channel).toBe('sfw');
    expect(r.blockedReason).toBe('tier_no_nsfw');
    // Free SFW must land on a configured endpoint (RunPod when Together is missing)
    expect(r.endpoint.provider).toBe('runpod');
  });

  it('skips Together when key is missing and uses RunPod', () => {
    const cfg = createDefaultAiModules();
    cfg.chat.tiers.free.sfw_endpoint_id = 'together-llama-8b';
    cfg.chat.tiers.free.fallback_endpoint_ids = ['runpod-qwen3-8b-pro-nsfw'];
    cfg.chat.fallback_endpoint_id = 'runpod-qwen3-8b-pro-nsfw';
    const r = resolveChatCall(cfg, {
      tier: 'free',
      intimacyLevel: 1,
      message: 'hello',
      rolloutPercent: 100,
    });
    expect(r.endpoint.provider).toBe('runpod');
  });

  it('routes pro users to NSFW when intimacy unlocks', () => {
    const cfg = createDefaultAiModules();
    const r = resolveChatCall(cfg, {
      tier: 'pro',
      intimacyLevel: cfg.chat.nsfw_min_intimacy,
      message: 'have sex with me',
      rolloutPercent: 100,
    });
    expect(r.channel).toBe('nsfw');
    expect(r.endpoint.nsfw_capable).toBe(true);
    expect(r.endpoint.id).toBe('runpod-qwen3-8b-pro-nsfw');
  });

  it('keeps unlimited long-memory SFW chat on the third-party chain', () => {
    // v3: SFW stays on instant third-party APIs; RunPod is NSFW-only.
    const result = resolveChatCall(createDefaultAiModules(), {
      tier: 'unlimited',
      intimacyLevel: 5,
      message: 'continue our long story and remember the relationship details',
    });
    expect(result.channel).toBe('sfw');
    expect(result.endpoint.provider).not.toBe('runpod');
  });

  it('keeps paid SFW chat on third-party APIs (no RunPod cold start)', () => {
    const cfg = createDefaultAiModules();
    const pro = resolveChatCall(cfg, { tier: 'pro', message: 'how was your day?', rolloutPercent: 100 });
    expect(pro.channel).toBe('sfw');
    expect(pro.endpoint.provider).toBe('dashscope');
    const unlimited = resolveChatCall(cfg, { tier: 'unlimited', message: 'good morning', rolloutPercent: 100 });
    expect(unlimited.channel).toBe('sfw');
    expect(unlimited.endpoint.provider).toBe('dashscope');
  });

  it('forces the NSFW channel via the explicit preferNsfw switch', () => {
    const cfg = createDefaultAiModules();
    const r = resolveChatCall(cfg, {
      tier: 'pro',
      intimacyLevel: cfg.chat.nsfw_min_intimacy,
      message: 'tell me about your day',
      preferNsfw: true,
      rolloutPercent: 100,
    });
    expect(r.channel).toBe('nsfw');
    expect(r.routeReason).toBe('adult_isolated_runpod');
    expect(r.endpoint.id).toBe('runpod-qwen3-8b-pro-nsfw');
  });

  it('continues an adult route from the last three messages', () => {
    const cfg = createDefaultAiModules();
    const result = resolveChatCall(cfg, {
      tier: 'pro',
      intimacyLevel: cfg.chat.nsfw_min_intimacy,
      message: 'yes, keep going',
      recentMessages: ['hello', 'have sex with me'],
      rolloutPercent: 100,
    });
    expect(result.channel).toBe('nsfw');
  });
  it('locks NSFW when intimacy is low', () => {
    const cfg = createDefaultAiModules();
    const r = resolveChatCall(cfg, {
      tier: 'pro',
      intimacyLevel: 1,
      message: 'have sex with me',
      rolloutPercent: 100,
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
