/**
 * SDXL 基础工作流构建器（模型矩阵生产端点 runpod-sdxl-pro）。
 *
 * 与 runpod.ts 的 buildFluxWorkflow 保持同构的节点 ID 布局，方便排障对照：
 *   1 CheckpointLoaderSimple → 2 pos CLIPTextEncode → 3 neg CLIPTextEncode
 *   4 EmptyLatentImage → 5 KSampler → 6 VAEDecode → 7 SaveImage
 *   LoRA 栈 14+（≤4）、CLIPSetLastLayer 20、img2img 11/12/13
 * 增强能力（ControlNet / FaceDetailer / 高清放大 / FaceID 身份锁）由
 * enhance-blocks.ts 的组合式节点块在此图上追加，节点 ID 段互不冲突：
 *   ControlNet 40-46、FaceDetailer 50-54、Upscale 60-66、FaceID 70-74。
 */

import { logger } from '@/lib/logger';
import { validateModelLoraName } from '@/lib/model-lora-routing';

export type SdxlModelFamily = 'sdxl' | 'pony' | 'illustrious';

export interface SdxlWorkflowOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  /** KSampler CFG（SDXL 系典型 5-7；FLUX 恒 1，此处不适用） */
  cfg?: number;
  seed?: number;
  sampler_name?: string;
  scheduler?: string;
  clip_skip?: number;
  batch_size?: number;
  /** Checkpoint 文件名（worker 卷上实际存在的文件名） */
  ckpt_name?: string;
  /** LoRA 栈（≤4，按 model_family 白名单校验，缺失项跳过并告警） */
  loras?: Array<{ name: string; strength_model?: number; strength_clip?: number }>;
  model_family?: SdxlModelFamily;
  /** img2img 输入图（worker 本地文件名或 LoadImage 可解析路径） */
  input_image?: string;
  denoising_strength?: number;
  filename_prefix?: string;
}

export interface SdxlWorkflowRefs {
  /** 当前 MODEL 输出链头（LoRA 栈 / 身份块会改写） */
  modelRef: [string, number];
  /** 当前正向条件链头（ControlNet 块会改写） */
  positiveRef: [string, number];
  /** 当前负向条件链头（ControlNet 块会改写） */
  negativeRef: [string, number];
  /** CLIP 输出（CLIPSetLastLayer 或最后一个 LoRA） */
  clipRef: [string, number];
  /** VAE 输出（CheckpointLoader 第 3 口） */
  vaeRef: [string, number];
}

export interface SdxlWorkflowContext {
  graph: Record<string, Record<string, unknown>>;
  refs: SdxlWorkflowRefs;
  /** KSampler 节点 id（增强块改写 model / conditioning 输入用） */
  ksamplerId: string;
  /** 当前最终 IMAGE 输出节点 id（SaveImage 消费；增强块逐步推进） */
  imageOutId: string;
  /** 采样参数快照（FaceDetailer / refine 二段采样复用） */
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  width: number;
  height: number;
}

/** SDXL 通用负向提示词（二次元家族额外加动漫坏解剖项）。 */
export function sdxlDefaultNegative(family: SdxlModelFamily): string {
  const base = 'blurry, low quality, deformed, disfigured, watermark, text, signature, jpeg artifacts';
  if (family === 'illustrious') {
    return `${base}, lowres, bad anatomy, bad hands, extra digits, fewer digits, worst quality, monochrome`;
  }
  return `${base}, bad anatomy, bad hands, extra fingers, plastic skin, oversaturated`;
}

/**
 * 构建 SDXL 基础链（txt2img / img2img 自动分流）。
 * 返回可被 enhance-blocks 继续追加节点的工作流上下文。
 */
export function buildSdxlWorkflow(opts: SdxlWorkflowOptions): SdxlWorkflowContext {
  const family: SdxlModelFamily = opts.model_family || 'sdxl';
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const width = opts.width ?? 832;
  const height = opts.height ?? 1216;
  const steps = Math.max(opts.steps ?? 26, 8);
  const cfg = Math.min(Math.max(opts.cfg ?? 6.0, 2.0), 10.0);
  const sampler = opts.sampler_name || 'dpmpp_2m_sde';
  const scheduler = opts.scheduler || 'karras';
  const batchSize = Math.min(4, Math.max(1, Math.floor(opts.batch_size ?? 1)));
  const ckpt = opts.ckpt_name || 'ponyRealism_V22.safetensors';

  const promptText = String(opts.prompt || '').trim();
  if (!promptText) {
    throw new Error('buildSdxlWorkflow: empty prompt');
  }
  const rawNeg = String(opts.negativePrompt ?? '').trim() || sdxlDefaultNegative(family);
  const negText = rawNeg.slice(0, 1200);

  // ── LoRA 栈（≤4，白名单校验；缺失项跳过并告警） ──
  const loraStack = (opts.loras || [])
    .map((item) => {
      const validated = validateModelLoraName(family, item.name);
      if (!validated.name) {
        logger.warn('[sdxl-workflow] skipping LoRA not on volume inventory', {
          requested: item.name,
          family,
          reason: validated.reason,
        });
        return null;
      }
      return { ...item, name: validated.name };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 4);

  const graph: Record<string, Record<string, unknown>> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: ckpt },
    },
  };

  const loraNodes: Record<string, Record<string, unknown>> = {};
  loraStack.forEach((item, index) => {
    const id = String(14 + index);
    const previousId = index === 0 ? '1' : String(14 + index - 1);
    loraNodes[id] = {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: item.name,
        strength_model: item.strength_model ?? 0.7,
        strength_clip: item.strength_clip ?? item.strength_model ?? 0.7,
        model: [previousId, 0],
        clip: [previousId, 1],
      },
    };
  });
  Object.assign(graph, loraNodes);

  const lastLoraNodeId = loraStack.length ? String(14 + loraStack.length - 1) : '1';
  const clipSkip = Math.min(2, Math.max(1, Math.round(opts.clip_skip || 2)));
  if (clipSkip > 1) {
    graph['20'] = {
      class_type: 'CLIPSetLastLayer',
      inputs: { clip: [lastLoraNodeId, 1], stop_at_clip_layer: -clipSkip },
    };
  }

  const modelRef: [string, number] = [lastLoraNodeId, 0];
  const clipRef: [string, number] = clipSkip > 1 ? ['20', 0] : [lastLoraNodeId, 1];
  const vaeRef: [string, number] = ['1', 2];

  graph['2'] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: promptText, clip: clipRef },
  };
  graph['3'] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: negText, clip: clipRef },
  };

  // img2img：LoadImage → ImageScale → VAEEncode（与 buildFluxWorkflow 同 ID 布局）
  if (opts.input_image) {
    graph['11'] = { class_type: 'LoadImage', inputs: { image: opts.input_image } };
    graph['12'] = {
      class_type: 'ImageScale',
      inputs: { image: ['11', 0], upscale_method: 'lanczos', width, height, crop: 'disabled' },
    };
    graph['13'] = { class_type: 'VAEEncode', inputs: { pixels: ['12', 0], vae: vaeRef } };
  } else {
    graph['4'] = {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: batchSize },
    };
  }

  graph['5'] = {
    class_type: 'KSampler',
    inputs: {
      seed,
      steps,
      cfg,
      sampler_name: sampler,
      scheduler,
      denoise: opts.input_image ? (opts.denoising_strength ?? 0.55) : 1.0,
      model: modelRef,
      positive: ['2', 0],
      negative: ['3', 0],
      latent_image: opts.input_image ? ['13', 0] : ['4', 0],
    },
  };
  graph['6'] = { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: vaeRef } };
  graph['7'] = {
    class_type: 'SaveImage',
    inputs: { filename_prefix: opts.filename_prefix || 'soulmate', images: ['6', 0] },
  };

  return {
    graph,
    refs: { modelRef, positiveRef: ['2', 0], negativeRef: ['3', 0], clipRef, vaeRef },
    ksamplerId: '5',
    imageOutId: '6',
    seed,
    steps,
    cfg,
    sampler,
    scheduler,
    width,
    height,
  };
}

/** 取最终 ComfyUI API 工作流（增强块追加完成后调用）。 */
export function finalizeSdxlWorkflow(ctx: SdxlWorkflowContext): Record<string, unknown> {
  return ctx.graph;
}
