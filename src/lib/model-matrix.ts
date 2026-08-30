/**
 * Model Matrix — 生图模块多底模路由决策层
 *
 * 替代旧的"全站 FLUX 单底模"策略：按 题材 × 风格 × NSFW 强度 输出完整的
 * 生成计划（端点 / 底模 / LoRA 候选 / 采样参数）。
 *
 *   写实女/男/跨 (realistic)  → pony 家族  ponyRealism_V22（LoRA slider 分化三题材）
 *   二次元 (2d)               → illustrious 家族 waiMatureIllustrious_v20（danbooru tags）
 *   精品写实 / 3D / 产品资产（仅 SFW） → FLUX 精品层（保留现状，可降级）
 *   NSFW（强度 ≥3）           → 硬路由 SDXL 双通道，禁止落 FLUX
 *
 * 总闸：`RUNPOD_SDXL_MODELS_READY=true` 且 `RUNPOD_ENDPOINT_ID_SDXL` 已配置
 * 时矩阵生效；任一条件不满足全部 fail-open 回 FLUX，行为与重构前一致。
 * LoRA 候选仅是推荐清单，下游 resolveModelLoraPlan() 仍按卷清单白名单复核。
 */

import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageSurface } from '@/lib/image-generation-routing';
import {
  familyNegativePrompt,
  familyQualityEnhancers,
  PROMPT_PROTOCOL_BY_FAMILY,
  resolvePromptSubject,
  type PromptProtocolId,
} from '@/lib/prompt/prompt-protocols';

export type ModelMatrixEndpointKey = 'runpod-sdxl-pro' | 'runpod-flux';
export type ModelMatrixFamily = 'flux' | 'pony' | 'illustrious';

export interface ModelPlan {
  endpointKey: ModelMatrixEndpointKey;
  modelFamily: ModelMatrixFamily;
  checkpoint: string;
  /** 推荐 LoRA 候选（下游 resolveModelLoraPlan 按卷清单复核后才真正加载） */
  loras: string[];
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  clipSkip: 1 | 2;
  width: number;
  height: number;
  reason: string;
  /** 提示词协议（家族原生，禁止跨族混用） */
  promptProtocol: PromptProtocolId;
  /** 家族×题材负向（含 BLOCKED 与 NSFW 去打码） */
  negativePrompt: string;
  /** 质量增强默认（ADetailer 修脸 / 放大去糊） */
  qualityEnhancers: { adetailer: boolean; upscale: boolean };
}

// ─── 总闸 ───────────────────────────────────────────────────

/** 矩阵总闸：SDXL 底模包已在 worker 卷上安装并验收。 */
export function isSdxlMatrixReady(): boolean {
  return process.env.RUNPOD_SDXL_MODELS_READY?.trim().toLowerCase() === 'true';
}

/** SDXL 生产端点已配置（通用 RUNPOD_ENDPOINT_ID_SDXL 或家族专用 PONY/ILLUSTRIOUS 任一）。 */
export function isSdxlMatrixEndpointConfigured(): boolean {
  return Boolean(
    process.env.RUNPOD_ENDPOINT_ID_SDXL?.trim() ||
    process.env.RUNPOD_ENDPOINT_ID_SDXL_PONY?.trim() ||
    process.env.RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS?.trim(),
  );
}

/** 矩阵实际生效 = 总闸开启 且 端点已配置；否则全链路 fail-open 回 FLUX。 */
export function isSdxlMatrixActive(): boolean {
  return isSdxlMatrixReady() && isSdxlMatrixEndpointConfigured();
}

// ─── 底模 / LoRA 清单（env 可覆盖） ─────────────────────────

/** 写实旗舰（女/男/跨靠 LoRA slider 分化）。已验证生产资产，见 cd2-models.txt。 */
export function realisticCheckpoint(): string {
  // 兼容两种 env 命名：代码约定 RUNPOD_PONY_CHECKPOINT / 生产已配 RUNPOD_CHECKPOINT_PONY。
  return process.env.RUNPOD_PONY_CHECKPOINT?.trim() || process.env.RUNPOD_CHECKPOINT_PONY?.trim() || 'ponyRealism_V22.safetensors';
}

/** 二次元旗舰（danbooru tag 提示词协议）。 */
export function animeCheckpoint(): string {
  return process.env.RUNPOD_ILLUSTRIOUS_CHECKPOINT?.trim() || process.env.RUNPOD_CHECKPOINT_ILLUSTRIOUS?.trim() || 'waiMatureIllustrious_v20.safetensors';
}

/** FLUX 精品层底模。 */
export function premiumCheckpoint(): string {
  return process.env.RUNPOD_FLUX_CHECKPOINT?.trim() || 'flux1-dev-fp8.safetensors';
}

type RealisticCategory = 'female' | 'male' | 'transgender';

/** pony 写实家族按题材的 LoRA slider 计划（与 model-lora-routing 默认清单一致）。 */
const PONY_MATRIX_LORAS: Record<RealisticCategory, string[]> = {
  female: ['pony_detailifier_v5.safetensors', 'pony_mature_female_slider_v2.safetensors'],
  male: ['pony_detailifier_v5.safetensors', 'pony_gender_transition_slider.safetensors'],
  transgender: [
    'pony_detailifier_v5.safetensors',
    'pony_gender_transition_slider.safetensors',
    'pony_futa_style.safetensors',
  ],
};

/** illustrious 二次元家族的 LoRA 计划。 */
function illustriousMatrixLoras(nsfw: boolean): string[] {
  return nsfw
    ? ['AddMicroDetails_Illustrious_v6.safetensors', 'illustrious_nsfw_slider_v1.safetensors']
    : ['AddMicroDetails_Illustrious_v6.safetensors'];
}

// ─── 决策入口 ───────────────────────────────────────────────

/**
 * 解析一次生图请求的完整模型计划。
 * 纯函数（只读 env），可在 admin 路由矩阵预览中直接复用。
 */
export function resolveModelPlan(input: {
  surface: ImageSurface;
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwLevel?: NsfwIntensity;
  /** premium = FLUX 精品层（仅 SFW；NSFW 硬路由 SDXL） */
  tier?: 'standard' | 'premium';
  /** 复杂多人/高控制场景（+2 步采样预算） */
  sceneComplex?: boolean;
  /**
   * 矩阵总闸显式 override（客户端 bundle 读不到服务端 env 时使用：
   * 由服务端 API 把 RUNPOD_SDXL_MODELS_READY 旗标随响应带给前端）。
   * 未提供时回读 env（isSdxlMatrixActive()）。
   */
  matrixActive?: boolean;
}): ModelPlan {
  const renderStyle = input.renderStyle || 'realistic';
  const nsfwLevel = input.nsfwLevel || 1;
  const category: RealisticCategory =
    input.category === 'male' ? 'male' : input.category === 'transgender' ? 'transgender' : 'female';
  const nsfw = nsfwLevel >= 3;
  const complex = input.sceneComplex === true;

  const fluxPlan = (reason: string): ModelPlan => ({
    endpointKey: 'runpod-flux',
    modelFamily: 'flux',
    checkpoint: premiumCheckpoint(),
    loras: [],
    steps: nsfw ? 28 : 24,
    cfg: 1,
    sampler: 'euler',
    scheduler: 'simple',
    clipSkip: 1,
    width: 832,
    height: 1216,
    reason,
    promptProtocol: PROMPT_PROTOCOL_BY_FAMILY.flux,
    negativePrompt: familyNegativePrompt('flux', resolvePromptSubject(category, renderStyle), nsfw),
    qualityEnhancers: familyQualityEnhancers('flux', resolvePromptSubject(category, renderStyle)),
  });

  // ── 总闸未开 / 端点未配置 → 全站 FLUX（fail-open，与重构前行为一致） ──
  const matrixActive = input.matrixActive ?? isSdxlMatrixActive();
  if (!matrixActive) {
    return fluxPlan('SDXL matrix gate closed — unified FLUX pipeline.');
  }

  // ── NSFW 硬路由 SDXL：FLUX NSFW 稳定性差，premium/产品资产也收敛到 ──
  // ── SDXL 双通道。3D style 已从产品面移除 ──
  // (no effectiveStyle needed; renderStyle only takes 'realistic' | '2d' now)

  // ── premium 精品层 / 产品资产（仅 SFW）保留 FLUX ──
  if (!nsfw) {
    if (input.tier === 'premium') {
      return fluxPlan('Premium tier stays on the FLUX boutique layer.');
    }
    if (input.surface === 'prop' || input.surface === 'advert') {
      return fluxPlan(`${input.surface} product assets stay on FLUX.`);
    }
  }

  // ── 二次元 → Illustrious 旗舰（SFW/NSFW） ──
  if (renderStyle === '2d') {
    return {
      endpointKey: 'runpod-sdxl-pro',
      modelFamily: 'illustrious',
      checkpoint: animeCheckpoint(),
      loras: illustriousMatrixLoras(nsfw),
      steps: (nsfw ? 28 : 26) + (complex ? 2 : 0),
      cfg: nsfw ? 6.0 : 5.5,
      sampler: 'dpmpp_2m_sde',
      scheduler: 'karras',
      clipSkip: 2,
      width: 832,
      height: 1216,
      reason: 'Anime uses the Illustrious flagship with danbooru tag prompts.',
      promptProtocol: PROMPT_PROTOCOL_BY_FAMILY.illustrious,
      negativePrompt: familyNegativePrompt('illustrious', resolvePromptSubject(category, '2d'), nsfw),
      qualityEnhancers: familyQualityEnhancers('illustrious', resolvePromptSubject(category, '2d')),
    };
  }

  // ── 写实女/男/跨（companion / outfit，SFW/NSFW）→ ponyRealism ──
  return {
    endpointKey: 'runpod-sdxl-pro',
    modelFamily: 'pony',
    checkpoint: realisticCheckpoint(),
    loras: PONY_MATRIX_LORAS[category],
    steps: (nsfw ? 30 : 26) + (complex ? 2 : 0),
    cfg: nsfw ? 6.5 : 6.0,
    sampler: 'dpmpp_2m_sde',
    scheduler: 'karras',
    clipSkip: 2,
    // 跨性别混合解剖需要更宽画布（沿用旧 FLUX trans 分支的尺寸决策）
    width: category === 'transgender' ? 896 : 832,
    height: category === 'transgender' ? 1152 : 1216,
    reason: `Realistic ${category} uses ponyRealism with category LoRA sliders.`,
    promptProtocol: PROMPT_PROTOCOL_BY_FAMILY.pony,
    negativePrompt: familyNegativePrompt('pony', resolvePromptSubject(category, renderStyle), nsfw),
    qualityEnhancers: familyQualityEnhancers('pony', resolvePromptSubject(category, renderStyle)),
  };
}
