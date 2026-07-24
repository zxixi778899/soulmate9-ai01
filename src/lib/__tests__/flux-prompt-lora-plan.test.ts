import { describe, expect, it } from 'vitest';
import {
  GIRLFRIEND_SCENE_RECIPES,
  NSFW_AMPLIFIER,
  assembleGirlfriendPrompt,
  buildLoraPlan,
  pickScenePoseAndOutfit,
  type GirlfriendSubject,
} from '@/lib/prompt/girlfriend';

const subject: GirlfriendSubject = {
  name: 'Alex',
  age: 28,
  hair: 'long wavy hair',
  hairColor: 'black',
  eyes: 'green',
  body: 'athletic',
  personality: 'confident and affectionate',
};

describe('FLUX prompt composition', () => {
  it('uses natural-language quality guidance instead of SD quality tags', () => {
    const result = assembleGirlfriendPrompt(
      { rawPrompt: 'relaxing beside a bright apartment window and looking into the camera' },
      subject,
      { gender: 'female', adult: false, sceneId: 'window_sunlight' },
    );

    expect(result.positive).toContain('Render this as a polished editorial beauty photograph');
    expect(result.positive).not.toMatch(/\b(masterpiece|8k|raw photo|best quality)\b/i);
  });

  it('keeps the adult amplifier concise and scene-descriptive', () => {
    const words = NSFW_AMPLIFIER.female.split(/\s+/);
    expect(words.length).toBeLessThan(40);
    expect(NSFW_AMPLIFIER.female).toContain('consenting adult scene');
  });

  it('never selects provocative global pose or outfit pools for SFW scenes', () => {
    for (const scene of GIRLFRIEND_SCENE_RECIPES) {
      const picked = pickScenePoseAndOutfit(subject, scene, 'female', false);
      expect(scene.poses).toContain(picked.pose);
      expect(scene.outfits).toContain(picked.outfit);
    }
  });
});

describe('content-aware LoRA plan', () => {
  it('selects an outfit LoRA before generic body/detail LoRAs', () => {
    const plan = buildLoraPlan(subject, 'pink_bedroom', {
      adult: true,
      content: 'wearing black lace lingerie in an intimate bedroom portrait',
    });

    expect(plan.secondary?.note).toBe('outfit-lingerie');
    expect(plan.secondary?.name).toContain('outfit_lingerie');
  });

  it('selects a dynamic pose LoRA and raises strength for demanding poses', () => {
    const dynamic = buildLoraPlan(subject, 'pink_bedroom', {
      adult: true,
      content: 'a dynamic crawling pose while arching toward the camera',
    });
    const relaxed = buildLoraPlan(subject, 'pink_bedroom', {
      adult: true,
      preferNsfwPose: true,
      content: 'a relaxed intimate pose',
    });

    expect(dynamic.secondary?.note).toBe('pose-adult-dynamic');
    expect(dynamic.secondary?.strength_model).toBeGreaterThan(
      relaxed.secondary?.strength_model || 0,
    );
  });

  it('uses different style strength for adult and portrait contexts', () => {
    const adult = buildLoraPlan(subject, 'pink_bedroom', {
      adult: true,
      content: 'erotic bedroom scene',
    });
    const portrait = buildLoraPlan(subject, 'studio_clean', {
      adult: false,
      content: 'clean close-up portrait selfie',
    });

    expect(adult.primary.strength_model).not.toBe(portrait.primary.strength_model);
  });
});
