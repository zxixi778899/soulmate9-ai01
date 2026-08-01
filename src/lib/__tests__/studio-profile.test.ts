import { describe, expect, it } from 'vitest';
import {
  buildStudioPromptEnhancement,
  compactFluxPrompt,
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
    expect(female.length).toBeLessThan(750);
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
    expect(prompts[0]).toContain('everyday sexy outfit');
    expect(prompts[1]).toContain('sensual lingerie');
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
    expect(level2.female).toContain('genitals remain covered');
    expect(level2.male).toContain('genitals remain covered');
    expect(level2.transgender).toContain('genitals remain covered');
    expect(level3.female).toContain('vulva clearly visible');
    expect(level3.male).toContain('penis, and testicles clearly visible');
    expect(level3.transgender).toContain('developed breasts, feminine curves, a large penis, and testicles clearly visible');
  });

  it('preserves a long custom scene direction and keeps action before context', () => {
    const scene = 'A distinctive penthouse dressing room where she crosses the rug, opens the walnut wardrobe, chooses a red silk robe, turns toward the rain-streaked window, and meets the camera with a private smile while warm lamps reveal books, perfume bottles, travel photographs, naturally rumpled fabric, a half-open suitcase, fresh flowers, and a handwritten note beside a small jewelry box.';
    const prompt = buildStudioPromptEnhancement({ category: 'female', intensity: 2, scene });
    expect(scene.length).toBeGreaterThan(320);
    expect(prompt).toContain(scene);
    expect(prompt.indexOf('sensual lingerie')).toBeLessThan(prompt.indexOf(scene));
    expect(prompt.length).toBeLessThan(950);
    expect(prompt).not.toContain('modern sofa');
  });

  it('constrains realistic output to natural color and candid body language', () => {
    const prompt = buildStudioPromptEnhancement({ category: 'female', intensity: 1 });
    const negative = studioNegativePrompt('female');
    expect(prompt).toContain('neutral skin tone');
    expect(prompt).toContain('practical soft light');
    expect(prompt).toContain('relaxed posture');
    expect(prompt).toContain('natural hands');
    expect(negative).toContain('plastic skin');
    expect(negative).toContain('rigid pose');
    expect(negative.length).toBeLessThan(400);
    expect(negative).not.toContain('youthful face');
    expect(negative).toContain('underage');
    expect(negative.length).toBeLessThan(400);
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
      expect.objectContaining({ id: 'flux-detail-skin-v1', strength: 0.2 }),
    ]);
    expect(recommendedStudioLoras('female', '2d').map((item) => item.id)).toContain('illustrious-micro-details-v6');
    expect(recommendedStudioLoras('male', '3d')).toEqual([]);
    expect(recommendedStudioLoras('transgender', '2d').map((item) => item.id)).toEqual(['illustrious-micro-details-v6']);
  });

  it('deduplicates and caps the final FLUX prompt', () => {
    const repeated = 'Calliope, Caucasian, petite, ash brown hair, ice blue eyes. '.repeat(8) + 'She stands beside a window.';
    const prompt = compactFluxPrompt(repeated);
    expect(prompt.length).toBeLessThanOrEqual(650);
    expect(prompt.match(/Calliope/gi)?.length).toBe(1);
    expect(prompt).toContain('stands beside a window');
  });

  it('routes realistic LoRAs by NSFW intensity', () => {
    expect(recommendedStudioLoras('female', 'realistic', 2)[0]?.id).toBe('flux-outfit-lingerie-v1');
    expect(recommendedStudioLoras('female', 'realistic', 4)[0]?.id).toBe('flux-pose-nsfw-dynamic-v1');
    expect(recommendedStudioLoras('female', 'realistic', 5)[0]?.strength)
      .toBeGreaterThan(recommendedStudioLoras('female', 'realistic', 4)[0]?.strength || 0);
  });
  it('avoids conflicting transgender anatomy LoRAs and uses one stable helper', () => {
    const controls = resolveCategoryLoraControls('transgender', 5);
    expect(controls.selected.map((item) => item.id)).toEqual([]);
    expect(controls.missing.map((item) => item.id)).toContain('flux-pose-nsfw-dynamic-v1');
    expect(controls.selected.some((item) => item.id === 'body-curvy-flux')).toBe(false);
    expect(controls.selected.some((item) => item.id.includes('transgender'))).toBe(false);
  });

  it('forces explicit transgender levels to include chest and pelvis in one frame', () => {
    const prompt = buildStudioPromptEnhancement({ category: 'transgender', intensity: 4 });
    expect(prompt).toContain('pelvis and contact points visible');
    expect(prompt).toContain('physically stable pose');
    expect(prompt).not.toContain('frontal full-body');
    expect(studioNegativePrompt('transgender')).toContain('duplicated genitals');
  });

  it('always exposes a Chinese usage description', () => {
    expect(loraUsageZh({ id: 'pose-test', category: 'action' })).toContain('成人动作');
    expect(loraUsageZh({ id: 'style-anime-3d-flux', category: 'style' })).toContain('3D');
  });
});
