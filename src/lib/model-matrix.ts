/**
 * Model Matrix — 生图模块多底模路由决策层
 *
 * 替代旧的"全站 FLUX 单底模"策略：按 题材 × 风格 × NSFW 强度 输出完整的
 * 生成计划（端点 / 底模 / LoRA 候选 / 采样参数）。
 *
 *   写实女/男/跨 (realistic)  → pony 家族  ponyRealism_V22（LoRA slider 分化三题材）
 *   二次元 (2d)               → illustrious 家族 waiMatureIllustrious_v20（danbooru tags）
 *   精品写实 / turbo / 3D / 产品资产 → FLUX 精品层（保留现状，可降级）
 *
 * 总闸：`RUNPOD_SDXL_MODELS_READY=true` 且 `RUNPOD_ENDPOINT_ID_SDXL` 已配置
 * 时矩阵生效；任一条件不满足全部 fail-open 回 FLUX，行为与重构前一致。
 * LoRA 候选仅是推荐清单，下游 resolveModelLoraPlan() 仍按卷清单白名单复核。
 */

import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageSurface } from '@/lib/image-generation-routing';

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
}

// ─── 总闸 ───────────────────────────────────────────────────

/** 矩阵总闸：SDXL 底模包已在 worker 卷上安装并验收。 */
export function isSdxlMatrixReady(): boolean {
  return process.env.RUNPOD_SDXL_MODELS_READY?.trim().toLowerCase() === 'true';
}

/** SDXL 生产端点已配置（RUNPOD_ENDPOINT_ID_SDXL）。 */
export function isSdxlMatrixEndpointConfigured(): boolean {
  return Boolean(process.env.RUNPOD_ENDPOINT_ID_SDXL?.trim());
}

/** 矩阵实际生效 = 总闸开启 且 端点已配置；否则全链路 fail-open 回 FLUX。 */
export function isSdxlMatrixActive(): boolean {
  return isSdxlMatrixReady() && isSdxlMatrixEndpointConfigured();
}

// ─── 底模 / LoRA 清单（env 可覆盖） ─────────────────────────

/** 写实旗舰（女/男/跨靠 LoRA slider 分化）。已验证生产资产，见 cd2-models.txt。 */
export function realisticCheckpoint(): string {
  return process.env.RUNPOD_PONY_CHECKPOINT?.trim() || 'ponyRealism_V22.safetensors';
}

/** 二次元旗舰（danbooru tag 提示词协议）。 */
export function animeCheckpoint(): string {
  return process.env.RUNPOD_ILLUSTRIOUS_CHECKPOINT?.trim() || 'waiMatureIllustrious_v20.safetensors';
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
  /** premium = FLUX 精品层（差异化定价，上线前确认） */
  tier?: 'standard' | 'premium';
  /** 快速草稿（聊天 typing 预览） */
  turbo?: boolean;
  /** 复杂多人/高控制场景（+2 步采样预算） */
  sceneComplex?: boolean;
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
  });

  // ── 总闸未开 / 端点未配置 → 全站 FLUX（fail-open，与重构前行为一致） ──
  if (!isSdxlMatrixActive()) {
    return fluxPlan('SDXL matrix gate closed — unified FLUX pipeline.');
  }
  // ── premium 精品层与 turbo 草稿保留 FLUX ──
  if (input.tier === 'premium') {
    return fluxPlan('Premium tier stays on the FLUX boutique layer.');
  }
  if (input.turbo) {
    return fluxPlan('Turbo drafts stay on the FLUX fast path.');
  }
  // ── 产品类资产（道具/广告）与 3D 渲染：LoRA 生态只在 FLUX 侧 ──
  if (input.surface === 'prop' || input.surface === 'advert') {
    return fluxPlan(`${input.surface} product assets stay on FLUX.`);
  }
  if (renderStyle === '3d') {
    return fluxPlan('3D renders stay on FLUX (3D LoRA only exists there).');
  }

  // ── 二次元 → Illustrious 旗舰 ──
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
    };
  }

  // ── 写实女/男/跨（companion / outfit）→ ponyRealism ──
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
  };
}
