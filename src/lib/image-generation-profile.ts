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
  // 双底模：SFW 用完整版 dev-fp8（24 步自然皮肤）；成人/NSFW 用 Unchained（8 步）
  const sfwCheckpoint = env('RUNPOD_PHOTOREAL_CHECKPOINT', 'flux1-dev-fp8.safetensors');
  const nsfwCheckpoint = env('RUNPOD_FLUX_NSFW_CHECKPOINT', 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors');
  const checkpoint = adult ? nsfwCheckpoint : sfwCheckpoint;
  const steps = adult ? 8 : 24;
  const photo = env('RUNPOD_PHOTOREAL_LORA', 'flux_style_photoreal_v1.safetensors');
  const skinLora = env('RUNPOD_SKIN_LORA', 'flux_detail_skin_nplastic_v1.safetensors');
  const profiles: Record<GenderStyle, ImageGenerationProfile> = {
    female: { checkpoint, loras: [{ name: photo, strength_model: 0.3, strength_clip: 0.3 }, { name: skinLora, strength_model: 0.25, strength_clip: 0.25 }], promptSuffix: 'young adult woman in her mid-20s, youthful fresh skin, feminine anatomy, natural proportions', negativePrompt: `male body, masculine face, ${BLOCKED}`, steps, guidance: 1 },
    male: { checkpoint, loras: [{ name: env('RUNPOD_MALE_LORA', photo), strength_model: 0.3, strength_clip: 0.3 }, { name: skinLora, strength_model: 0.25, strength_clip: 0.25 }], promptSuffix: 'young adult man in his mid-20s, youthful fresh skin, masculine anatomy, broad shoulders, natural male proportions', negativePrompt: `female body, breasts, feminine face, ${BLOCKED}`, steps, guidance: 1 },
    transgender: { checkpoint, loras: [{ name: env('RUNPOD_TRANSGENDER_LORA', photo), strength_model: 0.3, strength_clip: 0.3 }, { name: skinLora, strength_model: 0.25, strength_clip: 0.25 }], promptSuffix: 'young adult transgender woman in her mid-20s, youthful fresh skin, confident authentic gender presentation, natural anatomy', negativePrompt: `caricature, fetishized stereotype, ${BLOCKED}`, steps, guidance: 1 },
    cartoon: {
      checkpoint: env('RUNPOD_CARTOON_CHECKPOINT', sfwCheckpoint),
      loras: process.env.RUNPOD_CARTOON_LORA?.trim() ? [{ name: process.env.RUNPOD_CARTOON_LORA.trim(), strength_model: 0.7, strength_clip: 0.7 }] : [],
      promptSuffix: 'young adult character, polished 2D illustration, fully colored finished artwork, expressive eyes, vibrant cel shading',
      negativePrompt: `photograph, photorealistic, 3d render, low quality, ${BLOCKED}`,
      steps: 24,
      guidance: 1,
    },
  };
  const selected = profiles[gender];
  if (!adult || gender === 'cartoon') return selected;
  return {
    ...selected,
    loras: [...selected.loras.slice(0, 1), { name: env('RUNPOD_ADULT_POSE_LORA', 'flux_pose_nsfw_dynamic_v1.safetensors'), strength_model: 0.45, strength_clip: 0.45 }],
    promptSuffix: `${selected.promptSuffix}, consenting adult erotic scene, explicit adult-only composition`,
  };
}
