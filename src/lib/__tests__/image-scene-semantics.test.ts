import { describe, expect, it } from 'vitest';
import { classifyImageScene, normalizeLlmImageScene } from '@/lib/image-scene-semantics';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';

describe('image scene semantics', () => {
  it('recognizes Chinese relationship and power-role vocabulary', () => {
    expect(classifyImageScene('男男，男攻，男主在客厅')).toMatchObject({
      pairing: 'male_male',
      protagonist: 'male',
      powerDynamic: 'male_dominant',
    });
    expect(classifyImageScene('跨性别伪娘 SM 场景', 'transgender')).toMatchObject({
      protagonist: 'femboy',
      powerDynamic: 'sm',
    });
    expect(classifyImageScene('女女，女主')).toMatchObject({
      pairing: 'female_female',
      protagonist: 'female',
    });
  });

  it('validates LLM classifications against the supported enum', () => {
    const fallback = classifyImageScene('男受');
    expect(normalizeLlmImageScene({
      pairing: 'male_male',
      protagonist: 'not-valid',
      power_dynamic: 'male_submissive',
      tags: ['男受'],
    }, fallback)).toMatchObject({
      pairing: 'male_male',
      protagonist: fallback.protagonist,
      powerDynamic: 'male_submissive',
      source: 'llm',
    });
  });

  it('selects a higher-control SDXL preset for complex adult compositions', () => {
    // NSFW 硬路由 SDXL（禁止落 FLUX）：复杂成人场景在 pony 计划上 +2 步增强控制
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'male',
      renderStyle: 'realistic',
      nsfwIntensity: 4, // NSFW scene with SM and group dynamics requires high control
      sceneText: '4i SM with four consenting adults',
      sdxlEndpointId: 'test-sdxl-endpoint',
    });
    expect(route).toMatchObject({
      modelFamily: 'pony',
      presetId: 'sdxl-pony-adult',
      sampler: 'dpmpp_2m_sde',
      steps: 32,
      width: 832,
      height: 1216,
    });
  });
});
