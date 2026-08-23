import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  animeCheckpoint,
  isSdxlMatrixActive,
  realisticCheckpoint,
  resolveModelPlan,
} from '@/lib/model-matrix';

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  delete process.env.RUNPOD_SDXL_MODELS_READY;
  delete process.env.RUNPOD_ENDPOINT_ID_SDXL;
});
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

function openGate(): void {
  process.env.RUNPOD_SDXL_MODELS_READY = 'true';
  process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
}

describe('model matrix gate', () => {
  it('is inactive unless both the flag and the endpoint are present', () => {
    expect(isSdxlMatrixActive()).toBe(false);
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    expect(isSdxlMatrixActive()).toBe(false);
    openGate();
    expect(isSdxlMatrixActive()).toBe(true);
  });

  it('returns FLUX plans for every scenario while the gate is closed', () => {
    for (const renderStyle of ['realistic', '2d', '3d'] as const) {
      for (const nsfwLevel of [1, 5] as const) {
        const plan = resolveModelPlan({ surface: 'companion', renderStyle, nsfwLevel });
        expect(plan.endpointKey).toBe('runpod-flux');
        expect(plan.modelFamily).toBe('flux');
        expect(plan.cfg).toBe(1);
        expect(plan.clipSkip).toBe(1);
      }
    }
  });

  it('fails open to FLUX when the gate is on but the endpoint is unset', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    const plan = resolveModelPlan({ surface: 'companion', renderStyle: 'realistic', nsfwLevel: 5 });
    expect(plan.endpointKey).toBe('runpod-flux');
  });
});

describe('model matrix — realistic (pony family)', () => {
  it.each(['female', 'male', 'transgender'] as const)('routes %s to ponyRealism on the SDXL endpoint', (category) => {
    openGate();
    const plan = resolveModelPlan({ surface: 'companion', category, renderStyle: 'realistic', nsfwLevel: 1 });
    expect(plan.endpointKey).toBe('runpod-sdxl-pro');
    expect(plan.modelFamily).toBe('pony');
    expect(plan.checkpoint).toBe(realisticCheckpoint());
    expect(plan.sampler).toBe('dpmpp_2m_sde');
    expect(plan.scheduler).toBe('karras');
    expect(plan.clipSkip).toBe(2);
    expect(plan.steps).toBe(26);
    expect(plan.cfg).toBe(6.0);
    expect(plan.loras).toContain('pony_detailifier_v5.safetensors');
  });

  it('raises steps and cfg for NSFW realism', () => {
    openGate();
    const plan = resolveModelPlan({ surface: 'companion', category: 'female', nsfwLevel: 5 });
    expect(plan.steps).toBe(30);
    expect(plan.cfg).toBe(6.5);
  });

  it('adds the gender slider for male and the futa slider for transgender', () => {
    openGate();
    const male = resolveModelPlan({ surface: 'companion', category: 'male' });
    expect(male.loras).toContain('pony_gender_transition_slider.safetensors');
    const trans = resolveModelPlan({ surface: 'companion', category: 'transgender' });
    expect(trans.loras).toContain('pony_futa_style.safetensors');
    expect(trans.width).toBe(896);
    expect(trans.height).toBe(1152);
  });

  it('adds two steps for complex adult scenes', () => {
    openGate();
    const plan = resolveModelPlan({ surface: 'companion', category: 'female', nsfwLevel: 4, sceneComplex: true });
    expect(plan.steps).toBe(32);
  });

  it('routes outfit surfaces through the realistic flagship too', () => {
    openGate();
    const plan = resolveModelPlan({ surface: 'outfit', category: 'female' });
    expect(plan.endpointKey).toBe('runpod-sdxl-pro');
    expect(plan.modelFamily).toBe('pony');
  });
});

describe('model matrix — anime (illustrious family)', () => {
  it('routes 2d renders to the Illustrious flagship', () => {
    openGate();
    const plan = resolveModelPlan({ surface: 'companion', renderStyle: '2d', nsfwLevel: 1 });
    expect(plan.endpointKey).toBe('runpod-sdxl-pro');
    expect(plan.modelFamily).toBe('illustrious');
    expect(plan.checkpoint).toBe(animeCheckpoint());
    expect(plan.steps).toBe(26);
    expect(plan.cfg).toBe(5.5);
    expect(plan.loras).toEqual(['AddMicroDetails_Illustrious_v6.safetensors']);
  });

  it('adds the NSFW slider for explicit anime', () => {
    openGate();
    const plan = resolveModelPlan({ surface: 'companion', renderStyle: '2d', nsfwLevel: 4 });
    expect(plan.steps).toBe(28);
    expect(plan.loras).toContain('illustrious_nsfw_slider_v1.safetensors');
  });

  it('maps the anime companion category onto the female realistic lane', () => {
    openGate();
    const plan = resolveModelPlan({ surface: 'companion', category: 'anime', renderStyle: 'realistic' });
    expect(plan.modelFamily).toBe('pony');
    expect(plan.loras).toContain('pony_mature_female_slider_v2.safetensors');
  });
});

describe('model matrix — FLUX retained lanes (SFW only)', () => {
  it('keeps premium tier, 3d and product surfaces on FLUX when SFW', () => {
    openGate();
    expect(resolveModelPlan({ surface: 'companion', tier: 'premium' }).endpointKey).toBe('runpod-flux');
    expect(resolveModelPlan({ surface: 'companion', renderStyle: '3d' }).endpointKey).toBe('runpod-flux');
    expect(resolveModelPlan({ surface: 'prop' }).endpointKey).toBe('runpod-flux');
    expect(resolveModelPlan({ surface: 'advert' }).endpointKey).toBe('runpod-flux');
  });

  it('honours checkpoint env overrides', () => {
    openGate();
    process.env.RUNPOD_PONY_CHECKPOINT = 'custom-realism.safetensors';
    process.env.RUNPOD_ILLUSTRIOUS_CHECKPOINT = 'custom-anime.safetensors';
    expect(resolveModelPlan({ surface: 'companion' }).checkpoint).toBe('custom-realism.safetensors');
    expect(resolveModelPlan({ surface: 'companion', renderStyle: '2d' }).checkpoint).toBe('custom-anime.safetensors');
  });
});

describe('model matrix — NSFW hard-routed to SDXL', () => {
  it('forces premium / 3d / product surfaces onto SDXL when NSFW', () => {
    openGate();
    expect(resolveModelPlan({ surface: 'companion', tier: 'premium', nsfwLevel: 4 }).endpointKey).toBe('runpod-sdxl-pro');
    expect(resolveModelPlan({ surface: 'companion', renderStyle: '3d', nsfwLevel: 5 }).modelFamily).toBe('pony');
    expect(resolveModelPlan({ surface: 'prop', nsfwLevel: 4 }).endpointKey).toBe('runpod-sdxl-pro');
  });

  it('routes NSFW 2d to Illustrious and NSFW realistic to pony', () => {
    openGate();
    expect(resolveModelPlan({ surface: 'companion', renderStyle: '2d', nsfwLevel: 3 }).modelFamily).toBe('illustrious');
    expect(resolveModelPlan({ surface: 'companion', renderStyle: 'realistic', nsfwLevel: 3 }).modelFamily).toBe('pony');
  });

  it('still fails open to FLUX for NSFW while the gate is closed', () => {
    // 总闸关闭时 resolveModelPlan 不负责 fail-closed，由
    // resolveImageGenerationRoute 在 NSFW 分支抛错拦截。
    expect(resolveModelPlan({ surface: 'companion', nsfwLevel: 5 }).endpointKey).toBe('runpod-flux');
  });
});
