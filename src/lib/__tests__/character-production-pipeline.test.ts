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
    'identity-turnaround': 'https://example.com/turnaround.png',
  },
};

describe('character production reference routing', () => {
  it('uses the avatar only for IP-Adapter identity when generating turnaround views', () => {
    const stage = CHARACTER_PIPELINE_STAGES.find((item) => item.id === 'turnaround');
    expect(stage).toBeDefined();
    const refs = resolveStageReference(stage!, context);
    expect(refs).toEqual({
      ipAdapterImage: 'https://example.com/avatar.png',
    });
    const params = buildStageGenerationParams(stage!, 'prompt', 'negative', [], refs);
    expect(params.input_image).toBeUndefined();
    expect(params.ip_adapter_image).toBe('https://example.com/avatar.png');
    expect(params.ip_adapter_weight).toBe(0.82);
    expect(params.width).toBe(1344);
    expect(params.height).toBe(768);
  });

  it('uses turnaround for composition and avatar for facial identity in character art', () => {
    const stage = CHARACTER_PIPELINE_STAGES.find((item) => item.id === 'character-art');
    expect(stage).toBeDefined();
    const refs = resolveStageReference(stage!, context);
    expect(refs.inputImage).toBe('https://example.com/turnaround.png');
    expect(refs.ipAdapterImage).toBe('https://example.com/avatar.png');
    const params = buildStageGenerationParams(stage!, 'prompt', 'negative', [], refs);
    expect(params.input_image).toBe('https://example.com/turnaround.png');
    expect(params.ip_adapter_image).toBe('https://example.com/avatar.png');
  });
});