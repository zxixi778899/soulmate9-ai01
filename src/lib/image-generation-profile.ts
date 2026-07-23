import type { GenderStyle } from '@/lib/prompt/girlfriend';

export type ImageGenerationProfile = {
  checkpoint: string;
  loras: Array<{ name: string; strength_model: number; strength_clip: number }>;
  promptSuffix: string;
  negativePrompt: string;
  steps: number;
  guidance: number;
};

const BLOCKED = 'child, underage, teen, young-looking, schoolchild, non-consensual, coercion, violence, incest, bestiality';
const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

export function resolveImageGenerationProfile(gender: GenderStyle, adult: boolean): ImageGenerationProfile {
  const checkpoint = env('RUNPOD_PHOTOREAL_CHECKPOINT', 'flux1-dev-fp8.safetensors');
  const photo = env('RUNPOD_PHOTOREAL_LORA', 'flux_style_photoreal_v1.safetensors');
  const profiles: Record<GenderStyle, ImageGenerationProfile> = {
    female: { checkpoint, loras: [{ name: photo, strength_model: 0.5, strength_clip: 0.5 }, { name: env('RUNPOD_SKIN_LORA', 'flux_detail_skin_v1.safetensors'), strength_model: 0.35, strength_clip: 0.35 }], promptSuffix: 'adult woman, feminine anatomy, natural proportions', negativePrompt: `male body, masculine face, ${BLOCKED}`, steps: 28, guidance: 1 },
    male: { checkpoint, loras: [{ name: env('RUNPOD_MALE_LORA', photo), strength_model: 0.5, strength_clip: 0.5 }], promptSuffix: 'adult man, masculine anatomy, broad shoulders, natural male proportions', negativePrompt: `female body, breasts, feminine face, ${BLOCKED}`, steps: 28, guidance: 1 },
    transgender: { checkpoint, loras: [{ name: env('RUNPOD_TRANSGENDER_LORA', photo), strength_model: 0.5, strength_clip: 0.5 }], promptSuffix: 'adult transgender person, confident authentic gender presentation, natural anatomy', negativePrompt: `caricature, fetishized stereotype, ${BLOCKED}`, steps: 28, guidance: 1 },
    cartoon: {
      checkpoint: env('RUNPOD_CARTOON_CHECKPOINT', checkpoint),
      loras: process.env.RUNPOD_CARTOON_LORA?.trim() ? [{ name: process.env.RUNPOD_CARTOON_LORA.trim(), strength_model: 0.7, strength_clip: 0.7 }] : [],
      promptSuffix: 'adult character, polished 2D illustration, clean line art, expressive eyes, cel shading',
      negativePrompt: `photograph, photorealistic, 3d render, low quality, ${BLOCKED}`,
      steps: 30,
      guidance: 1,
    },
  };
  const selected = profiles[gender];
  if (!adult || gender === 'cartoon') return selected;
  return {
    ...selected,
    loras: [...selected.loras.slice(0, 1), { name: env('RUNPOD_ADULT_POSE_LORA', 'flux_pose_nsfw_dynamic_v1.safetensors'), strength_model: 0.6, strength_clip: 0.6 }],
    promptSuffix: `${selected.promptSuffix}, consenting adult erotic scene, explicit adult-only composition`,
  };
}
