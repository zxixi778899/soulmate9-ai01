import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFluxWorkflow } from '../runpod';
import { applyFluxNaturalLook } from '../prompt/flux-natural';
import { ensureStudioFluxPrompt, studioPromptSatisfiesIntensity } from '../comfy-console/studio-profile';
import { assembleGirlfriendFromRow } from '../prompt/girlfriend';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.RUNPOD_INSTALLED_LORAS = [
    'flux_style_photoreal_v1.safetensors',
    'flux_body_curvy_v1.safetensors',
    'Anet_Valence_futanari_FLUX-000004.safetensors',
    'realistic-mtf-trans.safetensors',
  ].join(',');
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});
describe('buildFluxWorkflow LoRA stacking', () => {
  it('chains multiple LoRA loaders and samples from the final loader', () => {
    const graph = buildFluxWorkflow({
      prompt: 'adult woman, natural pose, window light, sharp focus',
      ckpt_loader: 'checkpoint',
      loras: [
        { name: 'flux_style_photoreal_v1.safetensors', strength_model: 0.5 },
        { name: 'flux_body_curvy_v1.safetensors', strength_model: 0.65 },
      ],
      batch_size: 4,
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['14'].class_type).toBe('LoraLoader');
    expect(graph['15'].class_type).toBe('LoraLoader');
    expect(graph['15'].inputs.model).toEqual(['14', 0]);
    expect(graph['15'].inputs.clip).toEqual(['14', 1]);
    expect(graph['5'].inputs.model).toEqual(['15', 0]);
    expect(graph['2'].inputs.clip).toEqual(['15', 1]);
    expect(graph['4'].inputs.batch_size).toBe(4);
  });

  it('connects transgender LoRAs to both CLIP and the sampled model', () => {
    const graph = buildFluxWorkflow({
      prompt: 'MtF trans. An adult transgender woman in a relaxed three-quarter pose.',
      ckpt_loader: 'checkpoint',
      loras: [
        { name: 'Anet_Valence_futanari_FLUX-000004.safetensors', strength_model: 0.8, strength_clip: 0.55 },
        { name: 'realistic-mtf-trans.safetensors', strength_model: 0.58, strength_clip: 0.45 },
      ],
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['14'].inputs.lora_name).toBe('Anet_Valence_futanari_FLUX-000004.safetensors');
    expect(graph['15'].inputs.lora_name).toBe('realistic-mtf-trans.safetensors');
    expect(graph['5'].inputs.model).toEqual(['15', 0]);
    expect(graph['2'].inputs.clip).toEqual(['15', 1]);
  });

  it('forces CFG 1 for FLUX even when a stale caller requests higher guidance', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult woman in neutral daylight, sharp eyes, natural skin.',
      model_family: 'flux',
      guidance: 3.5,
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['5'].inputs.cfg).toBe(1);
    expect(graph['21'].class_type).toBe('FluxGuidance');
    expect(graph['21'].inputs.conditioning).toEqual(['2', 0]);
    expect(graph['21'].inputs.guidance).toBe(3.0);
    expect(graph['5'].inputs.positive).toEqual(['21', 0]);
  });
  it('connects every NSFW level prompt through FLUX guidance to the sampler', () => {
    for (const intensity of [1, 2, 3, 4, 5] as const) {
      const prompt = ensureStudioFluxPrompt({
        prompt: 'A private bedroom with warm window light and a full-body camera view.',
        category: 'female',
        intensity,
      });
      const graph = buildFluxWorkflow({ prompt, model_family: 'flux' }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
      expect(studioPromptSatisfiesIntensity(String(graph['2'].inputs.text), intensity)).toBe(true);
      expect(graph['21'].inputs.conditioning).toEqual(['2', 0]);
      expect(graph['5'].inputs.positive).toEqual(['21', 0]);
      expect(graph['5'].inputs.cfg).toBe(1);
    }
  });
  it('uses a current ComfyUI ImageScale crop value for img2img', () => {
    const graph = buildFluxWorkflow({
      prompt: 'A three-view adult character turnaround sheet.',
      model_family: 'flux',
      input_image: 'avatar.png',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['12'].class_type).toBe('ImageScale');
    expect(graph['12'].inputs.crop).toBe('disabled');
    expect(['disabled', 'center']).toContain(graph['12'].inputs.crop);
  });

  it('uses the Shakker FLUX IP-Adapter graph for identity references', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult woman walking through a sunlit kitchen.',
      model_family: 'flux',
      ip_adapter_image: 'identity.png',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['30'].class_type).toBe('ApplyIPAdapterFlux');
    expect(graph['30'].inputs.model).toEqual(['1', 0]);
    expect(graph['30'].inputs.ipadapter_flux).toEqual(['31', 0]);
    expect(graph['30'].inputs.image).toEqual(['33', 0]);
    expect(graph['30'].inputs.weight).toBe(0.7);
    expect(graph['31'].class_type).toBe('IPAdapterFluxLoader');
    expect(graph['31'].inputs).toEqual({
      ipadapter: 'ip-adapter.bin',
      clip_vision: 'google/siglip-so400m-patch14-384',
      provider: 'cuda',
    });
    expect(graph['33'].class_type).toBe('LoadImage');
    expect(graph['5'].inputs.model).toEqual(['30', 0]);
    expect(graph['32']).toBeUndefined();
  });

  it('uses reference img2img instead of the FLUX-only IP-Adapter for SDXL identity continuity', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult woman walking through a sunlit kitchen.',
      model_family: 'pony',
      ckpt_name: 'ponyRealism_V22.safetensors',
      ip_adapter_image: 'identity.png',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['30']).toBeUndefined();
    expect(graph['11'].class_type).toBe('LoadImage');
    expect(graph['11'].inputs.image).toBe('identity.png');
    expect(graph['5'].inputs.denoise).toBe(0.62);
    expect(graph['5'].inputs.model).toEqual(['1', 0]);
  });

  it('keeps a compact quality negative instead of dropping a long negative prompt', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult subject in natural window light.',
      negativePrompt: 'plastic skin, waxy face, mannequin pose, rigid symmetry, over-smoothed skin, vacant expression, child, teen, underage, youthful face, ambiguous age, duplicate person, extra limbs, fused anatomy, malformed hands, malformed genitals, censored bar, mosaic, watermark, text, blurry, low quality',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    const negative = String(graph['3'].inputs.text);
    expect(negative).toContain('plastic skin');
    expect(negative).toContain('mannequin pose');
    expect(negative.length).toBeLessThanOrEqual(300);
  });

  it('removes blur cues from the positive prompt', () => {
    const graph = buildFluxWorkflow({
      prompt: 'adult woman, dreamy blur, soft focus, natural window light, sharp eyes',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(String(graph['2'].inputs.text)).not.toMatch(/dreamy blur|soft focus/i);
  });
});

describe('buildFluxWorkflow split loader (UNET-only checkpoint)', () => {
  it('uses UNETLoader + DualCLIPLoader + VAELoader for Flux Unchained', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult woman in natural window light.',
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [{ name: 'flux_style_photoreal_v1.safetensors', strength_model: 0.5 }],
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['1'].class_type).toBe('UNETLoader');
    expect(graph['1'].inputs.unet_name).toBe('fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors');
    expect(graph['22'].class_type).toBe('DualCLIPLoader');
    expect(graph['22'].inputs).toEqual({
      clip_name1: 'clip_l.safetensors',
      clip_name2: 't5xxl_fp8_e4m3fn.safetensors',
      type: 'flux',
    });
    expect(graph['23'].class_type).toBe('VAELoader');
    expect(graph['23'].inputs.vae_name).toBe('ae.safetensors');
    expect(graph['2'].inputs.clip).toEqual(['22', 0]);
    expect(graph['3'].inputs.clip).toEqual(['22', 0]);
    expect(graph['6'].inputs.vae).toEqual(['23', 0]);
    // LoRA model chains from the previous loader; CLIP always from DualCLIPLoader.
    expect(graph['14'].class_type).toBe('LoraLoader');
    expect(graph['14'].inputs.model).toEqual(['1', 0]);
    expect(graph['14'].inputs.clip).toEqual(['22', 0]);
    expect(graph['5'].inputs.model).toEqual(['14', 0]);
  });

  it('falls back to CheckpointLoaderSimple for full checkpoints', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult woman in natural window light.',
      ckpt_name: 'flux1-dev-fp8.safetensors',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(graph['1'].inputs.ckpt_name).toBe('flux1-dev-fp8.safetensors');
    expect(graph['2'].inputs.clip).toEqual(['1', 1]);
    expect(graph['6'].inputs.vae).toEqual(['1', 2]);
  });

  it('supports ckpt_loader override and custom clip/vae filenames', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult woman in natural window light.',
      ckpt_name: 'flux1-dev-fp8.safetensors',
      ckpt_loader: 'split',
      clip_name: 'clip_l_custom.safetensors',
      t5_name: 't5xxl_custom.safetensors',
      vae_name: 'ae_custom.safetensors',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;

    expect(graph['1'].class_type).toBe('UNETLoader');
    expect(graph['22'].inputs.clip_name1).toBe('clip_l_custom.safetensors');
    expect(graph['22'].inputs.clip_name2).toBe('t5xxl_custom.safetensors');
    expect(graph['23'].inputs.vae_name).toBe('ae_custom.safetensors');
  });

  it('defaults flux guidance to 3.0 (A/B selected base) unless overridden', () => {
    const graph = buildFluxWorkflow({
      prompt: 'An adult woman in natural window light.',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(graph['21'].inputs.guidance).toBe(3.0);

    const devGraph = buildFluxWorkflow({
      prompt: 'An adult woman in natural window light.',
      ckpt_name: 'flux1-dev-fp8.safetensors',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(devGraph['21'].inputs.guidance).toBe(3.5);

    const overridden = buildFluxWorkflow({
      prompt: 'An adult woman in natural window light.',
      flux_guidance: 4.2,
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(overridden['21'].inputs.guidance).toBe(4.2);
  });
});

describe('applyFluxNaturalLook (anti AI/wax look)', () => {
  it('appends natural skin/photography cues to human prompts and merges anti-AI negative', () => {
    const result = applyFluxNaturalLook(
      'portrait of a beautiful adult woman with fair luminous skin, sharp focus',
      'blurry, lowres, watermark',
    );
    expect(result.positive).toContain('youthful fresh healthy skin');
    expect(result.positive).toContain('natural skin texture with subtle fine pores');
    expect(result.positive).toContain('soft natural diffused lighting');
    expect(result.positive).toContain('genuine lively expression');
    expect(result.positive).toContain('relaxed unposed candid moment');
    expect(result.positive).not.toContain('fair luminous skin');
    expect(result.positive).not.toContain('visible pores');
    expect(result.positive).not.toContain('film grain');
    expect(result.negative).toContain('plastic skin');
    expect(result.negative).toContain('blurry');
    expect(result.negative).toContain('wax figure');
    expect(result.negative).toContain('aged appearance');
  });

  it('leaves non-human prompts (ghost mannequin outfits) untouched', () => {
    const prompt =
      'sexy cosplay costume as game wardrobe item, invisible ghost mannequin, full garment front view, no person no face';
    const result = applyFluxNaturalLook(prompt, 'person, face, skin, model');
    expect(result.positive).toBe(prompt);
    expect(result.positive).not.toContain('natural skin texture');
    expect(result.negative).toBe('person, face, skin, model');
  });

  it('does not duplicate the natural look when already present', () => {
    const result = applyFluxNaturalLook(
      'adult woman, natural skin texture with visible pores, window light',
    );
    expect(result.positive.match(/natural skin texture/g)?.length ?? 0).toBe(1);
  });
});

describe('FLUX girlfriend prompt', () => {
  it('builds natural language: protagonist + action + quality (beauty/allure)', () => {
    const result = assembleGirlfriendFromRow({
      name: 'Daisy Perez',
      appearance_race: 'Scandinavian',
      appearance_hair_color: 'auburn',
      appearance_hair: 'long hair',
      appearance_eyes: 'emerald green',
      appearance_body: 'curvy and confident',
      style: 'classic feminine editorial styling with elegant details and a polished romantic mood',
      appearance:
        'distinctive high cheekbones, balanced facial proportions, refined natural makeup, expressive features, graceful posture, and a sophisticated presence',
      personality: 'soft, intelligent journalist',
      tags: ['classic', 'window sunlight', 'elegant', 'romantic', 'editorial', 'confident'],
    });

    expect(result.positive.length).toBeLessThanOrEqual(900);
    expect(result.positive).toMatch(/^Daisy Perez,/);
    expect(result.positive).toMatch(/\. She is /);
    // quality tail: beauty + seduction + photoreal
    expect(result.positive).toMatch(/stunningly beautiful|seductive|alluring|photorealistic/i);
    // must keep identity + action variety, not pure quality spam only
    expect(result.positive).toMatch(/AI girlfriend|emerald green|auburn|curvy/i);
    expect(result.negative.length).toBeLessThan(200);
  });
});
