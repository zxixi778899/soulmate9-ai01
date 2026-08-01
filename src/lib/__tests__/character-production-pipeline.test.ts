import { describe, expect, it } from 'vitest';
import {
  CHARACTER_PIPELINE_STAGES,
  buildStageGenerationParams,
  resolveStageReference,
  type PipelineContext,
} from '@/lib/character-production-pipeline';

const context: PipelineContext = {
  companionId: 'companion-1',
  companion: { id: 'companion-1', age: 21, gender: 'Female' },
  category: 'female',
  animeStyle: 'realistic',
  nsfwIntensity: 1,
  existingAssets: {
    'avatar-closeup': 'https://example.com/avatar.png',
  },
};

describe('character production pipeline definition', () => {
  it('is a 3-stage pipeline: avatar → character-art → video', () => {
    expect(CHARACTER_PIPELINE_STAGES.map((stage) => stage.id)).toEqual([
      'avatar',
      'character-art',
      'video',
    ]);
  });
});

describe('character production reference routing', () => {
  it('generates the avatar with no reference (pure txt2img identity anchor)', () => {
    const stage = CHARACTER_PIPELINE_STAGES.find((item) => item.id === 'avatar');
    expect(stage).toBeDefined();
    const refs = resolveStageReference(stage!, context);
    expect(refs).toEqual({});
    const params = buildStageGenerationParams(stage!, 'prompt', 'negative', [], refs);
    expect(params.input_image).toBeUndefined();
    expect(params.ip_adapter_image).toBeUndefined();
    expect(params.character_consistency).toBe(false);
    expect(params.width).toBe(832);
    expect(params.height).toBe(1216);
  });

  it('locks the face via IP-Adapter only (txt2img, prompt controls composition) in character art', () => {
    const stage = CHARACTER_PIPELINE_STAGES.find((item) => item.id === 'character-art');
    expect(stage).toBeDefined();
    expect(stage!.mode).toBe('txt2img');
    const refs = resolveStageReference(stage!, context);
    expect(refs.inputImage).toBeUndefined();
    expect(refs.ipAdapterImage).toBe('https://example.com/avatar.png');
    const params = buildStageGenerationParams(stage!, 'prompt', 'negative', [], refs);
    expect(params.input_image).toBeUndefined();
    expect(params.denoising_strength).toBeUndefined();
    expect(params.ip_adapter_image).toBe('https://example.com/avatar.png');
    expect(params.ip_adapter_weight).toBe(0.65);
    expect(params.character_consistency).toBe(true);
    expect(params.width).toBe(832);
    expect(params.height).toBe(1216);
  });

  it('feeds the avatar into img2video for the animation stage', () => {
    const stage = CHARACTER_PIPELINE_STAGES.find((item) => item.id === 'video');
    expect(stage).toBeDefined();
    const refs = resolveStageReference(stage!, context);
    expect(refs.inputImage).toBe('https://example.com/avatar.png');
    const params = buildStageGenerationParams(stage!, 'prompt', 'negative', [], refs);
    expect(params.input_image).toBe('https://example.com/avatar.png');
    expect(params.gen_mode).toBe('img2video');
    expect(params.width).toBe(512);
    expect(params.height).toBe(768);
  });
});
