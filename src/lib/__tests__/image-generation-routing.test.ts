import { afterEach, describe, expect, it } from 'vitest';
import { resolveImageGenerationRoute, UNIFIED_COMFY_ENDPOINT } from '@/lib/image-generation-routing';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe('model-aware image generation routing', () => {
  it('keeps specialist models disabled until their runtime inventory is marked ready', () => {
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
    }).modelFamily).toBe('flux');
  });

  it.each(['female', 'male', 'transgender'] as const)('uses Pony specialist parameters for %s high NSFW', (category) => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    });
    expect(route.modelFamily).toBe('pony');
    expect(route).not.toHaveProperty('promptPrefix');
    expect(route.sampler).toBe('dpmpp_2m_sde');
    expect(route.scheduler).toBe('karras');
    expect(route.cfg).toBe(6);
    expect(route.steps).toBeGreaterThanOrEqual(28);
    expect(route.clipSkip).toBe(2);
    expect(route.checkpoint).toBe('ponyRealism_V22.safetensors');
  });

  it('keeps 2D and 3D on FLUX while the specialist volume is unverified', () => {
    delete process.env.RUNPOD_ENDPOINT_ID_SDXL;
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '3d',
    }).modelFamily).toBe('flux');
  });

  it('uses Pony for realistic NSFW when the specialist endpoint is configured', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 5,
    });
    expect(route.modelFamily).toBe('pony');
    expect(route.endpointId).toBe('sdxl-endpoint');
    expect(route.checkpoint).toBe('ponyRealism_V22.safetensors');
    expect(route.steps).toBeGreaterThanOrEqual(28);
    expect(route.cfg).toBe(6);
    expect(route.clipSkip).toBe(2);
  });

  it('routes NSFW level 3 to Pony when specialist inventory is ready', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 3,
    });
    expect(route.modelFamily).toBe('pony');
    expect(route.checkpoint).toBe('ponyRealism_V22.safetensors');
    expect(route.sampler).toBe('dpmpp_2m_sde');
    expect(route.scheduler).toBe('karras');
  });

  it('uses Illustrious for 2D when the specialist endpoint is configured', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({ surface: 'companion', renderStyle: '2d', nsfwIntensity: 4 });
    expect(route.modelFamily).toBe('illustrious');
    expect(route.checkpoint).toBe('waiMatureIllustrious_v20.safetensors');
    expect(route.scheduler).toBe('karras');
  });

  it.each(['outfit', 'prop', 'advert'] as const)('keeps %s assets on FLUX via unified endpoint', (surface) => {
    const route = resolveImageGenerationRoute({ surface });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });

  it('uses dev-fp8 for SFW and Unchained for moderate NSFW', () => {
    const sfw = resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    });
    expect(sfw.checkpoint).toBe('flux1-dev-fp8.safetensors');
    expect(sfw.steps).toBe(24);

    const nsfw = resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: 'realistic',
      nsfwIntensity: 3,
    });
    expect(nsfw.checkpoint).toBe('fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors');
    expect(nsfw.steps).toBe(8);
  });

  it('keeps FLUX routes on the unified endpoint and sends specialist routes to SDXL', () => {
    const routes = [
      resolveImageGenerationRoute({ surface: 'companion', renderStyle: 'realistic', nsfwIntensity: 1 }),
      resolveImageGenerationRoute({ surface: 'outfit' }),
    ];
    for (const route of routes) {
      expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
      expect(route.sampler).toBe('euler');
      expect(route.scheduler).toBe('simple');
      expect(route.clipSkip).toBe(1);
    }
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    expect(resolveImageGenerationRoute({ surface: 'companion', renderStyle: 'realistic', nsfwIntensity: 5 }).modelFamily).toBe('pony');
    expect(resolveImageGenerationRoute({ surface: 'companion', renderStyle: '2d' }).modelFamily).toBe('illustrious');
  });

  it.each([
    ['female', 'realistic'],
    ['male', 'realistic'],
    ['transgender', 'realistic'],
    ['female', '3d'],
  ] as const)('returns complete model and LoRA metadata for %s/%s', (category, renderStyle) => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle,
      nsfwIntensity: 1,
    });
    expect(route.modelDetails.architecture).toBe('flux-dev');
    expect(route.modelDetails.textEncoder).toBe('t5xxl+clip-l');
    expect(route.loraPolicy.categoryEnv).toContain(category.toUpperCase());
    expect(route.loraPolicy.maxLoras).toBe(3);
    expect(route.loraPolicy.failClosed).toBe(true);
  });

  it('describes the specialist Anime/2D model and LoRA inventory', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'anime',
      renderStyle: '2d',
      nsfwIntensity: 5,
    });
    expect(route.modelDetails.architecture).toBe('sdxl-illustrious');
    expect(route.modelDetails.precision).toBe('fp16');
    expect(route.loraPolicy.inventoryEnv).toContain('RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS');
    expect(route.loraPolicy.styleEnv).toBe('RUNPOD_ILLUSTRIOUS_2D_LORAS');
    expect(route.loraPolicy.maxLoras).toBe(2);
  });

  it('falls back to FLUX when the declared specialist checkpoint is absent', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    process.env.RUNPOD_SDXL_CHECKPOINTS = 'some-other-model.safetensors';
    expect(resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 5,
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion', category: 'anime', renderStyle: '2d', nsfwIntensity: 5,
    }).modelFamily).toBe('flux');
  });
});
