import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { classifyImageScene, isComplexAdultScene, type ImageSceneSemantics } from '@/lib/image-scene-semantics';

export type ImageSurface = 'companion' | 'outfit' | 'prop' | 'advert';
export type ImageModelFamily = 'flux' | 'pony' | 'illustrious';

/**
 * Single unified ComfyUI endpoint — ALL image generation goes through here.
 * The worker has all checkpoints (FLUX / Pony / Illustrious) and LoRAs
 * mounted on its network volume. LoRAs are auto-selected downstream by
 * resolveModelLoraPlan() based on model family + category + intensity.
 */
export const UNIFIED_COMFY_ENDPOINT = 'comfyui-wozrrlcdipyl3p';

export type ImageGenerationRoute = {
  surface: ImageSurface;
  modelFamily: ImageModelFamily;
  endpointId: string;
  checkpoint: string;
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  clipSkip: 1 | 2;
  width: number;
  height: number;
  presetId: string;
  promptPrefix: string;
  reason: string;
};

const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

/**
 * Resolve generation parameters for the unified ComfyUI endpoint.
 * Model family / checkpoint / sampler still vary by context to build
 * the correct ComfyUI workflow graph, but ALL requests hit the same endpoint.
 */
export function resolveImageGenerationRoute(input: {
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
  sceneText?: string;
  sceneSemantics?: ImageSceneSemantics;
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const category: CompanionCategory = input.category === 'anime' ? 'female' : input.category || 'female';
  const semantics = input.sceneSemantics || classifyImageScene(input.sceneText || '', category);
  const complexScene = isComplexAdultScene(semantics);
  // Single endpoint for all model families
  const endpointId = env('RUNPOD_ENDPOINT_ID', UNIFIED_COMFY_ENDPOINT);

  if (input.surface === 'companion' && renderStyle === '2d') {
    return {
      surface: input.surface,
      modelFamily: 'illustrious',
      endpointId,
      checkpoint: env('RUNPOD_ILLUSTRIOUS_CHECKPOINT', 'waiMatureIllustrious_v20.safetensors'),
      sampler: complexScene ? 'dpmpp_sde' : 'dpmpp_2m_sde',
      scheduler: 'karras',
      steps: complexScene ? 40 : 34,
      cfg: complexScene ? 6.5 : 5.8,
      clipSkip: 2,
      width: 832,
      height: 1216,
      presetId: complexScene ? 'illustrious-2d-multi-control' : 'illustrious-2d-portrait',
      promptPrefix: 'masterpiece, best quality, very aesthetic, mature adult character, consistent design, clean line work.',
      reason: complexScene
        ? 'Multi-character 2D art uses a higher-control Illustrious preset.'
        : 'Single-character 2D art uses the Illustrious portrait preset.',
    };
  }

  const needsAdultAnatomy = input.surface === 'companion' && renderStyle === 'realistic' &&
    (intensity >= 3 || category === 'transgender' || complexScene);
  if (needsAdultAnatomy) {
    const subjectTags = category === 'transgender'
      ? '1girl, solo, transgender female, futanari, feminine face, breasts, penis, testicles'
      : category === 'male'
        ? '1boy, solo, male, masculine face, broad shoulders, male body'
        : '1girl, solo, female, feminine face, female body';
    const anatomyTags = intensity >= 3
      ? category === 'transgender'
        ? 'visible breasts, visible penis, visible testicles'
        : category === 'male'
          ? 'visible penis, visible testicles'
          : 'visible breasts, visible vulva'
      : '';
    const highControl = semantics.powerDynamic === 'sm' || semantics.pairing === 'group_4i';
    return {
      surface: input.surface,
      modelFamily: 'pony',
      endpointId,
      checkpoint: env('RUNPOD_PONY_CHECKPOINT', 'ponyRealism_V22.safetensors'),
      sampler: highControl ? 'dpmpp_sde' : 'dpmpp_2m_sde',
      scheduler: 'karras',
      steps: highControl ? 44 : complexScene ? 40 : 36,
      cfg: highControl ? 7 : 6.5,
      clipSkip: 2,
      width: 1024,
      height: complexScene ? 1344 : 1536,
      presetId: highControl ? 'pony-adult-composition-control' : complexScene ? 'pony-adult-pair' : 'pony-adult-portrait',
      promptPrefix: `score_9, score_8_up, score_7_up, source_realistic, ${subjectTags}, ${anatomyTags}, full body, complete head, face visible, eyes in focus, detailed skin, natural skin texture, realistic photography, sharp focus, clean exposure, BREAK.`,
      reason: category === 'transgender'
        ? 'Transgender anatomy uses the Pony-native adult pipeline.'
        : 'Explicit or multi-person adult anatomy uses the Pony-native adult pipeline.',
    };
  }

  return {
    surface: input.surface,
    modelFamily: 'flux',
    endpointId,
    checkpoint: env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors'),
    sampler: 'euler',
    scheduler: 'simple',
    steps: input.surface === 'companion' ? 32 : 28,
    cfg: 1.8,
    clipSkip: 1,
    width: input.surface === 'companion' ? 832 : 1024,
    height: input.surface === 'companion' ? 1216 : 1024,
    presetId: input.surface === 'companion' ? 'flux-companion-natural' : `flux-${input.surface}-product`,
    promptPrefix: input.surface === 'companion'
      ? 'A sharp in-focus real-camera editorial portrait with the complete head visible, clear eyes, relaxed posture, natural skin pores, restrained grain, and believable texture.'
      : 'Clean commercial product photography with accurate materials and controlled lighting.',
    reason: renderStyle === '3d'
      ? '3D companion rendering uses the FLUX pipeline.'
      : `${input.surface} generation uses the FLUX product pipeline.`,
  };
}
