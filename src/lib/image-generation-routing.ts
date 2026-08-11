import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { classifyImageScene, isComplexAdultScene, type ImageSceneSemantics } from '@/lib/image-scene-semantics';

export type ImageSurface = 'companion' | 'outfit' | 'prop' | 'advert';
/**
 * 'pony' / 'illustrious' are retained purely for type compatibility with
 * legacy callers and the runpod preflight fallback; routing never returns
 * them anymore — every request runs on the unified FLUX pipeline.
 */
export type ImageModelFamily = 'flux' | 'pony' | 'illustrious';

/**
 * Single unified ComfyUI endpoint — ALL image generation goes through here.
 * 单底模策略（全站 FLUX 重构）：
 *  - 所有场景统一 flux1-dev-fp8 完整底模（CheckpointLoaderSimple 加载）
 *  - KSampler cfg 恒为 1；条件引导 flux_guidance：SFW 3.5 / NSFW 4.0
 *  - 步数：SFW 24 / NSFW 28 / 复杂多人 30 / turbo 草稿 8
 * LoRAs are auto-selected downstream by resolveModelLoraPlan() from the
 * curated FLUX_SCENARIO_PLANS based on category + render style + intensity.
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
  /** FLUX conditioning guidance (KSampler cfg stays 1). */
  fluxGuidance: number;
  clipSkip: 1 | 2;
  width: number;
  height: number;
  presetId: string;
  reason: string;
  modelDetails: {
    architecture: 'flux-dev';
    precision: 'fp8';
    textEncoder: 't5xxl+clip-l';
    vae: 'ae.safetensors';
    predictionType: 'flow';
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

/**
 * img2img denoise defaults for studio task workflows (outfit swap / pose
 * swap / background swap). Higher denoise = more freedom to change.
 */
export const TASK_DENOISE_DEFAULTS: Record<'outfit' | 'pose' | 'background' | 'portrait', number> = {
  // 换装：服装必须能换掉，但脸与构图要留住
  outfit: 0.72,
  // 换姿势：身体姿态要变，身份与服装保持
  pose: 0.62,
  // 换背景：只松动环境
  background: 0.5,
  portrait: 0.55,
};

const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

export function specialistModelsReadyFromEnv(): boolean {
  // Legacy SDXL gate — kept because admin health endpoints surface it. The
  // routing matrix no longer consumes it: everything stays on FLUX.
  return process.env.RUNPOD_SDXL_MODELS_READY?.trim().toLowerCase() === 'true';
}

/**
 * Declared checkpoint inventory of the legacy SDXL worker. Still consumed by
 * the runpod preflight as the final fallback safety net.
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

function fluxRoute(
  route: {
    surface: ImageSurface;
    checkpoint: string;
    steps: number;
    fluxGuidance: number;
    width: number;
    height: number;
    presetId: string;
    reason: string;
  },
  category: CompanionCategory,
  renderStyle: AnimeRenderStyle,
): ImageGenerationRoute {
  const categoryKey = category === 'anime' ? 'FEMALE' : category.toUpperCase();
  return {
    ...route,
    modelFamily: 'flux',
    endpointId: env('RUNPOD_ENDPOINT_ID', UNIFIED_COMFY_ENDPOINT),
    sampler: 'euler',
    scheduler: 'simple',
    cfg: 1,
    clipSkip: 1,
    modelDetails: {
      architecture: 'flux-dev',
      precision: 'fp8',
      textEncoder: 't5xxl+clip-l',
      vae: 'ae.safetensors',
      predictionType: 'flow',
    },
    loraPolicy: {
      inventoryEnv: ['RUNPOD_INSTALLED_LORAS_FLUX', 'RUNPOD_INSTALLED_LORAS'],
      categoryEnv: `RUNPOD_FLUX_${categoryKey}_LORAS`,
      styleEnv: renderStyle === '2d' ? 'RUNPOD_FLUX_2D_LORAS' : renderStyle === '3d' ? 'RUNPOD_FLUX_3D_LORAS' : undefined,
      adultEnv: 'RUNPOD_FLUX_NSFW_LORAS',
      maxLoras: 3,
      maxCombinedStrength: 1.65,
      failClosed: true,
    },
  };
}

/**
 * Resolve generation parameters for the unified ComfyUI endpoint.
 * Every scenario — female / male / transgender / 2D anime / 3D, SFW or NSFW —
 * runs on flux1-dev-fp8; scenario differences live in steps, flux guidance,
 * canvas size and the downstream LoRA plan.
 */
export function resolveImageGenerationRoute(input: {
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
  sceneText?: string;
  sceneSemantics?: ImageSceneSemantics;
  /** Quick preview mode: minimal steps for fast companion drafts */
  turbo?: boolean;
  /** @deprecated ignored — retained for caller compatibility. Routing is FLUX-only. */
  specialistModelsReady?: boolean;
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const category: CompanionCategory = input.category === 'anime' ? 'female' : input.category || 'female';
  const semantics = input.sceneSemantics || classifyImageScene(input.sceneText || '', category);
  const complexScene = isComplexAdultScene(semantics);
  const checkpoint = env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors');
  const nsfw = intensity >= 3;

  // ─── Turbo preview mode ───────────────────────────────────────────────────
  // Quick draft for companion chat: 8 steps produces a recognizable image in
  // ~3s instead of ~8s. Used for "typing…" previews and pool warm-up only.
  if (input.surface === 'companion' && input.turbo && !nsfw && !complexScene) {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: 8,
      fluxGuidance: 2.5,
      width: 832,
      height: 1216,
      presetId: 'flux-turbo',
      reason: 'Turbo preview: minimal steps for a fast companion draft.',
    }, category, renderStyle);
  }

  // ─── 2D / Anime style ─────────────────────────────────────────────────────
  // FLUX + anime LoRA (rdanimefluxv1rapid) downstream; higher steps keep
  // linework and stylized anatomy coherent.
  if (input.surface === 'companion' && renderStyle === '2d') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: nsfw ? 28 : 26,
      fluxGuidance: nsfw ? 4.0 : 3.5,
      width: 832,
      height: 1216,
      presetId: complexScene ? 'flux-2d-multi-control' : 'flux-2d-portrait',
      reason: complexScene
        ? 'Multi-character 2D art uses the high-step FLUX anime preset.'
        : '2D art uses the FLUX anime portrait preset with the anime LoRA.',
    }, category, renderStyle);
  }

  // ─── 3D render style ──────────────────────────────────────────────────────
  if (input.surface === 'companion' && renderStyle === '3d') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: nsfw ? 28 : 26,
      fluxGuidance: nsfw ? 4.0 : 3.5,
      width: 896,
      height: 1152,
      presetId: complexScene ? 'flux-3d-multi-control' : 'flux-3d-portrait',
      reason: '3D companion rendering uses FLUX with the 3D render LoRA.',
    }, category, renderStyle);
  }

  // ─── Transgender anatomy ──────────────────────────────────────────────────
  // Dedicated preset: the MTF LoRA needs stable mixed anatomy, so both SFW
  // and NSFW get the wider canvas; NSFW adds steps and guidance.
  if (input.surface === 'companion' && category === 'transgender') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: nsfw ? 28 : 24,
      fluxGuidance: nsfw ? 4.0 : 3.5,
      width: 896,
      height: 1152,
      presetId: nsfw
        ? complexScene ? 'flux-trans-composition' : 'flux-trans-adult'
        : 'flux-trans-portrait',
      reason: 'Transgender anatomy uses the FLUX pipeline with the MTF LoRA.',
    }, category, renderStyle);
  }

  // ─── Adult / NSFW anatomy (realistic female / male) ───────────────────────
  if (input.surface === 'companion' && nsfw) {
    const highControl = semantics.powerDynamic === 'sm' || semantics.pairing === 'group_4i';
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: highControl || complexScene ? 30 : 28,
      fluxGuidance: 4.0,
      width: 896,
      height: 1152,
      presetId: highControl ? 'flux-adult-composition-control' : complexScene ? 'flux-adult-pair' : 'flux-adult-portrait',
      reason: 'Explicit adult anatomy uses the high-step FLUX pipeline with NSFW LoRAs.',
    }, category, renderStyle);
  }

  // ─── Default: FLUX SFW companion / product ────────────────────────────────
  return fluxRoute({
    surface: input.surface,
    checkpoint,
    steps: 24,
    fluxGuidance: 3.5,
    width: input.surface === 'companion' ? 832 : 1024,
    height: input.surface === 'companion' ? 1216 : 1024,
    presetId: input.surface === 'companion' ? 'flux-portrait-sfw' : `flux-${input.surface}-product`,
    reason: `${input.surface} generation uses the unified FLUX pipeline.`,
  }, category, renderStyle);
}
