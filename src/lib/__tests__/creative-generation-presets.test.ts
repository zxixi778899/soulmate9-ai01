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

  it('routes explicit realistic art to Pony parameters', () => {
    const preset = resolveCreativeGenerationPreset({
      mode: 'img2img',
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      intensity: 5,
      assetRole: 'character-art',
    });
    expect(preset.modelFamily).toBe('pony');
    expect(preset.sampler).toContain('dpmpp');
    expect(preset.scheduler).toBe('karras');
    expect(preset.steps).toBeGreaterThanOrEqual(28);
  });

  it('uses a five-second 40-frame animation preset', () => {
    const preset = resolveCreativeGenerationPreset({
      mode: 'img2video',
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      intensity: 5,
    });
    expect(preset.durationSeconds).toBe(5);
    expect(preset.fps).toBe(8);
    expect(preset.frames).toBe(40);
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
