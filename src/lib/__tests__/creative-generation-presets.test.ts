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

  it('routes high-NSFW realistic art to SDXL pony (FLUX NSFW disabled by policy)', () => {
    const preset = resolveCreativeGenerationPreset({
      mode: 'img2img',
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      intensity: 5,
      assetRole: 'character-art',
      // NSFW 硬路由 SDXL：测试环境显式提供端点，避免依赖 env
      sdxlEndpointId: 'test-sdxl-endpoint',
    });
    expect(preset.modelFamily).toBe('pony');
    expect(preset.sampler).toBe('dpmpp_2m_sde');
    expect(preset.scheduler).toBe('karras');
    expect(preset.steps).toBeGreaterThanOrEqual(30); // NSFW pony gets 30+ steps
    expect(preset.cfg).toBe(6.5);
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
