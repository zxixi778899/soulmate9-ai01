import { describe, expect, it } from 'vitest';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';

describe('unified image generation routing', () => {
  it('routes explicit and transgender realism to Pony on CD2', () => {
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
    }).endpointEnv).toBe('RUNPOD_ENDPOINT_ID_SDXL');
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

  it.each(['outfit', 'prop', 'advert'] as const)('keeps %s assets on FLUX CD1', (surface) => {
    const route = resolveImageGenerationRoute({ surface });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointEnv).toBe('RUNPOD_ENDPOINT_ID_FLUX');
  });
});
