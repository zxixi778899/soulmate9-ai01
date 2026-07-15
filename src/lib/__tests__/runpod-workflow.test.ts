import { describe, expect, it } from 'vitest';
import { buildFluxWorkflow } from '../runpod';
import { assembleGirlfriendFromRow } from '../prompt/girlfriend';

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
