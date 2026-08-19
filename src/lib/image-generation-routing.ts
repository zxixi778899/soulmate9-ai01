import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { classifyImageScene, isComplexAdultScene, type ImageSceneSemantics } from '@/lib/image-scene-semantics';
import { resolveModelPlan, type ModelPlan } from '@/lib/model-matrix';
import {
  familyNegativePrompt,
  familyQualityEnhancers,
  PROMPT_PROTOCOL_BY_FAMILY,
  resolvePromptSubject,
  type PromptProtocolId,
} from '@/lib/prompt/prompt-protocols';

export type ImageSurface = 'companion' | 'outfit' | 'prop' | 'advert';
/**
 * Model families of the generation matrix:
 *  - 'flux'        — FLUX 精品层（premium / turbo / 3D / 产品资产 / 矩阵总闸关闭时的回退）
 *  - 'pony'        — ponyRealism 写实旗舰（女/男/跨靠 LoRA slider 分化）
 *  - 'illustrious' — waiMatureIllustrious 二次元旗舰（danbooru tags）
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
export const UNIFIED_COMFY_ENDPOINT = 'e40cgshtouocg8';

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
  /** 提示词协议（家族原生，禁止跨族混用：flux-natural / pony-tags / illustrious-tags） */
  promptProtocol: PromptProtocolId;
  /** 家族×题材负向（含全局 BLOCKED 与 NSFW 去打码） */
  negativePrompt: string;
  /** 质量增强默认（ADetailer 修脸 / 放大去糊） */
  qualityEnhancers: { adetailer: boolean; upscale: boolean };
  presetId: string;
  reason: string;
  modelDetails:
    | {
        architecture: 'flux-dev';
        precision: 'fp8';
        textEncoder: 't5xxl+clip-l';
        vae: 'ae.safetensors';
        predictionType: 'flow';
      }
    | {
        architecture: 'sdxl';
        precision: 'fp16';
        textEncoder: 'clip-l+clip-g';
        vae: 'built-in';
        predictionType: 'epsilon';
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

/**
 * SDXL 模型矩阵总闸（RUNPOD_SDXL_MODELS_READY）。开启且
 * RUNPOD_ENDPOINT_ID_SDXL 已配置时，resolveImageGenerationRoute 委托
 * resolveModelPlan 把写实/二次元题材路由到 SDXL 生产端点；否则全链路
 * fail-open 回 FLUX。
 */
export function specialistModelsReadyFromEnv(): boolean {
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
  nsfw: boolean,
): ImageGenerationRoute {
  const categoryKey = category === 'anime' ? 'FEMALE' : category.toUpperCase();
  const subject = resolvePromptSubject(category, renderStyle);
  return {
    ...route,
    modelFamily: 'flux',
    promptProtocol: PROMPT_PROTOCOL_BY_FAMILY.flux,
    negativePrompt: familyNegativePrompt('flux', subject, nsfw),
    qualityEnhancers: familyQualityEnhancers('flux', subject),
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

function sdxlMatrixRoute(
  plan: ModelPlan,
  surface: ImageSurface,
  category: CompanionCategory,
  nsfw: boolean,
  endpointId: string,
): ImageGenerationRoute {
  const familyPrefix = plan.modelFamily === 'illustrious' ? 'RUNPOD_ILLUSTRIOUS' : 'RUNPOD_PONY';
  const categoryKey = category === 'anime' ? 'FEMALE' : category.toUpperCase();
  return {
    surface,
    modelFamily: plan.modelFamily,
    endpointId,
    checkpoint: plan.checkpoint,
    sampler: plan.sampler,
    scheduler: plan.scheduler,
    steps: plan.steps,
    cfg: plan.cfg,
    // 非 FLUX 工作流忽略 FluxGuidance；保留字段形状兼容，值取 KSampler cfg。
    fluxGuidance: plan.cfg,
    clipSkip: plan.clipSkip,
    width: plan.width,
    height: plan.height,
    promptProtocol: plan.promptProtocol,
    negativePrompt: plan.negativePrompt,
    qualityEnhancers: plan.qualityEnhancers,
    presetId: `sdxl-${plan.modelFamily}-${nsfw ? 'adult' : surface === 'outfit' ? 'outfit' : 'portrait'}`,
    reason: plan.reason,
    modelDetails: {
      architecture: 'sdxl',
      precision: 'fp16',
      textEncoder: 'clip-l+clip-g',
      vae: 'built-in',
      predictionType: 'epsilon',
    },
    loraPolicy: {
      inventoryEnv: [
        `RUNPOD_INSTALLED_LORAS_${plan.modelFamily.toUpperCase()}`,
        'RUNPOD_INSTALLED_LORAS_SDXL',
      ],
      categoryEnv: `${familyPrefix}_${categoryKey}_LORAS`,
      adultEnv: `${familyPrefix}_NSFW_LORAS`,
      maxLoras: 4,
      maxCombinedStrength: 1.65,
      failClosed: true,
    },
  };
}

/**
 * Resolve generation parameters for the generation model matrix.
 *
 * 矩阵总闸开启（RUNPOD_SDXL_MODELS_READY=true + RUNPOD_ENDPOINT_ID_SDXL）时
 * 委托 resolveModelPlan：写实女/男/跨 → ponyRealism，二次元 → Illustrious；
 * premium/turbo/3D/产品资产及总闸关闭时全部保留 FLUX 精品层分支。
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
  /**
   * 矩阵总闸显式 override。客户端 bundle 读不到服务端 env（非
   * NEXT_PUBLIC_ 变量不会内联），所以服务端 API（如 /api/admin/comfy
   * view=volume）把 RUNPOD_SDXL_MODELS_READY 旗标随响应带给前端，
   * 前端调本函数时显式传入。未提供时回读 env。
   */
  matrixActive?: boolean;
  /** @deprecated 历史名，现作为 matrixActive 别名生效。 */
  specialistModelsReady?: boolean;
  /**
   * SDXL 端点显式 override（同 matrixActive：客户端 env 不可见，
   * 由服务端随响应下发）。未提供时回读 RUNPOD_ENDPOINT_ID_SDXL。
   */
  sdxlEndpointId?: string;
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const category: CompanionCategory = input.category === 'anime' ? 'female' : input.category || 'female';
  const semantics = input.sceneSemantics || classifyImageScene(input.sceneText || '', category);
  const complexScene = isComplexAdultScene(semantics);
  const nsfw = intensity >= 3;

  // ─── SDXL 模型矩阵（RUNPOD_SDXL_MODELS_READY 总闸） ───────────────────────
  // 总闸关闭 / 端点未配置 / premium / turbo / 3D / 产品资产时 plan 自动落回
  // 'runpod-flux'，继续走下方保留的 FLUX 分支（行为与重构前一致）。
  const matrixActive = input.matrixActive ?? input.specialistModelsReady;
  const sdxlEndpointId = input.sdxlEndpointId?.trim() || env('RUNPOD_ENDPOINT_ID_SDXL', '');
  const matrixPlan = resolveModelPlan({
    surface: input.surface,
    category,
    renderStyle,
    nsfwLevel: intensity,
    turbo: input.turbo,
    sceneComplex: complexScene,
    matrixActive,
  });
  if (matrixPlan.endpointKey === 'runpod-sdxl-pro') {
    // 端点缺失时 fail-open 回 FLUX（与 env 总闸语义一致）。
    if (!sdxlEndpointId) {
      return fluxRoute({
        surface: input.surface,
        checkpoint: env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors'),
        steps: nsfw ? 32 : 28,  // ✅ Increased from 28/24
        fluxGuidance: nsfw ? 4.0 : 3.5,
        width: 1024,              // ✅ Increased from 832
        height: 1536,             // ✅ Increased from 1216
        presetId: 'flux-matrix-failopen',
        reason: 'SDXL matrix gate open but no SDXL endpoint — fail-open to FLUX.',
      }, category, renderStyle, nsfw);
    }
    return sdxlMatrixRoute(matrixPlan, input.surface, category, nsfw, sdxlEndpointId);
  }

  // Unified FLUX strategy: every scenario uses the same verified dev-fp8
  // checkpoint. NSFW guidance is controlled by fluxGuidance and step budget,
  // not by switching to an alternative checkpoint.
  const checkpoint = env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors');

  // ─── Turbo preview mode ───────────────────────────────────────────────────
  // Quick draft for companion chat: 8 steps produces a recognizable image in
  // ~3s instead of ~8s. Used for "typing…" previews and pool warm-up only.
  if (input.surface === 'companion' && input.turbo && !nsfw && !complexScene) {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: 8,                 // Keep turbo steps for speed
      fluxGuidance: 2.5,
      width: 640,               // Keep small for preview
      height: 960,
      presetId: 'flux-turbo',
      reason: 'Turbo preview: minimal steps for a fast companion draft.',
    }, category, renderStyle, nsfw);
  }

  // ─── 2D / Anime style ─────────────────────────────────────────────────────
  // FLUX + anime LoRA (rdanimefluxv1rapid) downstream; higher steps keep
  // linework and stylized anatomy coherent.
  if (input.surface === 'companion' && renderStyle === '2d') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: nsfw ? 32 : 28,    // ✅ Increased from 28/26
      fluxGuidance: nsfw ? 4.0 : 3.5,
      width: 1024,              // ✅ Increased from 832
      height: 1536,             // ✅ Increased from 1216
      presetId: complexScene ? 'flux-2d-multi-control' : 'flux-2d-portrait',
      reason: complexScene
        ? 'Multi-character 2D art uses the high-step FLUX anime preset.'
        : '2D art uses the FLUX anime portrait preset with the anime LoRA.',
    }, category, renderStyle, nsfw);
  }

  // ─── 3D render style ──────────────────────────────────────────────────────
  if (input.surface === 'companion' && renderStyle === '3d') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: nsfw ? 32 : 28,    // ✅ Increased from 28/26
      fluxGuidance: nsfw ? 4.0 : 3.5,
      width: 1152,              // ✅ Increased from 896
      height: 1472,             // ✅ Increased from 1152
      presetId: complexScene ? 'flux-3d-multi-control' : 'flux-3d-portrait',
      reason: '3D companion rendering uses FLUX with the 3D render LoRA.',
    }, category, renderStyle, nsfw);
  }

  // ─── Transgender anatomy ──────────────────────────────────────────────────
  // Dedicated preset: the MTF LoRA needs stable mixed anatomy, so both SFW
  // and NSFW get the wider canvas; NSFW adds steps and guidance.
  if (input.surface === 'companion' && category === 'transgender') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: nsfw ? 32 : 28,    // ✅ Increased from 28/24
      fluxGuidance: nsfw ? 4.0 : 3.5,
      width: 1024,              // ✅ Increased from 896
      height: 1472,             // ✅ Increased from 1152
      presetId: nsfw
        ? complexScene ? 'flux-trans-composition' : 'flux-trans-adult'
        : 'flux-trans-portrait',
      reason: 'Transgender anatomy uses the FLUX pipeline with the MTF LoRA.',
    }, category, renderStyle, nsfw);
  }

  // ─── Adult / NSFW anatomy (realistic female / male) ───────────────────────
  if (input.surface === 'companion' && nsfw) {
    const highControl = semantics.powerDynamic === 'sm' || semantics.pairing === 'group_4i';
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: complexScene ? 32 : 30,  // ✅ Increased from 30/28
      fluxGuidance: 4.0,
      width: 1024,               // ✅ Increased from 896
      height: 1472,              // ✅ Increased from 1152
      presetId: highControl ? 'flux-adult-composition-control' : complexScene ? 'flux-adult-pair' : 'flux-adult-portrait',
      reason: 'Explicit adult anatomy uses the high-step FLUX pipeline with NSFW LoRAs.',
    }, category, renderStyle, nsfw);
  }

  // ─── Default: FLUX SFW companion / product ────────────────────────────────
  return fluxRoute({
    surface: input.surface,
    checkpoint,
    steps: 28,                   // ✅ Increased from 24
    fluxGuidance: 3.5,
    width: input.surface === 'companion' ? 1024 : 1024,  // ✅ Increased from 832
    height: input.surface === 'companion' ? 1536 : 1024, // ✅ Increased from 1216
    presetId: input.surface === 'companion' ? 'flux-portrait-sfw' : `flux-${input.surface}-product`,
    reason: `${input.surface} generation uses the unified FLUX pipeline.`,
  }, category, renderStyle, nsfw);
}
