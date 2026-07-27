import { describe, expect, it } from 'vitest';
import { resolveImageGenerationRoute, UNIFIED_COMFY_ENDPOINT } from '@/lib/image-generation-routing';

describe('unified image generation routing', () => {
  it('routes explicit and transgender realism to Pony on unified endpoint', () => {
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 3,
    }).modelFamily).toBe('pony');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    }).endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });

  it.each([
    ['female', '1girl, solo, female', 'visible vulva'],
    ['male', '1boy, solo, male', 'visible penis'],
    ['transgender', 'transgender female, futanari', 'visible breasts, visible penis'],
  ] as const)('uses Pony-native tags and recommended parameters for %s NSFW', (category, subjectTag, anatomyTag) => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    });
    expect(route.modelFamily).toBe('pony');
    expect(route.promptPrefix).toContain(subjectTag);
    expect(route.promptPrefix).toContain(anatomyTag);
    expect(route.sampler).toBe('dpmpp_2m_sde');
    expect(route.scheduler).toBe('karras');
    expect(route.cfg).toBeGreaterThanOrEqual(6);
    expect(route.steps).toBeGreaterThanOrEqual(36);
    expect(route.width).toBeGreaterThanOrEqual(1024);
    expect(route.clipSkip).toBe(2);
  });

  it('routes 2D to Illustrious and 3D to FLUX', () => {
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
    }).modelFamily).toBe('illustrious');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '3d',
    }).modelFamily).toBe('flux');
  });

  it.each(['outfit', 'prop', 'advert'] as const)('keeps %s assets on FLUX via unified endpoint', (surface) => {
    const route = resolveImageGenerationRoute({ surface });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });

  it('all routes share the same unified endpoint', () => {
    const routes = [
      resolveImageGenerationRoute({ surface: 'companion', renderStyle: 'realistic', nsfwIntensity: 1 }),
      resolveImageGenerationRoute({ surface: 'companion', renderStyle: 'realistic', nsfwIntensity: 5 }),
      resolveImageGenerationRoute({ surface: 'companion', renderStyle: '2d' }),
      resolveImageGenerationRoute({ surface: 'outfit' }),
    ];
    for (const route of routes) {
      expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
    }
  });
});
