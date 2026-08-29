/**
 * 组合式增强节点块（ControlNet / FaceDetailer / 高清放大 / FaceID 身份锁）。
 *
 * 每个块是独立函数，接收 buildSdxlWorkflow() 产出的工作流上下文并就地追加
 * 节点；节点 ID 段互不冲突（ControlNet 40-46 / FaceDetailer 50-54 /
 * Upscale 60-66 / FaceID 70-74），可按任意组合叠加，单任务内串联完成：
 *   base 生图 → ControlNet(条件注入) → FaceDetailer → 高清放大 → SaveImage
 *
 * 就绪门控复用 comfy-console/enhancer-config 的 env 旗标（RUNPOD_CONTROLNET_READY
 * 等）：未就绪时抛错，由上层 runner 决定跳过该能力或整单失败，绝不在 worker
 * 侧以 value_not_in_list 形式炸掉。
 */

import { assertEnhancersReady } from '@/lib/comfy-console/enhancer-config';
import type { SdxlWorkflowContext } from '@/lib/comfy-builders/sdxl-workflow';

export type ControlNetType = 'openpose' | 'depth';

const envModel = (key: string, fallback: string): string => process.env[key]?.trim() || fallback;

/**
 * Impact-Subpack UltralyticsDetectorProvider 强制按目录枚举模型
 * (bbox/ 或 segm/)。如果 env 变量只填了裸文件名（例如
 * `face_yolov8m.pt`），自动补上 `bbox/` 前缀避免 worker 上
 * `value_not_in_list` 报错。已带前缀的保持不动。
 */
function normalizeAdetailerModelName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('bbox/') || trimmed.startsWith('segm/')) return trimmed;
  return `bbox/${trimmed}`;
}

function patchSaveImage(ctx: SdxlWorkflowContext): void {
  const save = ctx.graph['7'];
  if (save) {
    (save.inputs as Record<string, unknown>).images = [ctx.imageOutId, 0];
  }
}

// ─── ControlNet 姿势/景深控制 ───────────────────────────────

/**
 * 注入 ControlNet 条件（OpenPose 姿势 / Depth 景深）。
 * Aux 预处理 → ControlNetLoader → ControlNetApplyAdvanced 串入正负条件，
 * 并同步改写 KSampler 的 conditioning 输入。
 */
export function applyControlNet(
  ctx: SdxlWorkflowContext,
  opts: { controlImage: string; type: ControlNetType; strength?: number },
): SdxlWorkflowContext {
  assertEnhancersReady({ controlnet: true });
  const strength = Math.min(1, Math.max(0.2, opts.strength ?? 0.8));

  ctx.graph['40'] = {
    class_type: 'LoadImage',
    inputs: { image: opts.controlImage },
  };
  ctx.graph['41'] =
    opts.type === 'openpose'
      ? {
          class_type: 'DWPreprocessor',
          inputs: {
            image: ['40', 0],
            detect_hand: 'enable',
            detect_body: 'enable',
            detect_face: 'enable',
            resolution: 1024,
          },
        }
      : {
          class_type: 'DepthAnythingV2Preprocessor',
          inputs: { image: ['40', 0], resolution: 1024 },
        };
  ctx.graph['42'] = {
    class_type: 'ControlNetLoader',
    inputs: {
      control_net_name:
        opts.type === 'openpose'
          ? envModel('RUNPOD_CONTROLNET_OPENPOSE_MODEL', 'xinsir-openpose-sdxl.safetensors')
          : envModel('RUNPOD_CONTROLNET_DEPTH_MODEL', 'xinsir-depth-sdxl.safetensors'),
    },
  };
  ctx.graph['43'] = {
    class_type: 'ControlNetApplyAdvanced',
    inputs: {
      positive: ctx.refs.positiveRef,
      negative: ctx.refs.negativeRef,
      control_net: ['42', 0],
      image: ['41', 0],
      strength,
      start_percent: 0,
      end_percent: 0.85,
    },
  };

  ctx.refs.positiveRef = ['43', 0];
  ctx.refs.negativeRef = ['43', 1];
  const ksamplerInputs = ctx.graph[ctx.ksamplerId]?.inputs as Record<string, unknown> | undefined;
  if (ksamplerInputs) {
    ksamplerInputs.positive = ctx.refs.positiveRef;
    ksamplerInputs.negative = ctx.refs.negativeRef;
  }
  return ctx;
}

// ─── FaceDetailer 面部修复（Impact Pack，ADetailer 等价） ────

/**
 * Impact Pack FaceDetailer：yolov8m 检测人脸 → 局部重绘（denoise 0.4、
 * feather 5），接在 VAEDecode 之后，产出替换 SaveImage 的输入。
 */
export function applyFaceDetailer(
  ctx: SdxlWorkflowContext,
  opts?: { denoise?: number; feather?: number },
): SdxlWorkflowContext {
  assertEnhancersReady({ adetailer: true });
  const denoise = Math.min(0.6, Math.max(0.2, opts?.denoise ?? 0.4));

  ctx.graph['51'] = {
    class_type: 'UltralyticsDetectorProvider',
    // Impact-Subpack enumerates models with their type prefix (bbox/ or segm/);
    // normalizeAdetailerModelName auto-prepends bbox/ if the env var is bare.
    inputs: { model_name: normalizeAdetailerModelName(envModel('RUNPOD_ADETAILER_MODEL', 'bbox/face_yolov8m.pt')) },
  };
  ctx.graph['50'] = {
    class_type: 'FaceDetailer',
    inputs: {
      image: [ctx.imageOutId, 0],
      model: ctx.refs.modelRef,
      clip: ctx.refs.clipRef,
      vae: ctx.refs.vaeRef,
      positive: ctx.refs.positiveRef,
      negative: ctx.refs.negativeRef,
      bbox_detector: ['51', 0],
      seed: ctx.seed + 1,
      steps: 20,
      cfg: ctx.cfg,
      sampler_name: ctx.sampler,
      scheduler: ctx.scheduler,
      denoise,
      feather: opts?.feather ?? 5,
      noise_mask: true,
      force_inpaint: true,
      wildcard: '',
      guide_size: 512,
      guide_size_for: true,
      max_size: 1024,
      bbox_threshold: 0.5,
      bbox_dilation: 0,
      bbox_crop_factor: 3,
      sam_detection_hint: 'center-1',
      sam_dilation: 0,
      sam_threshold: 0.93,
      sam_bbox_expansion: 0,
      sam_mask_hint_threshold: 0.7,
      sam_mask_hint_use_negative: 'False',
      drop_size: 10,
      cycle: 1,
    },
  };

  ctx.imageOutId = '50';
  patchSaveImage(ctx);
  return ctx;
}

// ─── 高清放大（4x-UltraSharp + 可选二段 refine） ────────────

/**
 * UpscaleModelLoader(4x-UltraSharp) → ImageUpscaleWithModel →
 * ImageScaleToTotalPixels（目标像素 = 基础画布 × factor²，上限 4.2MP 保护显存）；
 * refine=true 时追加二段 img2img（denoise 0.35）补回放大损失的高频细节。
 */
export function applyHiresUpscale(
  ctx: SdxlWorkflowContext,
  opts?: { factor?: number; refine?: boolean; refineDenoise?: number },
): SdxlWorkflowContext {
  assertEnhancersReady({ upscale: true });
  const factor = Math.min(4, Math.max(1.5, opts?.factor ?? 2));
  const megapixels = Math.min(4.2, Math.max(1, ((ctx.width * ctx.height) / 1_000_000) * factor * factor));

  ctx.graph['60'] = {
    class_type: 'UpscaleModelLoader',
    inputs: { model_name: envModel('RUNPOD_UPSCALE_MODEL', '4x-UltraSharp.pth') },
  };
  ctx.graph['61'] = {
    class_type: 'ImageUpscaleWithModel',
    inputs: { upscale_model: ['60', 0], image: [ctx.imageOutId, 0] },
  };
  ctx.graph['62'] = {
    class_type: 'ImageScaleToTotalPixels',
    inputs: {
      upscale_method: 'lanczos',
      image: ['61', 0],
      megapixels: Number(megapixels.toFixed(2)),
      // Newer ComfyUI makes resolution_steps a required input (used to pick
      // the resample filter); mirror the base KSampler step budget.
      resolution_steps: 20,
    },
  };
  ctx.imageOutId = '62';

  if (opts?.refine) {
    const refineDenoise = Math.min(0.5, Math.max(0.2, opts.refineDenoise ?? 0.35));
    ctx.graph['63'] = {
      class_type: 'VAEEncode',
      inputs: { pixels: ['62', 0], vae: ctx.refs.vaeRef },
    };
    ctx.graph['64'] = {
      class_type: 'KSampler',
      inputs: {
        seed: ctx.seed + 2,
        steps: 16,
        cfg: ctx.cfg,
        sampler_name: ctx.sampler,
        scheduler: ctx.scheduler,
        denoise: refineDenoise,
        model: ctx.refs.modelRef,
        positive: ctx.refs.positiveRef,
        negative: ctx.refs.negativeRef,
        latent_image: ['63', 0],
      },
    };
    ctx.graph['65'] = {
      class_type: 'VAEDecode',
      inputs: { samples: ['64', 0], vae: ctx.refs.vaeRef },
    };
    ctx.imageOutId = '65';
  }

  patchSaveImage(ctx);
  return ctx;
}

// ─── IP-Adapter FaceID 身份锁（SDXL） ───────────────────────

/**
 * ComfyUI_IPAdapter_plus 的 FaceID Plus V2 链路：锁人脸身份而不复制构图。
 * 权重受限 0.6-0.85（过高会侵蚀提示词对场景/姿势的控制）。
 * 门控旗标 RUNPOD_IPADAPTER_SDXL_READY（download-sdxl-matrix-bundle.sh 完成后设置）。
 */
export function applyIdentitySDXL(
  ctx: SdxlWorkflowContext,
  opts: { faceImage: string; weight?: number },
): SdxlWorkflowContext {
  if (process.env.RUNPOD_IPADAPTER_SDXL_READY?.trim().toLowerCase() !== 'true') {
    throw new Error('identity 未就绪：需先安装 IPAdapter FaceID 资产并设置 RUNPOD_IPADAPTER_SDXL_READY=true');
  }
  const weight = Math.min(0.85, Math.max(0.6, opts.weight ?? 0.75));

  ctx.graph['70'] = {
    // FACEID presets live on the FaceID loader subclass — the base
    // IPAdapterUnifiedLoader only exposes non-faceid presets.
    class_type: 'IPAdapterUnifiedLoaderFaceID',
    inputs: {
      model: ctx.refs.modelRef,
      preset: 'FACEID PLUS V2',
      lora_strength: 0.6,
      // CPU provider: onnxruntime (CPU) is what the worker image ships.
      provider: 'CPU',
    },
  };
  ctx.graph['71'] = {
    class_type: 'LoadImage',
    inputs: { image: opts.faceImage },
  };
  ctx.graph['72'] = {
    class_type: 'IPAdapterAdvanced',
    inputs: {
      model: ['70', 0],
      ipadapter: ['70', 1],
      image: ['71', 0],
      weight,
      weight_type: 'linear',
      combine_embeds: 'concat',
      embeds_scaling: 'V only',
      start_at: 0,
      end_at: 0.85,
    },
  };

  ctx.refs.modelRef = ['72', 0];
  const ksamplerInputs = ctx.graph[ctx.ksamplerId]?.inputs as Record<string, unknown> | undefined;
  if (ksamplerInputs) {
    ksamplerInputs.model = ctx.refs.modelRef;
  }
  return ctx;
}
