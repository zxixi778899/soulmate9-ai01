import { describe, expect, it } from 'vitest';
import {
  buildStudioPromptEnhancement,
  loraUsageZh,
  recommendedStudioLoras,
  resolveCategoryLoraControls,
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
    expect(prompt).toContain('large penis');
    expect(prompt).toContain('visible semen');
    expect(studioNegativePrompt('transgender')).toContain('duplicated genitals');
  });

  it('uses distinct adult anatomy for female and male profiles', () => {
    const female = buildStudioPromptEnhancement({ category: 'female', intensity: 5 });
    const male = buildStudioPromptEnhancement({ category: 'male', intensity: 5 });
    expect(female).toContain('vulva clearly visible');
    expect(female).not.toContain('large penis');
    expect(male).toContain('large penis');
    expect(male).toContain('testicles');
    expect(male).not.toContain('vaginal opening');
  });
  it('makes all five intensity levels materially different', () => {
    const prompts = ([1, 2, 3, 4, 5] as const).map((intensity) =>
      buildStudioPromptEnhancement({ category: 'female', intensity }),
    );
    expect(new Set(prompts).size).toBe(5);
    expect(prompts[0]).toContain('fully clothed');
    expect(prompts[1]).toContain('keeping her vulva covered');
    expect(prompts[2]).toContain('fully nude');
    expect(prompts[3]).toContain('before climax');
    expect(prompts[4]).toContain('to climax');
    expect(studioLoraStrengthScale(5)).toBeGreaterThan(studioLoraStrengthScale(1));
  });
  it('shows category-specific genitals from level 3 onward', () => {
    const level2 = {
      female: buildStudioPromptEnhancement({ category: 'female', intensity: 2 }),
      male: buildStudioPromptEnhancement({ category: 'male', intensity: 2 }),
      transgender: buildStudioPromptEnhancement({ category: 'transgender', intensity: 2 }),
    };
    const level3 = {
      female: buildStudioPromptEnhancement({ category: 'female', intensity: 3 }),
      male: buildStudioPromptEnhancement({ category: 'male', intensity: 3 }),
      transgender: buildStudioPromptEnhancement({ category: 'transgender', intensity: 3 }),
    };
    expect(level2.female).toContain('vulva covered');
    expect(level2.male).toContain('penis covered');
    expect(level2.transgender).toContain('penis covered');
    expect(level3.female).toContain('vulva clearly visible');
    expect(level3.male).toContain('penis, and testicles clearly visible');
    expect(level3.transgender).toContain('developed breasts, feminine curves, a large penis, and testicles clearly visible');
  });

  it('keeps 2D and 3D anime directions mutually distinct', () => {
    const twoD = buildStudioPromptEnhancement({
      category: 'female',
      intensity: 5,
      animeStyle: '2d',
    });
    const threeD = buildStudioPromptEnhancement({
      category: 'female',
      intensity: 5,
      animeStyle: '3d',
    });
    expect(twoD).toContain('clean line art');
    expect(twoD).not.toContain('PBR materials');
    expect(threeD).toContain('PBR materials');
    expect(threeD).not.toContain('clean line art');
  });

  it('recommends category-specific practical LoRAs', () => {
    expect(recommendedStudioLoras('transgender')).toEqual([
      expect.objectContaining({ id: 'detail-skin', strength: 0.28 }),
    ]);
    expect(recommendedStudioLoras('female', '2d').map((item) => item.id)).toContain('style-anime-2d-flux');
    expect(recommendedStudioLoras('male', '3d').map((item) => item.id)).toContain('style-anime-3d-flux');
    expect(recommendedStudioLoras('transgender', '2d').map((item) => item.id)).toEqual(['style-anime-2d-flux']);
  });

  it('avoids conflicting transgender anatomy LoRAs and uses one stable helper', () => {
    const controls = resolveCategoryLoraControls('transgender', 5);
    expect(controls.selected.map((item) => item.id)).toEqual([]);
    expect(controls.missing.map((item) => item.id)).toContain('detail-skin');
    expect(controls.selected.some((item) => item.id === 'body-curvy-flux')).toBe(false);
    expect(controls.selected.some((item) => item.id.includes('transgender'))).toBe(false);
  });

  it('forces explicit transgender levels to include chest and pelvis in one frame', () => {
    const prompt = buildStudioPromptEnhancement({ category: 'transgender', intensity: 4 });
    expect(prompt).toContain('torso and pelvis in frame');
    expect(prompt).toContain('weight naturally through one hip');
    expect(prompt).not.toContain('frontal full-body');
    expect(studioNegativePrompt('transgender')).toContain('cropped pelvis');
  });

  it('always exposes a Chinese usage description', () => {
    expect(loraUsageZh({ id: 'pose-test', category: 'action' })).toContain('成人动作');
    expect(loraUsageZh({ id: 'style-anime-3d-flux', category: 'style' })).toContain('3D');
  });
});
