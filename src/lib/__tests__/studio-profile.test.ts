import { describe, expect, it } from 'vitest';
import {
  buildStudioPromptEnhancement,
  loraUsageZh,
  recommendedStudioLoras,
  studioLoraStrengthScale,
  studioNegativePrompt,
} from '@/lib/comfy-console/studio-profile';

describe('studio generation profiles', () => {
  it('preserves simultaneous transgender characteristics', () => {
    const prompt = buildStudioPromptEnhancement({
      category: 'transgender',
      intensity: 5,
    });
    expect(prompt).toContain('developed breasts');
    expect(prompt).toContain('external male genital anatomy');
    expect(prompt).toContain('maximum consensual adult intensity');
    expect(studioNegativePrompt('transgender')).toContain('duplicated genitals');
  });

  it('makes all five intensity levels materially different', () => {
    const prompts = ([1, 2, 3, 4, 5] as const).map((intensity) =>
      buildStudioPromptEnhancement({ category: 'female', intensity }),
    );
    expect(new Set(prompts).size).toBe(5);
    expect(prompts[0]).toContain('no visible nipples or genitals');
    expect(prompts[2]).toContain('explicitly nude');
    expect(prompts[4]).toContain('Do not soften');
    expect(studioLoraStrengthScale(5)).toBeGreaterThan(studioLoraStrengthScale(1));
  });
  it('keeps 2D and 3D anime directions mutually distinct', () => {
    const twoD = buildStudioPromptEnhancement({
      category: 'anime',
      intensity: 5,
      animeStyle: '2d',
    });
    const threeD = buildStudioPromptEnhancement({
      category: 'anime',
      intensity: 5,
      animeStyle: '3d',
    });
    expect(twoD).toContain('clean confident line art');
    expect(twoD).not.toContain('PBR materials');
    expect(threeD).toContain('PBR materials');
    expect(threeD).not.toContain('clean confident line art');
  });

  it('recommends category-specific practical LoRAs', () => {
    expect(recommendedStudioLoras('transgender')[0]?.id).toBe('body-transgender-flux');
    expect(recommendedStudioLoras('anime', '2d')[0]?.id).toBe('style-anime-2d-flux');
    expect(recommendedStudioLoras('anime', '3d')[0]?.id).toBe('style-anime-3d-flux');
  });

  it('always exposes a Chinese usage description', () => {
    expect(loraUsageZh({ id: 'pose-test', category: 'action' })).toContain('成人动作');
    expect(loraUsageZh({ id: 'style-anime-3d-flux', category: 'style' })).toContain('3D');
  });
});
