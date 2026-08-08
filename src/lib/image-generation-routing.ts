import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { classifyImageScene, isComplexAdultScene, type ImageSceneSemantics } from '@/lib/image-scene-semantics';

export type ImageSurface = 'companion' | 'outfit' | 'prop' | 'advert';
export type ImageModelFamily = 'flux' | 'pony' | 'illustrious';

/**
 * Single unified ComfyUI endpoint — ALL image generation goes through here.
 * Currently only flux1-dev-fp8.safetensors is available on the worker.
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
};

const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

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
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const category: CompanionCategory = input.category === 'anime' ? 'female' : input.category || 'female';
  const semantics = input.sceneSemantics || classifyImageScene(input.sceneText || '', category);
  const complexScene = isComplexAdultScene(semantics);
  // Single endpoint for all model families
  const endpointId = env('RUNPOD_ENDPOINT_ID', UNIFIED_COMFY_ENDPOINT);
  const fluxCheckpoint = env('RUNPOD_FLUX_CHECKPOINT', 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors');

  // ─── Turbo preview mode ───────────────────────────────────────────────────
  // Quick draft for companion chat: 12 steps + low cfg produces a recognizable
  // image in ~3s instead of ~8s. Used for "typing…" previews and pool warm-up.
  if (input.surface === 'companion' && input.turbo) {
    return {
      surface: input.surface,
      modelFamily: 'flux',
      endpointId,
      checkpoint: fluxCheckpoint,
      sampler: 'euler',
      scheduler: 'simple',
      steps: 12,
      cfg: 1.5,
      clipSkip: 1,
      width: 832,
      height: 1216,
      presetId: 'flux-companion-turbo',
      reason: 'Turbo preview: minimal steps for fast companion draft.',
    };
  }

  // ─── 2D / Anime style (FLUX pipeline) ─────────────────────────────────────
  // Uses FLUX with anime-oriented prompt. LoRA routing will select
  // flux_detail_enhancer for anime category downstream.
  if (input.surface === 'companion' && renderStyle === '2d') {
    return {
      surface: input.surface,
      modelFamily: 'flux',
      endpointId,
      checkpoint: fluxCheckpoint,
      sampler: 'euler',
      scheduler: 'simple',
      steps: complexScene ? 32 : 28,
      cfg: 1,
      clipSkip: 1,
      width: 832,
      height: 1216,
      presetId: complexScene ? 'flux-2d-multi-control' : 'flux-2d-portrait',
      reason: complexScene
        ? 'Multi-character 2D art uses a higher-step FLUX anime preset.'
        : 'Single-character 2D art uses the FLUX anime portrait preset.',
    };
  }

  // ─── Adult / NSFW anatomy (FLUX pipeline) ─────────────────────────────────
  // Uses FLUX with explicit natural-language prompt. LoRA routing will select
  // Model-family routing may add only runtime-verified LoRAs downstream.
  const needsAdultAnatomy = input.surface === 'companion' && renderStyle === 'realistic' &&
    (intensity >= 3 || category === 'transgender' || complexScene);
  if (needsAdultAnatomy) {
    const highControl = semantics.powerDynamic === 'sm' || semantics.pairing === 'group_4i';
    return {
      surface: input.surface,
      modelFamily: 'flux',
      endpointId,
      checkpoint: fluxCheckpoint,
      sampler: 'euler',
      scheduler: 'simple',
      steps: highControl ? 30 : complexScene ? 28 : 26,
      cfg: 1,
      clipSkip: 1,
      // Native 2:3 FLUX canvas; 44% fewer latent pixels than 1024x1536.
      width: 768,
      height: 1152,
      presetId: highControl ? 'flux-adult-composition-control' : complexScene ? 'flux-adult-pair' : 'flux-adult-portrait',
      reason: category === 'transgender'
        ? 'Transgender anatomy uses the FLUX explicit pipeline with NSFW LoRAs.'
        : 'Explicit adult anatomy uses the FLUX pipeline with NSFW LoRAs.',
    };
  }

  // ─── Default: FLUX companion / product ────────────────────────────────────
  return {
    surface: input.surface,
    modelFamily: 'flux',
    endpointId,
    checkpoint: fluxCheckpoint,
    sampler: 'euler',
    scheduler: 'simple',
    steps: input.surface === 'companion' ? 24 : 20,
    cfg: 1,
    clipSkip: 1,
    width: input.surface === 'companion' ? 832 : 1024,
    height: input.surface === 'companion' ? 1216 : 1024,
    presetId: input.surface === 'companion' ? 'flux-companion-natural' : `flux-${input.surface}-product`,
    reason: renderStyle === '3d'
      ? '3D companion rendering uses the FLUX pipeline.'
      : `${input.surface} generation uses the FLUX product pipeline.`,
  };
}
