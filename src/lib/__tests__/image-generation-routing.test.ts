import { describe, expect, it } from 'vitest';
import { resolveImageGenerationRoute, UNIFIED_COMFY_ENDPOINT } from '@/lib/image-generation-routing';

describe('unified image generation routing', () => {
  it('routes explicit and transgender realism to FLUX on unified endpoint', () => {
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 3,
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    }).endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });

  it.each([
    ['female', 'feminine woman', 'visible breasts and vulva'],
    ['male', 'masculine man', 'visible penis and testicles'],
    ['transgender', 'transgender woman', 'visible breasts, visible penis'],
  ] as const)('uses FLUX natural-language prompt and parameters for %s NSFW', (category, subjectDesc, anatomyDesc) => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.promptPrefix).toContain(subjectDesc);
    expect(route.promptPrefix).toContain(anatomyDesc);
    expect(route.sampler).toBe('euler');
    expect(route.scheduler).toBe('simple');
    expect(route.cfg).toBe(1);
    expect(route.steps).toBeGreaterThanOrEqual(28);
    expect(route.width).toBeGreaterThanOrEqual(1024);
    expect(route.clipSkip).toBe(1);
    expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
  });

  it('uses natural color and non-mannequin direction for realistic previews', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    });
    expect(route.promptPrefix).toContain('neutral white balance');
    expect(route.promptPrefix).toContain('restrained saturation');
    expect(route.promptPrefix).toContain('relaxed asymmetrical posture');
  });
  it('routes 2D and 3D both to FLUX (only checkpoint available)', () => {
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '3d',
    }).modelFamily).toBe('flux');
    // 2D uses anime-oriented prompt
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
    }).promptPrefix).toContain('anime');
  });

  it.each(['outfit', 'prop', 'advert'] as const)('keeps %s assets on FLUX via unified endpoint', (surface) => {
    const route = resolveImageGenerationRoute({ surface });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });

  it('all routes share the same unified endpoint and FLUX checkpoint', () => {
    const routes = [
      resolveImageGenerationRoute({ surface: 'companion', renderStyle: 'realistic', nsfwIntensity: 1 }),
      resolveImageGenerationRoute({ surface: 'companion', renderStyle: 'realistic', nsfwIntensity: 5 }),
      resolveImageGenerationRoute({ surface: 'companion', renderStyle: '2d' }),
      resolveImageGenerationRoute({ surface: 'outfit' }),
    ];
    for (const route of routes) {
      expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
      expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
      expect(route.sampler).toBe('euler');
      expect(route.scheduler).toBe('simple');
      expect(route.clipSkip).toBe(1);
    }
  });
});
