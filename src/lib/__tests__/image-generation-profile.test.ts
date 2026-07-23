import { afterEach, describe, expect, it } from 'vitest';
import { resolveImageGenerationProfile } from '../image-generation-profile';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('resolveImageGenerationProfile', () => {
  it('routes male portraits without female body cues', () => {
    const profile = resolveImageGenerationProfile('male', false);
    expect(profile.promptSuffix).toMatch(/adult man|masculine/i);
    expect(profile.negativePrompt).toMatch(/female body|underage/i);
  });

  it('uses the configured cartoon checkpoint and LoRA', () => {
    process.env.RUNPOD_CARTOON_CHECKPOINT = 'flux-cartoon.safetensors';
    process.env.RUNPOD_CARTOON_LORA = 'flux-anime-style.safetensors';
    const profile = resolveImageGenerationProfile('cartoon', false);
    expect(profile.checkpoint).toBe('flux-cartoon.safetensors');
    expect(profile.loras[0]?.name).toBe('flux-anime-style.safetensors');
    expect(profile.negativePrompt).toMatch(/photorealistic/);
  });

  it('adds the adult pose LoRA only to adult photoreal requests', () => {
    const safe = resolveImageGenerationProfile('female', false);
    const adult = resolveImageGenerationProfile('female', true);
    expect(safe.loras.some((lora) => lora.name.includes('nsfw_dynamic'))).toBe(false);
    expect(adult.loras.some((lora) => lora.name.includes('nsfw_dynamic'))).toBe(true);
    expect(adult.negativePrompt).toMatch(/non-consensual|underage/);
  });
});
