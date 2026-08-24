import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveImageGenerationRoute, UNIFIED_COMFY_ENDPOINT } from '@/lib/image-generation-routing';

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  // Deterministic gate state per test; .env.local values must not leak in.
  delete process.env.RUNPOD_SDXL_MODELS_READY;
  delete process.env.RUNPOD_ENDPOINT_ID_SDXL;
  delete process.env.RUNPOD_ENDPOINT_ID_SDXL_PONY;
  delete process.env.RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS;
});
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

function openMatrixGate(): void {
  process.env.RUNPOD_SDXL_MODELS_READY = 'true';
  process.env.RUNPOD_ENDPOINT_ID_SDXL = 'sdxl-endpoint';
}

describe('image generation routing — matrix gate closed (FLUX parity)', () => {
  it('SFW routes use the unified FLUX pipeline when the gate is closed', () => {
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
    }).modelFamily).toBe('flux');
  });

  it('NSFW throws (fail-closed) instead of falling back to FLUX', () => {
    expect(() => resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 3,
    })).toThrow(/NSFW generation requires the SDXL endpoint/);
    expect(() => resolveImageGenerationRoute({
      surface: 'companion',
      category: 'male',
      renderStyle: 'realistic',
      nsfwIntensity: 5,
    })).toThrow(/NSFW generation requires the SDXL endpoint/);
  });

  it.each(['outfit', 'prop', 'advert'] as const)('keeps %s assets on FLUX via unified endpoint', (surface) => {
    const route = resolveImageGenerationRoute({ surface });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });

  it('gives SFW companions FLUX parameters via the unified endpoint', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
    expect(route.checkpoint).toBe('flux1-dev-fp8.safetensors');
    expect(route.sampler).toBe('euler');
    expect(route.scheduler).toBe('simple');
    expect(route.cfg).toBe(1); // FLUX CFG
    expect(route.clipSkip).toBe(1);
    expect(route.fluxGuidance).toBe(3.5);
  });

  it('returns FLUX model details and LoRA policy metadata', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
    });
    expect(route.modelDetails.architecture).toBe('flux-dev');
    expect(route.modelDetails.textEncoder).toBe('t5xxl+clip-l');
    expect(route.loraPolicy.categoryEnv).toContain('FEMALE');
    expect(route.loraPolicy.maxLoras).toBe(3);
    expect(route.loraPolicy.failClosed).toBe(true);
    expect(route.loraPolicy.maxCombinedStrength).toBe(1.65);
  });
});

describe('image generation routing — SDXL matrix gate open', () => {
  it('routes realistic female/male/transgender to the pony flagship', () => {
    openMatrixGate();
    for (const category of ['female', 'male', 'transgender'] as const) {
      const route = resolveImageGenerationRoute({
        surface: 'companion',
        category,
        renderStyle: 'realistic',
        nsfwIntensity: 5,
      });
      expect(route.modelFamily).toBe('pony');
      expect(route.endpointId).toBe('sdxl-endpoint');
      expect(route.checkpoint).toBe('ponyRealism_V22.safetensors');
      expect(route.sampler).toBe('dpmpp_2m_sde');
      expect(route.scheduler).toBe('karras');
      expect(route.cfg).toBeGreaterThan(3);
      expect(route.clipSkip).toBe(2);
      expect(route.steps).toBeGreaterThanOrEqual(30);
      expect(route.modelDetails.architecture).toBe('sdxl');
      expect(route.loraPolicy.categoryEnv).toBe(`RUNPOD_PONY_${category.toUpperCase()}_LORAS`);
      expect(route.loraPolicy.maxLoras).toBe(4);
      expect(route.loraPolicy.failClosed).toBe(true);
    }
  });

  it('routes 2D anime to the Illustrious flagship', () => {
    openMatrixGate();
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
      nsfwIntensity: 4,
    });
    expect(route.modelFamily).toBe('illustrious');
    expect(route.endpointId).toBe('sdxl-endpoint');
    expect(route.checkpoint).toBe('waiMatureIllustrious_v20.safetensors');
    expect(route.clipSkip).toBe(2);
    expect(route.presetId).toBe('sdxl-illustrious-adult');
    expect(route.loraPolicy.categoryEnv).toContain('RUNPOD_ILLUSTRIOUS');
  });

  it('keeps SFW 3D renders and product surfaces on FLUX even with the gate open', () => {
    openMatrixGate();
    expect(resolveImageGenerationRoute({
      surface: 'companion', renderStyle: '3d',
    }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({ surface: 'prop' }).modelFamily).toBe('flux');
    expect(resolveImageGenerationRoute({ surface: 'advert' }).modelFamily).toBe('flux');
  });

  it('forces NSFW premium / 3d / product surfaces onto SDXL with the gate open', () => {
    openMatrixGate();
    expect(resolveImageGenerationRoute({
      surface: 'companion', renderStyle: '3d', nsfwIntensity: 4,
    }).modelFamily).toBe('pony');
    expect(resolveImageGenerationRoute({
      surface: 'prop', nsfwIntensity: 4,
    }).modelFamily).toBe('pony');
  });

  it('NSFW throws when the gate is on but the SDXL endpoint is missing', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    delete process.env.RUNPOD_ENDPOINT_ID_SDXL;
    expect(() => resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 5,
    })).toThrow(/NSFW generation requires the SDXL endpoint/);
    expect(() => resolveImageGenerationRoute({
      surface: 'companion', renderStyle: '2d', nsfwIntensity: 5,
    })).toThrow(/NSFW generation requires the SDXL endpoint/);
  });

  it('fails open to FLUX for SFW when the gate is on but the SDXL endpoint is missing', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    delete process.env.RUNPOD_ENDPOINT_ID_SDXL;
    expect(resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 1,
    }).modelFamily).toBe('flux');
  });

  it('gives transgender renders the wider canvas on the matrix', () => {
    openMatrixGate();
    const route = resolveImageGenerationRoute({
      surface: 'companion', category: 'transgender', renderStyle: 'realistic', nsfwIntensity: 1,
    });
    expect(route.modelFamily).toBe('pony');
    expect(route.width).toBe(896);
    expect(route.height).toBe(1152);
    expect(route.presetId).toBe('sdxl-pony-portrait');
  });

  it('routes each SDXL family to its dedicated endpoint when configured', () => {
    process.env.RUNPOD_SDXL_MODELS_READY = 'true';
    process.env.RUNPOD_ENDPOINT_ID_SDXL_PONY = 'pony-endpoint';
    process.env.RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS = 'illustrious-endpoint';
    const pony = resolveImageGenerationRoute({
      surface: 'companion', category: 'female', renderStyle: 'realistic', nsfwIntensity: 4,
    });
    expect(pony.modelFamily).toBe('pony');
    expect(pony.endpointId).toBe('pony-endpoint');
    const illustrious = resolveImageGenerationRoute({
      surface: 'companion', renderStyle: '2d', nsfwIntensity: 4,
    });
    expect(illustrious.modelFamily).toBe('illustrious');
    expect(illustrious.endpointId).toBe('illustrious-endpoint');
  });
});

describe('image generation routing — client-side gate override', () => {
  it('honors the server-provided gate flag when the client env is closed', () => {
    // Client bundles cannot read server env; the admin API ships the
    // RUNPOD_SDXL_MODELS_READY flag + SDXL endpoint id in its response.
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 3,
      specialistModelsReady: true,
      sdxlEndpointId: 'client-sdxl-endpoint',
    });
    expect(route.modelFamily).toBe('pony');
    expect(route.endpointId).toBe('client-sdxl-endpoint');
    expect(route.checkpoint).toBe('ponyRealism_V22.safetensors');
  });

  it('routes 2D through the client-provided gate as well', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      renderStyle: '2d',
      nsfwIntensity: 4,
      matrixActive: true,
      sdxlEndpointId: 'client-sdxl-endpoint',
    });
    expect(route.modelFamily).toBe('illustrious');
    expect(route.endpointId).toBe('client-sdxl-endpoint');
  });

  it('fails open to FLUX when the override gate is on but no endpoint is supplied', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 1,
      matrixActive: true,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.presetId).toBe('flux-matrix-failopen');
  });

  it('keeps FLUX parity when neither env nor override opens the gate', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 2,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.endpointId).toBe(UNIFIED_COMFY_ENDPOINT);
  });
});
