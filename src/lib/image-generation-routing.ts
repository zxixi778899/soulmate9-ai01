import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { classifyImageScene, isComplexAdultScene, type ImageSceneSemantics } from '@/lib/image-scene-semantics';
import { logger } from '@/lib/logger';

export type ImageSurface = 'companion' | 'outfit' | 'prop' | 'advert';
export type ImageModelFamily = 'flux' | 'pony' | 'illustrious';

/**
 * Single unified ComfyUI endpoint — ALL image generation goes through here.
 * 双底模策略（A/B 选定）：
 *  - SFW / 写实（intensity < 3）：flux1-dev-fp8 完整底模，24 步，皮肤自然
 *  - NSFW（intensity >= 3）：Flux Unchained by SCG（UNET-only split 加载），8 步
 * All routes use FLUX parameters; LoRAs are auto-selected downstream by
 * resolveModelLoraPlan() based on model family + category + intensity.
 */
export const UNIFIED_COMFY_ENDPOINT = 'wozrrlcdipyl3p';

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
  reason: string;
  modelDetails: {
    architecture: 'flux-dev' | 'sdxl-pony' | 'sdxl-illustrious';
    precision: 'fp8' | 'fp16';
    textEncoder: 't5xxl+clip-l' | 'clip-l+clip-g';
    vae: 'ae.safetensors' | 'checkpoint-baked';
    predictionType: 'flow' | 'epsilon';
  };
  loraPolicy: {
    inventoryEnv: string[];
    categoryEnv: string;
    styleEnv?: string;
    adultEnv?: string;
    maxLoras: number;
    maxCombinedStrength: number;
    failClosed: true;
  };
};

const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;
const optionalEnv = (name: string): string => process.env[name]?.trim() || '';

type RouteCore = Omit<ImageGenerationRoute, 'modelDetails' | 'loraPolicy'>;

function completeRoute(route: RouteCore, category: CompanionCategory, renderStyle: AnimeRenderStyle): ImageGenerationRoute {
  const categoryKey = category === 'anime' ? 'FEMALE' : category.toUpperCase();
  const prefix = route.modelFamily === 'flux'
    ? 'RUNPOD_FLUX'
    : route.modelFamily === 'pony'
      ? 'RUNPOD_PONY'
      : 'RUNPOD_ILLUSTRIOUS';
  const isFlux = route.modelFamily === 'flux';
  return {
    ...route,
    modelDetails: isFlux
      ? {
          architecture: 'flux-dev',
          precision: 'fp8',
          textEncoder: 't5xxl+clip-l',
          vae: 'ae.safetensors',
          predictionType: 'flow',
        }
      : {
          architecture: route.modelFamily === 'pony' ? 'sdxl-pony' : 'sdxl-illustrious',
          precision: 'fp16',
          textEncoder: 'clip-l+clip-g',
          vae: 'checkpoint-baked',
          predictionType: 'epsilon',
        },
    loraPolicy: {
      inventoryEnv: isFlux
        ? ['RUNPOD_INSTALLED_LORAS_FLUX', 'RUNPOD_INSTALLED_LORAS']
        : [`RUNPOD_INSTALLED_LORAS_${route.modelFamily.toUpperCase()}`, 'RUNPOD_INSTALLED_LORAS_SDXL'],
      categoryEnv: `${prefix}_${categoryKey}_LORAS`,
      styleEnv: renderStyle === '2d' ? `${prefix}_2D_LORAS` : renderStyle === '3d' ? `${prefix}_3D_LORAS` : undefined,
      adultEnv: `${prefix}_NSFW_LORAS`,
      maxLoras: isFlux ? 3 : 2,
      maxCombinedStrength: 1.65,
      failClosed: true,
    },
  };
}

export function specialistModelsReadyFromEnv(): boolean {
  // Only return true if explicitly set to 'true'. Env vars existing is not sufficient —
  // we must have a positive confirmation that the SDXL endpoint has the models installed.
  // This prevents auto-routing to Pony/Illustrious when they're not actually available.
  return process.env.RUNPOD_SDXL_MODELS_READY?.trim().toLowerCase() === 'true';
}

/**
 * Declared checkpoint inventory of the SDXL worker (RUNPOD_SDXL_CHECKPOINTS,
 * comma-separated filenames). Returns null when the inventory is not declared —
 * in that case routing falls back to trusting RUNPOD_SDXL_MODELS_READY only.
 */
export function specialistCheckpointInventory(): Set<string> | null {
  const raw = process.env.RUNPOD_SDXL_CHECKPOINTS?.trim();
  if (!raw) return null;
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** True when the checkpoint is confirmed present on the SDXL worker volume. */
export function isSpecialistCheckpointAvailable(checkpoint: string): boolean {
  const inventory = specialistCheckpointInventory();
  if (!inventory) return true; // no declared inventory — flag-only mode
  return inventory.has(checkpoint.trim().toLowerCase());
}
/**
 * Resolve generation parameters for the unified ComfyUI endpoint.
 * ALL requests use the FLUX checkpoint (the only one currently deployed).
 * Model family is kept as a routing hint for downstream LoRA selection,
 * but checkpoint/sampler/scheduler/cfg are always FLUX-compatible.
 */
export function resolveImageGenerationRoute(input: {
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
  sceneText?: string;
  sceneSemantics?: ImageSceneSemantics;
  /** Quick preview mode: minimal steps + low cfg for fast companion drafts */
  turbo?: boolean;
  /** Runtime-verified SDXL inventory; clients receive this from the admin volume API. */
  specialistModelsReady?: boolean;
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const category: CompanionCategory = input.category === 'anime' ? 'female' : input.category || 'female';
  const semantics = input.sceneSemantics || classifyImageScene(input.sceneText || '', category);
  const complexScene = isComplexAdultScene(semantics);
  // Single endpoint for all model families
  const endpointId = env('RUNPOD_ENDPOINT_ID', UNIFIED_COMFY_ENDPOINT);
  const sfwCheckpoint = env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors');
  const nsfwCheckpoint = env('RUNPOD_FLUX_NSFW_CHECKPOINT', 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors');
  // An endpoint ID only proves that a worker exists. Specialist routing is
  // enabled only after its runtime volume has been verified to expose both
  // checkpoints and LoRAs; otherwise Comfy returns `value_not_in_list: []`.
  const sdxlModelsReady = input.specialistModelsReady ?? specialistModelsReadyFromEnv();
  const sdxlEndpoint = sdxlModelsReady ? optionalEnv('RUNPOD_ENDPOINT_ID_SDXL') : '';
  const illustriousCheckpoint = env('RUNPOD_CHECKPOINT_ILLUSTRIOUS', 'waiMatureIllustrious_v20.safetensors');
  const ponyCheckpoint = env('RUNPOD_CHECKPOINT_PONY', 'ponyRealism_V22.safetensors');

  // Runtime diagnostic logging
  logger.debug('[image-routing] resolve', {
    intensity,
    renderStyle,
    category,
    complexScene,
    sdxlModelsReady,
    sdxlEndpoint: sdxlEndpoint || '(empty)',
    env_SDXL_MODELS_READY: process.env.RUNPOD_SDXL_MODELS_READY || '(unset)',
    env_ENDPOINT_ID_SDXL: process.env.RUNPOD_ENDPOINT_ID_SDXL || '(unset)',
    input_specialistModelsReady: input.specialistModelsReady,
  });

  // The studio may use a dedicated SDXL worker after its mounted inventory is
  // explicitly marked ready. Until then all requests stay on verified FLUX.
  // An inventory mismatch (checkpoint missing on the volume) also stays on FLUX.
  if (input.surface === 'companion' && renderStyle === '2d' && sdxlEndpoint && isSpecialistCheckpointAvailable(illustriousCheckpoint)) {
    return completeRoute({
      surface: input.surface,
      modelFamily: 'illustrious',
      endpointId: sdxlEndpoint,
      checkpoint: illustriousCheckpoint,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras',
      steps: complexScene ? 32 : 28,
      cfg: 6,
      clipSkip: 2,
      width: 832,
      height: 1216,
      presetId: complexScene ? 'illustrious-2d-multi-control' : 'illustrious-2d-portrait',
      reason: 'Illustrious is configured for stable 2D anatomy and composition.',
    }, category, renderStyle);
  }

  const ponyEligible = input.surface === 'companion' && renderStyle === 'realistic' &&
    (intensity >= 3 || category === 'transgender' || complexScene);
  if (ponyEligible && sdxlEndpoint && isSpecialistCheckpointAvailable(ponyCheckpoint)) {
    const highControl = semantics.powerDynamic === 'sm' || semantics.pairing === 'group_4i';
    return completeRoute({
      surface: input.surface,
      modelFamily: 'pony',
      endpointId: sdxlEndpoint,
      checkpoint: ponyCheckpoint,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras',
      steps: highControl || complexScene ? 32 : 28,
      cfg: 6,
      clipSkip: 2,
      width: 832,
      height: 1216,
      presetId: highControl ? 'pony-adult-composition-control' : complexScene ? 'pony-adult-pair' : 'pony-adult-portrait',
      reason: 'Pony is configured as the specialist adult anatomy route.',
    }, category, renderStyle);
  }

  // ─── Turbo preview mode ───────────────────────────────────────────────────
  // Quick draft for companion chat: 12 steps + low cfg produces a recognizable
  // image in ~3s instead of ~8s. Used for "typing…" previews and pool warm-up.
  if (
    input.surface === 'companion' &&
    input.turbo &&
    renderStyle === 'realistic' &&
    intensity < 3 &&
    category !== 'transgender' &&
    !complexScene
  ) {
    return completeRoute({
      surface: input.surface,
      modelFamily: 'flux',
      endpointId,
      checkpoint: sfwCheckpoint,
      sampler: 'euler',
      scheduler: 'simple',
      steps: 8,
      cfg: 1,
      clipSkip: 1,
      width: 832,
      height: 1216,
      presetId: 'flux-companion-turbo',
      reason: 'Turbo preview: minimal steps for fast companion draft.',
    }, category, renderStyle);
  }

  // ─── 2D / Anime style (FLUX pipeline) ─────────────────────────────────────
  // Uses FLUX with anime-oriented prompt. LoRA routing will select
  // flux_detail_enhancer for anime category downstream.
  if (input.surface === 'companion' && renderStyle === '2d') {
    return completeRoute({
      surface: input.surface,
      modelFamily: 'flux',
      endpointId,
      checkpoint: intensity >= 3 ? nsfwCheckpoint : sfwCheckpoint,
      sampler: 'euler',
      scheduler: 'simple',
      steps: intensity >= 3 ? 8 : 24,
      cfg: 1,
      clipSkip: 1,
      width: 832,
      height: 1216,
      presetId: complexScene ? 'flux-2d-multi-control' : 'flux-2d-portrait',
      reason: complexScene
        ? 'Multi-character 2D art uses a higher-step FLUX anime preset.'
        : 'Single-character 2D art uses the FLUX anime portrait preset.',
    }, category, renderStyle);
  }

  // ─── Adult / NSFW anatomy (FLUX pipeline) ─────────────────────────────────
  // Uses FLUX with explicit natural-language prompt. LoRA routing will select
  // Model-family routing may add only runtime-verified LoRAs downstream.
  const needsAdultAnatomy = input.surface === 'companion' && renderStyle !== '2d' &&
    (intensity >= 3 || category === 'transgender' || complexScene);
  if (needsAdultAnatomy) {
    const highControl = semantics.powerDynamic === 'sm' || semantics.pairing === 'group_4i';
    return completeRoute({
      surface: input.surface,
      modelFamily: 'flux',
      endpointId,
      checkpoint: nsfwCheckpoint,
      sampler: 'euler',
      scheduler: 'simple',
      steps: 8,
      cfg: 1,
      clipSkip: 1,
      // Native 2:3 FLUX canvas; 44% fewer latent pixels than 1024x1536.
      width: 768,
      height: 1152,
      presetId: highControl ? 'flux-adult-composition-control' : complexScene ? 'flux-adult-pair' : 'flux-adult-portrait',
      reason: category === 'transgender'
        ? 'Transgender anatomy uses the FLUX explicit pipeline with NSFW LoRAs.'
        : 'Explicit adult anatomy uses the FLUX pipeline with NSFW LoRAs.',
    }, category, renderStyle);
  }

  // ─── Default: FLUX companion / product ────────────────────────────────────
  return completeRoute({
    surface: input.surface,
    modelFamily: 'flux',
    endpointId,
    checkpoint: sfwCheckpoint,
    sampler: 'euler',
    scheduler: 'simple',
    steps: 24,
    cfg: 1,
    clipSkip: 1,
    width: input.surface === 'companion' ? 832 : 1024,
    height: input.surface === 'companion' ? 1216 : 1024,
    presetId: input.surface === 'companion' ? 'flux-companion-natural' : `flux-${input.surface}-product`,
    reason: renderStyle === '3d'
      ? '3D companion rendering uses the FLUX pipeline.'
      : `${input.surface} generation uses the FLUX product pipeline.`,
  }, category, renderStyle);
}
