import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFluxWorkflow } from '../runpod';
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
    expect(graph['21'].inputs.guidance).toBe(3.5);
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
    expect(graph['30'].inputs.weight).toBe(0.72);
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
