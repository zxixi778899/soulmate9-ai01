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

  it.each(['female', 'male', 'transgender'] as const)('uses FLUX parameters for %s NSFW without a second prompt prefix', (category) => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route).not.toHaveProperty('promptPrefix');
    expect(route.sampler).toBe('euler');
    expect(route.scheduler).toBe('simple');
    expect(route.cfg).toBe(1);
    expect(route.steps).toBeGreaterThanOrEqual(26);
    expect(route.width).toBe(768);
    expect(route.height).toBe(1152);
    expect(route.clipSkip).toBe(1);
    expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
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
