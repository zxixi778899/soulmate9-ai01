import { afterEach, describe, expect, it } from 'vitest';
import { resolveImageGenerationRoute, UNIFIED_COMFY_ENDPOINT } from '@/lib/image-generation-routing';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe('model-aware image generation routing', () => {
  it('all routes use unified FLUX pipeline regardless of environment flags', () => {
    // Spec: 单底模策略 — all scenarios on flux1-dev-fp8
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 3,
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'male',
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    }).modelFamily).toBe('flux');
    // Even when SDXL endpoint is configured, we stay on FLUX
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    }).modelFamily).toBe('flux');
  });

  it.each(['female', 'male', 'transgender'] as const)('routes %s high NSFW to FLUX with correct parameters', (category) => {
    // Spec: 所有场景统一 flux1-dev-fp8，不分 Pony/Illustrious
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
    expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
    expect(route.sampler).toBe('euler');
    expect(route.scheduler).toBe('simple');
    expect(route.cfg).toBe(1); // FLUX CFG
    expect(route.steps).toBeGreaterThanOrEqual(28); // NSFW gets 28+
    expect(route.clipSkip).toBe(1);
    expect(route.fluxGuidance).toBe(4.0); // FLUX guidance for NSFW
  });

  it('keeps 2D / 3D on FLUX with higher steps for stylized anatomy', () => {
    // Spec: 二次元和 3D 渲染都统一走 FLUX
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '3d',
    }).modelFamily).toBe('flux');
  });

  it('routes all realistic NSFW through FLUX pipeline even when SDXL flag exists', () => {
    // Spec: pony/illustrious 分支已删除，全站统一 FLUX
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 5,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
    expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
    expect(route.steps).toBeGreaterThanOrEqual(28);
    expect(route.cfg).toBe(1);
    expect(route.fluxGuidance).toBe(4.0);
  });

  it('routes NSFW level 3 through FLUX with appropriate guidance', () => {
    // Spec: 取消 SDXL 分支，level 3 也走 FLUX
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 3,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
    expect(route.sampler).toBe('euler');
    expect(route.scheduler).toBe('simple');
    expect(route.fluxGuidance).toBe(4.0);
  });

  it('routes 2D and 3D styles through FLUX with anime LoRA', () => {
    // Spec: 2D/3D 不再使用 Illustrious，统一走 FLUX + rdanimeflux/3d render LoRA
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    const route = resolveImageGenerationRoute({ 
      surface: 'companion', 
      renderStyle: '2d', 
      nsfwIntensity: 4 
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
    expect(route.scheduler).toBe('simple');
    expect(route.steps).toBeGreaterThanOrEqual(26); // 2D gets 26-28 steps
  });

  it.each(['outfit', 'prop', 'advert'] as const)('keeps %s assets on FLUX via unified endpoint', (surface) => {
    const route = resolveImageGenerationRoute({ surface });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });

  it('routes SFW NSFW3+ through FLUX dev-fp8 with full steps', () => {
    // Spec: Unchained 只保留兼容代码，不再被路由选中
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
    // Unified FLUX strategy: never use Unchained
    expect(nsfw.checkpoint).toBe('flux1-dev-fp8.safetensors');
    expect(nsfw.steps).toBeGreaterThanOrEqual(28); // NSFW gets full steps
  });

  it('keeps all routes on unified FLUX endpoint', () => {
    // Spec: 单端点策略 — ALL requests go to wozrrlcdipyl3p
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
    // Even with SDXL env vars, we stay on FLUX
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
    expect(resolveImageGenerationRoute({ surface: 'companion', renderStyle: 'realistic', nsfwIntensity: 5 }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({ surface: 'companion', renderStyle: '2d' }).modelFamily).toBe('flux');
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

  it('describes FLUX model details consistently across all scenarios', () => {
    // Spec: 所有场景的 modelDetails 统一为 flux-dev architecture
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    });
    expect(route.modelDetails.architecture).toBe('flux-dev');
    expect(route.modelDetails.textEncoder).toBe('t5xxl+clip-l');
    expect(route.loraPolicy.categoryEnv).toContain('FEMALE');
    expect(route.loraPolicy.maxLoras).toBe(3);
    expect(route.loraPolicy.failClosed).toBe(true);
    expect(route.loraPolicy.maxCombinedStrength).toBe(1.65); // FLUX-specific budget
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
