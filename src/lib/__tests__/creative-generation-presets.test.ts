import { describe, expect, it } from 'vitest';
import {
  buildCreativePromptPreset,
  resolveCreativeGenerationPreset,
} from '@/lib/creative-generation-presets';

describe('creative generation presets', () => {
  it('keeps identity img2img denoise conservative', () => {
    const preset = resolveCreativeGenerationPreset({
      mode: 'img2img',
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      intensity: 2,
      assetRole: 'identity-profile',
      identityConsistency: true,
    });
    expect(preset.denoise).toBe(0.35);
    expect(preset.modelFamily).toBe('flux');
  });

  it('routes high-NSFW realistic art to verified FLUX with full steps', () => {
    const preset = resolveCreativeGenerationPreset({
      mode: 'img2img',
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      intensity: 5,
      assetRole: 'character-art',
    });
    expect(preset.modelFamily).toBe('flux');
    expect(preset.sampler).toBe('euler');
    expect(preset.scheduler).toBe('simple');
    expect(preset.steps).toBeGreaterThanOrEqual(28); // NSFW gets 28+ steps on flux1-dev-fp8
  });

  it('uses the five-second Wan2.2 image-to-video preset', () => {
    const preset = resolveCreativeGenerationPreset({
      mode: 'img2video',
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      intensity: 5,
    });
    expect(preset.durationSeconds).toBe(5);
    expect(preset.modelFamily).toBe('wan22');
    expect(preset.fps).toBe(16);
    expect(preset.frames).toBe(81);
    expect(preset.motionStrength).toBe(7);
  });

  it('builds mode-aware natural-language prompts', () => {
    const prompt = buildCreativePromptPreset({
      mode: 'img2video',
      category: 'female',
      renderStyle: 'realistic',
      intensity: 1,
      scene: 'She turns toward the camera in a softly lit apartment.',
    });
    expect(prompt).toContain('five seconds');
    expect(prompt).toContain('stable facial identity');
    expect(prompt).toContain('smooth temporal continuity');
  });
});
