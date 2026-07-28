import type { CompanionCategory } from '@/lib/companion-category';
import type { CharacterAssetRole } from '@/lib/character-asset-production';
import {
  buildStudioPromptEnhancement,
  type AnimeRenderStyle,
  type NsfwIntensity,
} from '@/lib/comfy-console/studio-profile';
import {
  resolveImageGenerationRoute,
  type ImageModelFamily,
  type ImageSurface,
} from '@/lib/image-generation-routing';

export type CreativeGenerationMode = 'txt2img' | 'img2img' | 'img2video';

export type CreativeGenerationPreset = {
  mode: CreativeGenerationMode;
  label: string;
  modelFamily: ImageModelFamily | 'animatediff';
  checkpoint: string;
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  denoise?: number;
  durationSeconds?: number;
  fps?: number;
  frames?: number;
  motionStrength?: number;
  reason: string;
};

export function resolveCreativeGenerationPreset(input: {
  mode: CreativeGenerationMode;
  surface: ImageSurface;
  category: CompanionCategory;
  renderStyle: AnimeRenderStyle;
  intensity: NsfwIntensity;
  assetRole?: CharacterAssetRole;
  scene?: string;
  identityConsistency?: boolean;
}): CreativeGenerationPreset {
  if (input.mode === 'img2video') {
    const explicitMotion = input.intensity >= 4;
    return {
      mode: input.mode,
      label: explicitMotion ? '人设动画 · 高动作控制' : '人设动画 · 自然动作',
      modelFamily: 'animatediff',
      checkpoint: 'realisticVisionV60B1_v51VAE.safetensors',
      sampler: 'euler_ancestral',
      scheduler: 'normal',
      steps: explicitMotion ? 24 : 20,
      cfg: explicitMotion ? 7.5 : 7,
      width: 512,
      height: 768,
      durationSeconds: 5,
      fps: 8,
      frames: 40,
      motionStrength: explicitMotion ? 7 : 5,
      denoise: explicitMotion ? 0.63 : 0.55,
      reason: '图生视频固定为 5 秒；高强度动作提高运动幅度和控制步数。',
    };
  }

  const route = resolveImageGenerationRoute({
    surface: input.surface,
    category: input.category,
    renderStyle: input.renderStyle,
    nsfwIntensity: input.intensity,
    sceneText: input.scene,
  });
  const isIdentityAsset = input.assetRole === 'avatar-closeup' || (input.assetRole?.startsWith('identity-') ?? false);
  const denoise = input.mode === 'img2img'
    ? isIdentityAsset || input.identityConsistency
      ? 0.35
      : input.assetRole === 'character-art'
        ? 0.42
        : 0.5
    : undefined;

  return {
    mode: input.mode,
    label: input.mode === 'txt2img' ? '文生图 · 自动路由' : '图生图 · 身份保持',
    modelFamily: route.modelFamily,
    checkpoint: route.checkpoint,
    sampler: route.sampler,
    scheduler: route.scheduler,
    steps: route.steps,
    cfg: route.cfg,
    width: route.width,
    height: route.height,
    denoise,
    reason: `${route.reason}${denoise ? ` 重绘强度 ${denoise.toFixed(2)}。` : ''}`,
  };
}

export function buildCreativePromptPreset(input: {
  mode: CreativeGenerationMode;
  category: CompanionCategory;
  intensity: NsfwIntensity;
  renderStyle: AnimeRenderStyle;
  scene?: string;
  identity?: string;
}): string {
  const base = buildStudioPromptEnhancement({
    category: input.category,
    intensity: input.intensity,
    animeStyle: input.renderStyle,
    scene: input.scene,
    identity: input.identity,
  });
  if (input.mode === 'img2img') {
    return `${base} Use the supplied reference image for the established face, body proportions, pose or composition as requested. Preserve identity while changing only the described scene, action, wardrobe and camera treatment.`;
  }
  if (input.mode === 'img2video') {
    return `${base} Animate this exact reference image for five seconds with coherent natural body motion, stable facial identity, subtle secondary hair and fabric movement, a steady camera, smooth temporal continuity and no sudden morphing or scene cuts.`;
  }
  return `${base} Build the complete frame directly from this description with a clear subject, readable environment, coherent contact with props and intentional commercial-quality composition.`;
}
