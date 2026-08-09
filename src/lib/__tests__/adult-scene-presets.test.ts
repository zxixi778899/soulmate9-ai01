import { describe, expect, it } from 'vitest';
import {
  ADULT_SCENE_PRESETS,
  adultModelPromptSuffix,
  selectAdultScenePreset,
} from '@/lib/comfy-console/adult-scene-presets';

describe('adult scene presets', () => {
  it.each([3, 4, 5] as const)('provides exactly 20 unique presets for NSFW %s', (level) => {
    const presets = ADULT_SCENE_PRESETS[level];
    expect(presets).toHaveLength(20);
    expect(new Set(presets.map((preset) => preset.id))).toHaveLength(20);
    expect(new Set(presets.map((preset) => preset.scene))).toHaveLength(20);
    expect(presets.every((preset) => preset.level === level)).toBe(true);
  });

  it('selects only from the requested level', () => {
    expect(selectAdultScenePreset(2, () => 0)).toBeNull();
    expect(selectAdultScenePreset(3, () => 0)?.id).toBe(ADULT_SCENE_PRESETS[3][0].id);
    expect(selectAdultScenePreset(4, () => 0.999)?.id).toBe(ADULT_SCENE_PRESETS[4][19].id);
    expect(selectAdultScenePreset(5, () => 0.5)?.level).toBe(5);
  });

  it('keeps model-family prompt dialects separate', () => {
    expect(adultModelPromptSuffix('pony')).toContain('score_9');
    expect(adultModelPromptSuffix('illustrious')).toContain('masterpiece');
    expect(adultModelPromptSuffix('flux')).toContain('FLUX natural-language');
  });
});
