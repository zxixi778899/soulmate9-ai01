import { afterEach, describe, expect, it } from 'vitest';
import { resolveModelLoraPlan } from '@/lib/model-lora-routing';
import { buildFluxWorkflow } from '@/lib/runpod';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('model-specific LoRA routing', () => {
  it.each([3, 4, 5] as const)('mounts Pony LoRAs for NSFW level %s', (intensity) => {
    process.env.RUNPOD_INSTALLED_LORAS_PONY = 'pony_female_body.safetensors,pony_nsfw_pose.safetensors,pony_skin_detail.safetensors';
    process.env.RUNPOD_PONY_FEMALE_LORAS = 'pony_female_body.safetensors';
    process.env.RUNPOD_PONY_NSFW_LORAS = 'pony_nsfw_pose.safetensors,pony_skin_detail.safetensors';
    const plan = resolveModelLoraPlan({
      modelFamily: 'pony',
      category: 'female',
      intensity,
      maxLoras: 3,
    });
    expect(plan.selected.map((item) => item.name)).toEqual([
      'pony_female_body.safetensors',
      'pony_nsfw_pose.safetensors',
      'pony_skin_detail.safetensors',
    ]);
    expect(plan.selected.every((item) => item.strength_model > 0)).toBe(true);
  });

  it('never substitutes an installed FLUX LoRA into the Pony stack', () => {
    process.env.RUNPOD_INSTALLED_LORAS = 'flux_pose_nsfw_dynamic_v1.safetensors';
    process.env.RUNPOD_INSTALLED_LORAS_PONY = 'pony_nsfw_pose.safetensors';
    process.env.RUNPOD_PONY_NSFW_LORAS = 'pony_nsfw_pose.safetensors,flux_pose_nsfw_dynamic_v1.safetensors';
    const plan = resolveModelLoraPlan({
      modelFamily: 'pony',
      category: 'transgender',
      intensity: 5,
    });
    expect(plan.selected.map((item) => item.name)).toEqual(['pony_nsfw_pose.safetensors']);
    expect(plan.missing).toContain('flux_pose_nsfw_dynamic_v1.safetensors');
  });

  it('auto-selects compatible entries from a family-specific inventory', () => {
    process.env.RUNPOD_INSTALLED_LORAS_PONY = 'pony_trans_body.safetensors,pony_adult_pose.safetensors,pony_unrelated_style.safetensors';
    const plan = resolveModelLoraPlan({
      modelFamily: 'pony',
      category: 'transgender',
      intensity: 4,
    });
    expect(plan.selected.map((item) => item.name)).toEqual([
      'pony_trans_body.safetensors',
      'pony_adult_pose.safetensors',
    ]);
  });
});


describe('model-family workflow LoRA validation', () => {
  it('keeps Pony LoRAs through the final Comfy workflow builder', () => {
    process.env.RUNPOD_INSTALLED_LORAS_PONY = 'pony_nsfw_pose.safetensors';
    const graph = buildFluxWorkflow({
      prompt: 'Two consenting adults in a natural pose.',
      model_family: 'pony',
      ckpt_name: 'ponyRealism_V22.safetensors',
      loras: [{ name: 'pony_nsfw_pose.safetensors', strength_model: 0.65 }],
      clip_skip: 2,
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    expect(graph['14'].inputs.lora_name).toBe('pony_nsfw_pose.safetensors');
    expect(graph['5'].inputs.model).toEqual(['14', 0]);
    expect(graph['20'].class_type).toBe('CLIPSetLastLayer');
    expect(graph['20'].inputs.stop_at_clip_layer).toBe(-2);
    expect(graph['2'].inputs.clip).toEqual(['20', 0]);
  });
});
