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
export type ImageModelFamily = 'flux' | 'pony' | 'illustrious';

const env = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

/**
 * FLUX endpoint — 统一 ComfyUI 生图端点（真实生产端点 e40cgshtouocg8）。
 * 优先 RUNPOD_ENDPOINT_ID_FLUX，回读主端点 RUNPOD_ENDPOINT_ID。
 */
export const FLUX_ENDPOINT_ID = env('RUNPOD_ENDPOINT_ID_FLUX', env('RUNPOD_ENDPOINT_ID', 'e40cgshtouocg8'));

/** 兼容别名：统一 ComfyUI 端点（旧引用使用此名）。 */
export const UNIFIED_COMFY_ENDPOINT = FLUX_ENDPOINT_ID;

/**
 * SDXL Pony endpoint (RTX 3090) - Fast anime & western realistic
 */
export const SDXL_PONY_ENDPOINT_ID = env('RUNPOD_ENDPOINT_ID_SDXL_PONY', '');

/**
 * SDXL Illustrious endpoint (RTX 3090) - Illustration & fantasy art
 */
export const SDXL_ILLUSTRIOUS_ENDPOINT_ID = env('RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS', '');

/**
 * Per-family SDXL endpoint resolution (read at call time so tests / env
 * overrides stay effective): prefer the family-specific env, fall back to
 * the legacy generic RUNPOD_ENDPOINT_ID_SDXL (single-endpoint deployments).
 */
export function resolveSdxlEndpoint(family: 'pony' | 'illustrious'): string {
  const specific = family === 'pony'
    ? (process.env.RUNPOD_ENDPOINT_ID_SDXL_PONY?.trim() || '')
    : (process.env.RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS?.trim() || '');
  return specific || env('RUNPOD_ENDPOINT_ID_SDXL', '');
}

/** Any SDXL production endpoint configured (NSFW hard-route gate). */
export function anySdxlEndpointConfigured(): boolean {
  return Boolean(resolveSdxlEndpoint('pony') || resolveSdxlEndpoint('illustrious'));
}

/** Active SDXL gate - both endpoints must be configured for matrix to work. */
export function sdxlMatrixReady(): boolean {
  return process.env.RUNPOD_SDXL_MODELS_READY?.trim().toLowerCase() === 'true';
}

/** All SDXL checkpoints available (env var list from model library). */
export function sdxlCheckpointInventory(): Set<string> | null {
  const raw = process.env.RUNPOD_SDXL_CHECKPOINTS?.trim();
  if (!raw) return null;
  return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

/** True when checkpoint exists in SDXL inventory. */
export function isSdxlCheckpointAvailable(name: string): boolean {
  const inventory = sdxlCheckpointInventory();
  if (!inventory) return true;
  return inventory.has(name.trim().toLowerCase());
}

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
    endpointId: FLUX_ENDPOINT_ID,
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
      styleEnv: renderStyle === '2d' ? 'RUNPOD_FLUX_2D_LORAS' : undefined,
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
 * SFW/NSFW 正常方案分离：
 *  - NSFW（强度 ≥3）硬路由 SDXL（写实→ponyRealism，二次元→Illustrious），
 *    禁止落 FLUX（FLUX NSFW 稳定性差）；SDXL 端点缺失时直接抛错（fail-closed）。
 *  - SFW：矩阵总闸开启时写实/二次元走 SDXL，premium/3D/产品资产保留 FLUX；
 *    总闸关闭时 fail-open 回 FLUX。
 */
export function resolveImageGenerationRoute(input: {
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
  sceneText?: string;
  sceneSemantics?: ImageSceneSemantics;
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
  /**
   * 显式模型族（Studio 手动模型选择）。指定后绕过自动题材路由：
   *  - 'flux'        → 跳过 SDXL 矩阵，强制 FLUX 精品层分支
   *  - 'pony'        → 强制 SDXL·ponyRealism（矩阵总闸/端点缺失时 fail-open 回 FLUX）
   *  - 'illustrious' → 强制 SDXL·Illustrious（同上）
   */
  familyOverride?: ImageModelFamily;
}): ImageGenerationRoute {
  const renderStyle = input.renderStyle || 'realistic';
  const intensity = input.nsfwIntensity || 1;
  const category: CompanionCategory = input.category === 'anime' ? 'female' : input.category || 'female';
  const semantics = input.sceneSemantics || classifyImageScene(input.sceneText || '', category);
  const complexScene = isComplexAdultScene(semantics);
  const nsfw = intensity >= 3;

  // ─── NSFW 硬路由：一律落 SDXL，禁止落 FLUX ──────────────────────────────
  // FLUX NSFW 稳定性差（裸 flux1-dev-fp8 无 NSFW LoRA 生态），本站 NSFW 统一
  // 走 SDXL 双通道（写实→ponyRealism / 二次元→Illustrious）。SDXL 端点缺失
  // 时 fail-closed 抛错，而不是把 NSFW 偷偷降级回 FLUX。
  if (nsfw) {
    const nsfwPlan = resolveModelPlan({
      surface: input.surface,
      category,
      // NSFW 时 3D/产品资产也收敛到 SDXL 双通道（SDXL 无 3D LoRA 生态）
      renderStyle: renderStyle === '2d' ? '2d' : 'realistic',
      nsfwLevel: intensity,
      sceneComplex: complexScene,
      matrixActive: true,
    });
    const familyEndpoint = input.sdxlEndpointId?.trim()
      || resolveSdxlEndpoint(nsfwPlan.modelFamily === 'illustrious' ? 'illustrious' : 'pony');
    if (!familyEndpoint) {
      throw new Error(
        'NSFW generation requires the SDXL endpoint (RUNPOD_ENDPOINT_ID_SDXL). ' +
        'FLUX fallback for NSFW is disabled by policy.',
      );
    }
    return sdxlMatrixRoute(nsfwPlan, input.surface, category, nsfw, familyEndpoint);
  }

  // ─── SDXL 模型矩阵（RUNPOD_SDXL_MODELS_READY 总闸，仅 SFW 到达这里） ─────
  // 总闸关闭 / 端点未配置 / premium / 3D / 产品资产时 plan 自动落回
  // 'runpod-flux'，继续走下方保留的 FLUX 分支（行为与重构前一致）。
  // familyOverride='flux' 时整个矩阵分支跳过（手动锁定 FLUX）；
  // 'pony'/'illustrious' 时用对应 renderStyle 强制矩阵计划。
  const forceFamily = input.familyOverride;
  const matrixActive = input.matrixActive ?? input.specialistModelsReady;
  const matrixPlan = forceFamily === 'flux'
    ? null
    : resolveModelPlan({
        surface: input.surface,
        category,
        renderStyle: forceFamily === 'illustrious' ? '2d' : forceFamily === 'pony' ? 'realistic' : renderStyle,
        nsfwLevel: intensity,
        sceneComplex: complexScene,
        matrixActive,
      });
  if (matrixPlan?.endpointKey === 'runpod-sdxl-pro') {
    const familyEndpoint = input.sdxlEndpointId?.trim()
      || resolveSdxlEndpoint(matrixPlan.modelFamily === 'illustrious' ? 'illustrious' : 'pony');
    // 端点缺失时 fail-open 回 FLUX（与 env 总闸语义一致）。
    if (!familyEndpoint) {
      return fluxRoute({
        surface: input.surface,
        checkpoint: env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors'),
        steps: 28,
        fluxGuidance: 3.5,
        width: 1024,
        height: 1536,
        presetId: 'flux-matrix-failopen',
        reason: 'SDXL matrix gate open but no SDXL endpoint — fail-open to FLUX.',
      }, category, renderStyle, nsfw);
    }
    return sdxlMatrixRoute(matrixPlan, input.surface, category, nsfw, familyEndpoint);
  }

  // Unified FLUX strategy (SFW only — NSFW is hard-routed to SDXL above):
  // every scenario uses the same verified dev-fp8 checkpoint.
  const checkpoint = env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors');

  // ─── 2D / Anime style (SFW) ───────────────────────────────────────────────
  // FLUX + anime LoRA (rdanimefluxv1rapid) downstream; higher steps keep
  // linework and stylized anatomy coherent.
  if (input.surface === 'companion' && renderStyle === '2d') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: 28,
      fluxGuidance: 3.5,
      width: 1024,
      height: 1536,
      presetId: complexScene ? 'flux-2d-multi-control' : 'flux-2d-portrait',
      reason: complexScene
        ? 'Multi-character 2D art uses the high-step FLUX anime preset.'
        : '2D art uses the FLUX anime portrait preset with the anime LoRA.',
    }, category, renderStyle, nsfw);
  }

  // 3D render style removed (2026-08); any 3d request falls through to the
  // default FLUX SFW branch below.

  // ─── Transgender anatomy (SFW; NSFW trans is hard-routed to SDXL pony) ────
  if (input.surface === 'companion' && category === 'transgender') {
    return fluxRoute({
      surface: input.surface,
      checkpoint,
      steps: 28,
      fluxGuidance: 3.5,
      width: 1024,
      height: 1472,
      presetId: 'flux-trans-portrait',
      reason: 'Transgender anatomy uses the FLUX pipeline with the MTF LoRA.',
    }, category, renderStyle, nsfw);
  }

  // ─── Default: FLUX SFW companion / product ────────────────────────────────
  return fluxRoute({
    surface: input.surface,
    checkpoint,
    steps: 28,
    fluxGuidance: 3.5,
    width: 1024,
    height: input.surface === 'companion' ? 1536 : 1024,
    presetId: input.surface === 'companion' ? 'flux-portrait-sfw' : `flux-${input.surface}-product`,
    reason: `${input.surface} generation uses the unified FLUX pipeline.`,
  }, category, renderStyle, nsfw);
}
