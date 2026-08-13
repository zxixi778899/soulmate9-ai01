import { describe, expect, it } from 'vitest';
import { buildFluxWorkflow } from '@/lib/runpod';

describe('FLUX workflow contract', () => {
  it('keeps authored prompt, guidance, lora strengths and identity adapter connected', () => {
    const graph = buildFluxWorkflow({
      prompt: 'full-body adult character standing in a bright studio',
      steps: 26,
      guidance: 3.5,
      flux_guidance: 3.5,
      ckpt_name: 'flux1-dev-fp8.safetensors',
      ip_adapter_image: 'identity.png',
      ip_adapter_weight: 0.3,
    });
    expect((graph['5'] as { inputs: Record<string, unknown> }).inputs.steps).toBe(26);
    expect((graph['21'] as { inputs: Record<string, unknown> }).inputs.guidance).toBe(3.5);
    expect((graph['2'] as { inputs: Record<string, unknown> }).inputs.text).toContain('full-body');
    expect((graph['30'] as { inputs: Record<string, unknown> }).inputs.model).toEqual(['1', 0]);
  });
});
