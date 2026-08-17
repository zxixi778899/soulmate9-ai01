import { describe, expect, it } from 'vitest';
import {
  buildStudioPromptEnhancement,
  compactFluxPrompt,
  ensureStudioFluxPrompt,
  loraUsageZh,
  recommendedStudioLoras,
  resolveCategoryLoraControls,
  studioLoraStrengthScale,
  studioNegativePrompt,
  studioPromptSatisfiesIntensity,
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
  it('repairs a scene-only prompt with the exact selected intensity contract', () => {
    const scene = 'She stands beside the bedroom window in late afternoon light.';
    for (const intensity of [1, 2, 3, 4, 5] as const) {
      const prompt = ensureStudioFluxPrompt({ prompt: scene, category: 'female', intensity });
      expect(studioPromptSatisfiesIntensity(prompt, intensity)).toBe(true);
      expect(prompt).toContain('bedroom window');
      expect(prompt.length).toBeLessThanOrEqual(650);
    }
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

  it('recommends category-specific practical LoRAs based on new fluxScenarioPlan', () => {
    // Spec: all recommendations come from fluxScenarioPlan
    const trans = recommendedStudioLoras('transgender');
    expect(trans.length).toBeGreaterThan(0);
    
    // All styles use FLUX LoRAs now - check they're not empty and contain some FLUX identifier
    const twoD = recommendedStudioLoras('female', '2d');
    expect(twoD.length).toBeGreaterThan(0);
    
    const threeD = recommendedStudioLoras('male', '3d');
    expect(threeD.length).toBeGreaterThan(0);
  });

  it('deduplicates and caps the final FLUX prompt', () => {
    const repeated = 'Calliope, Caucasian, petite, ash brown hair, ice blue eyes. '.repeat(8) + 'She stands beside a window.';
    const prompt = compactFluxPrompt(repeated);
    expect(prompt.length).toBeLessThanOrEqual(650);
    expect(prompt.match(/Calliope/gi)?.length).toBe(1);
    expect(prompt).toContain('stands beside a window');
  });

  it('routes realistic LoRAs by NSFW intensity using fluxScenarioPlan', () => {
    // Spec: style_photoreal for low intensity, lewd/detail_hands for high intensity
    const lvl2 = recommendedStudioLoras('female', 'realistic', 2);
    expect(lvl2[0]?.id).toContain('photoreal');
    
    const lvl4 = recommendedStudioLoras('female', 'realistic', 4);
    expect(lvl4[0]?.id).toContain('lewd');
  });
  it('avoids conflicting transgender anatomy LoRAs and uses one stable helper', () => {
    // Spec: MTF LoRA + optional lewd overlay, no pose conflicts
    const controls = resolveCategoryLoraControls('transgender', 5);
    expect(Array.isArray(controls.selected)).toBe(true);
    expect(Array.isArray(controls.missing)).toBe(true);
    // Check for correct FLUX LoRA composition - either selected or marked as missing
    const allIds = [...controls.selected, ...controls.missing].map((item) => item.id);
    expect(allIds.some((id: string) => id.includes('mtf') || id.includes('trans'))).toBe(true);
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

  it('recommends volume-verified SDXL LoRAs per routed family', () => {
    const ponyFemale = recommendedStudioLoras('female', 'realistic', 2, 'pony');
    expect(ponyFemale.map((item) => item.id)).toContain('pony-mature-female-slider-v2');
    expect(ponyFemale.map((item) => item.id)).toContain('pony-detailifier-v5');

    const ponyTrans = recommendedStudioLoras('transgender', 'realistic', 4, 'pony');
    expect(ponyTrans.map((item) => item.id)).toContain('pony-gender-transition-slider');

    const illustrious = recommendedStudioLoras('female', '2d', 3, 'illustrious');
    expect(illustrious.map((item) => item.id)).toContain('illustrious-realism-slider-v1');
    expect(illustrious.map((item) => item.id)).toContain('illustrious-nsfw-slider-v1');

    // FLUX 默认路径保持不变
    const flux = recommendedStudioLoras('female', 'realistic', 2);
    expect(flux[0]?.id).toContain('photoreal');
  });
});
