/**
 * RunPod Serverless API Client
 *
 * Handles image generation via RunPod serverless endpoints (ComfyUI / FLUX).
 * Uses async mode only: POST /run  poll /status/{id}.
 *
 * Architecture verified on this endpoint:
 * - CheckpointLoaderSimple with 'flux1-dev-fp8.safetensors'
 * - UNETLoader + DualCLIPLoader + VAELoader for UNET-only fp8 (Flux Unchained)
 * - CLIPTextEncode (positive + negative)
 * - EmptyLatentImage  KSampler  VAEDecode  SaveImage
 */

import { computeCacheKey, lookupCache, writeCache } from './generation-cache';
import { validateModelLoraName } from '@/lib/model-lora-routing';
import { sanitizeLoraForVolume } from '@/lib/runpod-loras';
import { specialistCheckpointInventory } from '@/lib/image-generation-routing';
import { logger } from '@/lib/logger';
import { capture, AnalyticsEvents } from './analytics';

// 
// RunPod credentials  MUST come from environment variables
// 

/**
 * Detect RunPod GPU capacity / OOM errors. These mean "no GPU right now" —
 * retrying immediately is pointless; fail over or open the circuit breaker.
 */
const GPU_CAPACITY_RE =
  /out of memory|\bOOM\b|cuda|\bGPU\b|INSUFFICIENT_RESOURCES|NO_CAPACITY|no (?:available|capacity)|capacity|429|5\d{2}|too many|no worker|insufficient gpu/i;

export function isGpuCapacityError(message: string | undefined | null): boolean {
  if (!message) return false;
  return GPU_CAPACITY_RE.test(message);
}

function getRunPodConfig(): { apiKey: string; endpointId: string; baseUrl: string } {
  const apiKey = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
  const endpointId = process.env.RUNPOD_ENDPOINT_ID || '';
  // Don't throw at module load time (breaks Next.js build).
  // Validation happens at call time instead.
  const baseUrl = endpointId ? `https://api.runpod.ai/v2/${endpointId}` : '';
  return { apiKey, endpointId, baseUrl };
}

// 
// FLUX.1-dev ComfyUI Workflow Template (API format)
// CheckpointLoaderSimple for single-file checkpoints (flux1-dev-fp8);
// UNETLoader + DualCLIPLoader + VAELoader for UNET-only fp8 checkpoints
// (Flux Unchained by SCG has no built-in CLIP/VAE - clip/t5/vae must be on
// the worker under models/clip and models/vae).
// 

/** UNET-only FLUX checkpoints: need DualCLIPLoader (clip_l + t5xxl) + VAELoader (ae). */
const SPLIT_FLUX_CHECKPOINTS = new Set([
  'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
]);

/**
 * Fetch / decode a portrait URL or data-URL into base64 for RunPod img2img.
 * Returns a worker-local filename + raw base64 (no data: prefix).
 */
export async function resolveInputImageBase64(
  input: string,
): Promise<{ name: string; base64: string } | null> {
  if (!input) return null;

  // Already a data URL
  if (input.startsWith('data:image/')) {
    const match = input.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    return { name: `ref_input.${ext}`, base64: match[2] };
  }

  // Raw base64 blob (no prefix) — assume PNG
  if (/^[A-Za-z0-9+/=\s]+$/.test(input.slice(0, 80)) && input.length > 200 && !input.startsWith('http')) {
    return { name: 'ref_input.png', base64: input.replace(/\s/g, '') };
  }

  // Remote URL — download
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const res = await fetch(input, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || 'image/png';
    const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
    return { name: `ref_input.${ext}`, base64: buf.toString('base64') };
  }

  // Treat as worker-local filename already
  if (/\.(png|jpe?g|webp)$/i.test(input) && !input.includes('://')) {
    return null; // pass through as filename only (no blob)
  }

  return null;
}

export function buildFluxWorkflow(opts: {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  /** FLUX conditioning guidance. KSampler CFG remains 1. Default 3.0 (A/B 选定). */
  flux_guidance?: number;
  seed?: number;
  sampler_name?: string;
  scheduler?: string;
  clip_skip?: number;
  batch_size?: number;
  /** Worker-local filename registered via RunPod `images` payload, or path for LoadImage */
  input_image?: string;
  denoising_strength?: number;
  /** Checkpoint filename as seen by Comfy on the worker / network volume */
  ckpt_name?: string;
  /**
   * Loader strategy: 'checkpoint' = CheckpointLoaderSimple; 'split' = UNETLoader +
   * DualCLIPLoader + VAELoader (required for UNET-only checkpoints like Flux Unchained).
   * Defaults to auto-detect by checkpoint filename.
   */
  ckpt_loader?: 'checkpoint' | 'split';
  /** CLIP-L filename under models/clip (split mode). Default RUNPOD_FLUX_CLIP / clip_l.safetensors */
  clip_name?: string;
  /** T5-XXL fp8 filename under models/clip (split mode). Default RUNPOD_FLUX_T5 / t5xxl_fp8_e4m3fn.safetensors */
  t5_name?: string;
  /** FLUX VAE filename under models/vae (split mode). Default RUNPOD_FLUX_VAE / ae.safetensors */
  vae_name?: string;
  /** LoRA filename under models/loras (network volume supported if mounted) */
  lora_name?: string | null;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  /** Optional ordered LoRA stack. Each loader feeds the next one. */
  loras?: Array<{
    name: string;
    strength_model?: number;
    strength_clip?: number;
  }>;
  model_family?: 'flux' | 'pony' | 'illustrious' | 'sdxl';
  /**
   * IP-Adapter face reference (worker-local filename registered via RunPod `images` payload).
   * When set, inserts Shakker Labs' FLUX IP-Adapter nodes to preserve identity
   * without reusing the reference composition.
   */
  ip_adapter_image?: string;
  /** IP-Adapter weight 0–1. Default 0.7. Higher = stronger face similarity. */
  ip_adapter_weight?: number;
  /** IP-Adapter start percent (0-1). Default 0.05 — skip pure-noise early steps. */
  ip_adapter_start?: number;
  /** IP-Adapter end percent (0-1). Default 0.85 — anchor identity through late detail steps. */
  ip_adapter_end?: number;
  /** FLUX IP-Adapter filename in models/ipadapter-flux/. Default: ip-adapter.bin */
  ip_adapter_model?: string;
  /** SigLIP model id/directory consumed by the Shakker loader. */
  clip_vision_model?: string;
  /**
   * ControlNet reference image (worker-local filename). Depth-based control;
   * gated by RUNPOD_CONTROLNET_READY — skipped with a warning when off.
   */
  control_image?: string;
  /** ControlNet strength 0.2–1. Default 0.7. */
  control_strength?: number;
  /** Impact Pack FaceDetailer pass; gated by RUNPOD_ADETAILER_READY. */
  face_detailer?: boolean;
  /** Hi-res upscale factor (1.5–4) via 4x-UltraSharp; gated by RUNPOD_UPSCALE_READY. */
  upscale_factor?: number;
}): Record<string, unknown> {
  const modelFamily = opts.model_family || 'flux';
  const isFlux = modelFamily === 'flux';
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const width = opts.width ?? 1024;        // Default 1024 for character portraits
  const height = opts.height ?? 1280;      // Default 1280 (3:4 ratio) for full-body to knee shots
  const steps = Math.max(opts.steps ?? 28, 8);  // ✅ Default 28 instead of 8
  // Keep the final caller-supplied Flux guidance. The two FLUX profiles use
  // different values; hard-coding 1 here silently discards the admin setting.
  const guidance = isFlux
    ? Math.min(5, Math.max(1, Number(opts.guidance ?? opts.flux_guidance ?? 3.5)))
    : Math.min(Math.max(opts.guidance ?? 6.0, 3.0), 9.0);
  const ckpt = opts.ckpt_name || 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors';
  // Flux Unchained by SCG ships UNET-only (fp8, no CLIP/VAE inside). It must be
  // loaded with UNETLoader + DualCLIPLoader + VAELoader, not CheckpointLoaderSimple.
  const useSplitLoader =
    isFlux &&
    (opts.ckpt_loader === 'split' ||
      (opts.ckpt_loader !== 'checkpoint' && SPLIT_FLUX_CHECKPOINTS.has(ckpt)));
  // 双底模默认：完整版 flux1-dev-fp8（非蒸馏）用 guidance 3.5；
  // Unchained（split 加载，8 步蒸馏）用 guidance 3.0（A/B 选定）。
  const fluxGuidance = Math.min(5, Math.max(2, opts.flux_guidance ?? (useSplitLoader ? 3.0 : 3.5)));
  // FLUX 采样器 CFG 恒为 1：构图引导完全交给 FluxGuidance 节点，
  // 旧调用方传入的 guidance 只影响 FluxGuidance，不得回灌 KSampler。
  const samplerCfg = isFlux ? 1 : guidance;
  const sampler_name = opts.sampler_name || (isFlux ? 'euler' : 'dpmpp_2m_sde');
  const scheduler = opts.scheduler || (isFlux ? 'simple' : 'karras');
  const batchSize = Math.min(4, Math.max(1, Math.floor(opts.batch_size ?? 1)));
  const clipName = opts.clip_name || process.env.RUNPOD_FLUX_CLIP || 'clip_l.safetensors';
  const t5Name = opts.t5_name || process.env.RUNPOD_FLUX_T5 || 't5xxl_fp8_e4m3fn.safetensors';
  const vaeName = opts.vae_name || process.env.RUNPOD_FLUX_VAE || 'ae.safetensors';
  const requestedStack = opts.loras?.length
    ? opts.loras
    : opts.lora_name
      ? [{
          name: opts.lora_name,
          strength_model: opts.lora_strength_model,
          strength_clip: opts.lora_strength_clip,
        }]
      : [];
  const loraStack = requestedStack
    .map((item) => {
      const validated = isFlux
        ? (() => {
            const result = sanitizeLoraForVolume(item.name, { fallback: null });
            return { name: result.lora_name, reason: result.reason };
          })()
        : validateModelLoraName(modelFamily, item.name);
      if (!validated.name) {
        logger.warn('[runpod] skipping LoRA not on model-family volume', {
          requested: item.name,
          modelFamily,
          reason: validated.reason,
        });
      }
      return validated.name ? { ...item, name: validated.name } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 4);

  let promptText = String(opts.prompt || '').trim();
  if (!promptText) {
    throw new Error('buildFluxWorkflow: empty prompt');
  }
  // Strip accidental blur cues that still sneak into prompts
  promptText = promptText
    .replace(/\b(soft focus|shallow depth of field|creamy bokeh|bokeh|defocused|blurry|dreamy blur)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();

  // FLUX: empty negative is safest. Long SD negatives → black / muddy images.
  // 统一注入 "自然写实" 提示词（皮肤纹理/瑕疵/胶片颗粒），降低 AI 感 / 蜡像感；
  // 非人物类提示词（服装/道具/广告）原样放行。
  const rawNeg = String(opts.negativePrompt ?? '').trim();
  const negativeParts = [...new Set(rawNeg.split(',').map((part) => part.trim()).filter(Boolean))];
  let negText = '';
  for (const part of negativeParts) {
    const candidate = negText ? `${negText}, ${part}` : part;
    if (candidate.length > (isFlux ? 300 : 1200)) break;
    negText = candidate;
  }

  // Node IDs: 1 Checkpoint → 2 pos CLIP → 3 neg CLIP → 4 latent → 5 KSampler → 6 VAE → 7 Save
  // Optional LoRA node 14+, IP-Adapter nodes 30-33
  const lastLoraNodeId = loraStack.length ? String(14 + loraStack.length - 1) : '1';
  let modelRef: [string, number] = [lastLoraNodeId, 0];
  const clipSkip = isFlux ? 1 : Math.min(2, Math.max(1, Math.round(opts.clip_skip || 2)));
  const clipRef: [string, number] = useSplitLoader
    ? ['22', 0]
    : clipSkip > 1
      ? ['20', 0]
      : [lastLoraNodeId, 1];
  const vaeRef: [string, number] = useSplitLoader ? ['23', 0] : ['1', 2];
  const positiveRef: [string, number] = isFlux ? ['21', 0] : ['2', 0];
  const loaderNodes: Record<string, unknown> = useSplitLoader
    ? {
        '1': {
          class_type: 'UNETLoader',
          inputs: { unet_name: ckpt, weight_dtype: 'default' },
        },
        '22': {
          class_type: 'DualCLIPLoader',
          inputs: { clip_name1: clipName, clip_name2: t5Name, type: 'flux' },
        },
        '23': {
          class_type: 'VAELoader',
          inputs: { vae_name: vaeName },
        },
      }
    : {
        '1': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: ckpt },
        },
      };

  const loraNodes = Object.fromEntries(loraStack.map((item, index) => {
    const id = String(14 + index);
    const previousId = index === 0 ? '1' : String(14 + index - 1);
    return [id, {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: item.name,
          strength_model: item.strength_model ?? 0.7,
          strength_clip: item.strength_clip ?? item.strength_model ?? 0.7,
          model: [previousId, 0],
          clip: useSplitLoader ? ['22', 0] : [previousId, 1],
        },
      }];
  }));

  const clipSkipNodes = clipSkip > 1
    ? {
        '20': {
          class_type: 'CLIPSetLastLayer',
          inputs: { clip: [lastLoraNodeId, 1], stop_at_clip_layer: -clipSkip },
        },
      }
    : {};

  const fluxGuidanceNodes = isFlux
    ? {
        '21': {
          class_type: 'FluxGuidance',
          inputs: { conditioning: ['2', 0], guidance: fluxGuidance },
        },
      }
    : {};
  // ─── IP-Adapter face identity nodes (optional) ─────────────────────────────
  // Locks facial identity from a reference image WITHOUT locking composition.
  // Requires Shakker-Labs/ComfyUI-IPAdapter-Flux on the worker.
  // ApplyIPAdapterFlux is architecture-specific. For SDXL/Pony/Illustrious,
  // use the same canonical face reference as a moderate-denoise img2img anchor
  // until a verified SDXL FaceID/InstantID workflow is available.
  const useIpAdapter = !!opts.ip_adapter_image && isFlux;
  const sdxlReferenceImage = !isFlux ? opts.ip_adapter_image : undefined;
  if (opts.ip_adapter_image && !isFlux) {
    // ApplyIPAdapterFlux is FLUX-only; legacy families use the reference as a
    // moderate-denoise img2img anchor instead. Surface this for debugging.
    logger.debug('[runpod] ip_adapter_image downgraded to img2img anchor for non-flux family', {
      modelFamily,
    });
  }
  const effectiveInputImage = opts.input_image || sdxlReferenceImage;
  const ipAdapterNodes: Record<string, unknown> = {};
  if (useIpAdapter) {
    const ipWeight = Math.min(0.95, Math.max(0.15, opts.ip_adapter_weight ?? 0.7));
    const ipModel = opts.ip_adapter_model || 'ip-adapter.bin';
    const clipVision = opts.clip_vision_model || 'google/siglip-so400m-patch14-384';
    // Identity-consistency scheduling: extend IP-Adapter influence to late diffusion
    // steps (0.85) so the face stays anchored through final detail refinement.
    // Skip the first 5% of pure-noise steps where IP-Adapter adds noise.
    const ipStart = opts.ip_adapter_start ?? 0.05;
    const ipEnd = opts.ip_adapter_end ?? 0.85;
    ipAdapterNodes['30'] = {
      class_type: 'ApplyIPAdapterFlux',
      inputs: {
        model: [lastLoraNodeId, 0],
        ipadapter_flux: ['31', 0],
        image: ['33', 0],
        weight: ipWeight,
        // 'linear' applies uniform feature transfer across all scales,
        // preserving face geometry better than 'style transfer' which biases
        // toward color/texture and loses structural identity.
        weight_type: 'linear',
        start_percent: ipStart,
        end_percent: ipEnd,
      },
    };
    ipAdapterNodes['31'] = {
      class_type: 'IPAdapterFluxLoader',
      inputs: {
        ipadapter: ipModel,
        clip_vision: clipVision,
        provider: 'cuda',
      },
    };
    ipAdapterNodes['33'] = {
      class_type: 'LoadImage',
      inputs: { image: opts.ip_adapter_image },
    };
    // KSampler now takes model from the FLUX IP-Adapter output.
    modelRef = ['30', 0];
  }

  // ─── Enhancement passes (ControlNet / FaceDetailer / hi-res upscale) ────────
  // 门控关闭时告警跳过（不抛错，保持既有调用方稳定）；节点 ID 段与
  // comfy-builders/enhance-blocks 对齐：ControlNet 40-43、FaceDetailer 50-51、
  // Upscale 60-62。
  const enhancerFlag = (name: string): boolean =>
    process.env[name]?.trim().toLowerCase() === 'true';
  let currentImageOut = '6';
  const applyEnhancements = (graph: Record<string, unknown>): Record<string, unknown> => {
    const samplerInputs = (graph['5'] as { inputs?: Record<string, unknown> } | undefined)?.inputs;
    const saveInputs = (graph['7'] as { inputs?: Record<string, unknown> } | undefined)?.inputs;
    if (!samplerInputs || !saveInputs) return graph;

    if (opts.control_image) {
      if (!enhancerFlag('RUNPOD_CONTROLNET_READY')) {
        logger.warn('[runpod] control_image requested but RUNPOD_CONTROLNET_READY is off — skipping');
      } else {
        Object.assign(graph, {
          '40': { class_type: 'LoadImage', inputs: { image: opts.control_image } },
          '41': {
            class_type: 'DepthAnythingV2Preprocessor',
            inputs: { image: ['40', 0], resolution: 1024 },
          },
          '42': {
            class_type: 'ControlNetLoader',
            inputs: {
              control_net_name:
                process.env.RUNPOD_CONTROLNET_MODEL?.trim() || 'flux-depth-controlnet.safetensors',
            },
          },
          '43': {
            class_type: 'ControlNetApplyAdvanced',
            inputs: {
              positive: samplerInputs.positive,
              negative: samplerInputs.negative,
              control_net: ['42', 0],
              image: ['41', 0],
              vae: vaeRef,
              strength: Math.min(1, Math.max(0.2, opts.control_strength ?? 0.7)),
              start_percent: 0,
              end_percent: 0.85,
            },
          },
        });
        samplerInputs.positive = ['43', 0];
        samplerInputs.negative = ['43', 1];
      }
    }

    if (opts.face_detailer) {
      // Only apply if RUNPOD_ADETAILER_READY is explicitly enabled
      // This env flag should be set only after confirming Impact Pack is installed
      const adetailerReady = enhancerFlag('RUNPOD_ADETAILER_READY');
      
      if (!adetailerReady) {
        logger.warn('[runpod] face_detailer requested but RUNPOD_ADETAILER_READY=false — skipping ADetailer enhancement');
      } else {
        // RunPod endpoint confirmed to have Impact Pack installed.
        // 新版 Impact Pack schema（与 comfy-builders/enhance-blocks.ts 对齐）：
        // 模型名带 bbox/ 前缀；feather/wildcard/cycle/drop_size 等为必填输入。
        Object.assign(graph, {
          '51': {
            class_type: 'UltralyticsDetectorProvider',
            inputs: { model_name: process.env.RUNPOD_ADETAILER_MODEL?.trim() || 'bbox/face_yolov8m.pt' },
          },
          '50': {
            class_type: 'FaceDetailer',
            inputs: {
              image: [currentImageOut, 0],
              model: modelRef,
              clip: clipRef,
              vae: vaeRef,
              positive: samplerInputs.positive,
              negative: samplerInputs.negative,
              bbox_detector: ['51', 0],
              seed: seed + 1,
              steps: 20,
              cfg: samplerCfg,
              sampler_name,
              scheduler,
              // Conservative face repair: lower denoise preserves identity,
              // higher feather blends the repaired face naturally.
              denoise: 0.35,
              feather: 8,
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
              // Larger expansion covers forehead + hairline for consistent skin
              sam_bbox_expansion: 0.6,
              sam_mask_hint_threshold: 0.7,
              sam_mask_hint_use_negative: 'False',
              drop_size: 10,
              cycle: 1,
            },
          },
        });
        currentImageOut = '50';
      }
    }

    if (opts.upscale_factor && opts.upscale_factor > 1) {
      if (!enhancerFlag('RUNPOD_UPSCALE_READY')) {
        logger.warn('[runpod] upscale requested but RUNPOD_UPSCALE_READY is off — skipping');
      } else {
        const factor = Math.min(4, Math.max(1.5, opts.upscale_factor));
        const megapixels = Math.min(
          4.2,
          Math.max(1, ((width * height) / 1_000_000) * factor * factor),
        );
        Object.assign(graph, {
          '60': {
            class_type: 'UpscaleModelLoader',
            inputs: { model_name: process.env.RUNPOD_UPSCALE_MODEL?.trim() || '4x-UltraSharp.pth' },
          },
          '61': {
            class_type: 'ImageUpscaleWithModel',
            inputs: { upscale_model: ['60', 0], image: [currentImageOut, 0] },
          },
          '62': {
            class_type: 'ImageScaleToTotalPixels',
            inputs: {
              upscale_method: 'lanczos',
              image: ['61', 0],
              megapixels: Number(megapixels.toFixed(2)),
              // Newer ComfyUI makes resolution_steps a required input (used
              // to pick the resample filter); mirror the base step budget.
              resolution_steps: 20,
            },
          },
        });
        currentImageOut = '62';
      }
    }

    if (currentImageOut !== '6') {
      saveInputs.images = [currentImageOut, 0];
    }
    return graph;
  };

  // img2img path
  if (effectiveInputImage) {
    const denoise = opts.denoising_strength ?? (sdxlReferenceImage ? 0.62 : 0.55);
    const graph: Record<string, unknown> = {
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: { text: promptText, clip: clipRef },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: { text: negText, clip: clipRef },
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps,
          cfg: samplerCfg,
          sampler_name,
          scheduler,
          denoise,
          model: modelRef,
          positive: positiveRef,
          negative: ['3', 0],
          latent_image: ['13', 0],
        },
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: { samples: ['5', 0], vae: vaeRef },
      },
      '7': {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'soulmate', images: ['6', 0] },
      },
      '11': {
        class_type: 'LoadImage',
        inputs: { image: effectiveInputImage },
      },
      '12': {
        class_type: 'ImageScale',
        inputs: {
          image: ['11', 0],
          upscale_method: 'lanczos',
          width,
          height,
          crop: 'disabled',
        },
      },
      '13': {
        class_type: 'VAEEncode',
        inputs: { pixels: ['12', 0], vae: vaeRef },
      },
    };
    Object.assign(graph, loaderNodes, loraNodes, clipSkipNodes, fluxGuidanceNodes, ipAdapterNodes);
    return applyEnhancements(graph);
  }

  // txt2img (default) — FLUX-safe empty negative + cfg≈1
  const graph: Record<string, unknown> = {
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: promptText, clip: clipRef },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negText, clip: clipRef },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: batchSize },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: samplerCfg,
        sampler_name,
        scheduler,
        denoise: 1.0,
        model: modelRef,
        positive: positiveRef,
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: vaeRef },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'soulmate', images: ['6', 0] },
    },
  };
  Object.assign(graph, loaderNodes, loraNodes, clipSkipNodes, fluxGuidanceNodes, ipAdapterNodes);
  return applyEnhancements(graph);
}

// 
// Types
// 

export interface RunPodGenerateOptions {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  /** FLUX conditioning guidance; separate from KSampler CFG. */
  flux_guidance?: number;
  num_images?: number;
  seed?: number;
  /** Comfy KSampler sampler_name (FLUX: euler) */
  sampler_name?: string;
  /** Comfy KSampler scheduler (FLUX: simple) */
  scheduler?: string;
  clip_skip?: number;
  input_image?: string;      // For img2img (character consistency)
  denoising_strength?: number; // 0-1, lower = closer to input
  ckpt_name?: string;
  /** Loader strategy (auto-detect by filename when omitted). 'split' = UNET + CLIP + VAE loaders. */
  ckpt_loader?: 'checkpoint' | 'split';
  clip_name?: string;
  t5_name?: string;
  vae_name?: string;
  lora_name?: string | null;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  loras?: Array<{
    name: string;
    strength_model?: number;
    strength_clip?: number;
  }>;
  model_family?: 'flux' | 'pony' | 'illustrious' | 'sdxl';
  /** IP-Adapter face reference image (URL, base64, or worker filename). Locks face only. */
  ip_adapter_image?: string;
  /** IP-Adapter weight 0–1 (default 0.75). Higher = stronger face similarity. */
  ip_adapter_weight?: number;
  /** IP-Adapter start percent (0-1). Default 0.05 — skip pure-noise early steps. */
  ip_adapter_start?: number;
  /** IP-Adapter end percent (0-1). Default 0.85 — anchor identity through late detail steps. */
  ip_adapter_end?: number;
  /** ControlNet reference image (URL/base64/worker filename) for pose/depth control. */
  control_image?: string;
  /** ControlNet strength 0.2–1 (default 0.7). */
  control_strength?: number;
  /** Run an Impact Pack FaceDetailer pass after the base generation. */
  face_detailer?: boolean;
  /** Hi-res upscale factor (1.5–4) applied after the base generation. */
  upscale_factor?: number;
  /** Optional installed enhancement passes; validated by the admin API. */
  enhancers?: {
    controlnet?: boolean;
    adetailer?: boolean;
    upscale?: boolean;
  };
  /** Override default RUNPOD_ENDPOINT_ID for this call */
  endpoint_id?: string;
  /** Resume an existing RunPod job (skip /run submit). */
  job_id?: string;
  /** Max time to poll in this request (ms). Default ~270s under Vercel 300s. */
  poll_budget_ms?: number;
  /**
   * When poll budget ends while still queued/running:
   * - 'pending' (default): return pending result / throw RunPodPendingError — do NOT cancel
   * - 'cancel': cancel job and throw hard timeout (legacy)
   */
  on_timeout?: 'pending' | 'cancel';
  /** If true, generate() throws RunPodPendingError instead of returning pending payload. */
  throw_on_pending?: boolean;
  /**
   * When true, submit the job and return immediately with job_id (no polling).
   * Eliminates Vercel serverless timeout risk entirely — client polls /api/runpod/status.
   */
  submit_only?: boolean;
}

export interface RunPodGenerateResult {
  images: string[];
  execution_time?: number;
  job_id?: string;
  pending?: boolean;
  status?: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  endpoint_id?: string;
  waited_ms?: number;
  strategy?: string;
  /** Optional warning (e.g. "ADetailer skipped") — images still returned */
  warning?: string;
  /** Structured error object from ComfyUI (node_errors, etc.) */
  error?: {
    type?: string;
    message?: string;
    details?: string;
    node_errors?: Record<string, unknown>;
  };
}

export class RunPodPendingError extends Error {
  job_id: string;
  endpoint_id: string;
  waited_ms: number;
  status: string;
  strategy?: string;

  constructor(info: {
    job_id: string;
    endpoint_id: string;
    waited_ms: number;
    status: string;
    strategy?: string;
  }) {
    super(
      `RunPod still queued/running (waited ${Math.round(info.waited_ms / 1000)}s, job ${info.job_id}, status ${info.status}). ` +
        `Endpoint ${info.endpoint_id} is busy — resume with the same job_id; do not re-submit.`,
    );
    this.name = 'RunPodPendingError';
    this.job_id = info.job_id;
    this.endpoint_id = info.endpoint_id;
    this.waited_ms = info.waited_ms;
    this.status = info.status;
    this.strategy = info.strategy;
  }
}

interface RunPodImageOutput {
  data: string;      // base64 encoded image
  filename: string;
  type: string;
}

interface RunPodJobStatus {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output?: {
    images?: RunPodImageOutput[];
  };
  error?: string;
  execution_time?: number;
}

// 
// Client
// 


/** Only accept real image payloads — never prompts / bare filenames */
function looksLikeImagePayload(s: string): boolean {
  const t = s.trim();
  if (!t || t.length < 64) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (t.startsWith('data:image/')) return true;
  if (/\s/.test(t) && /\b(photo|portrait|woman|photorealistic|masterpiece)\b/i.test(t)) {
    return false;
  }
  if (/^[\w./-]+\.(png|jpe?g|webp)$/i.test(t) && t.length < 180) return false;
  const compact = t.replace(/\s+/g, '');
  if (compact.startsWith('iVBOR') && compact.length > 200) return true;
  if (compact.startsWith('/9j/') && compact.length > 200) return true;
  return compact.length > 500 && /^[A-Za-z0-9+/_=-]+$/.test(compact.slice(0, 120));
}

function extractImagesFromOutput(out: Record<string, unknown> | undefined): string[] {
  const images: string[] = [];
  if (!out) return images;

  const pushImg = (v: unknown) => {
    if (!v) return;
    if (typeof v === 'string') {
      if (looksLikeImagePayload(v)) images.push(v);
      return;
    }
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      const candidates = [o.data, o.image, o.base64, o.b64_json, o.b64, o.url];
      for (const cand of candidates) {
        if (typeof cand === 'string' && looksLikeImagePayload(cand)) {
          images.push(cand);
          return;
        }
      }
    }
  };

  if (Array.isArray(out.images)) {
    for (const img of out.images) pushImg(img);
  }
  pushImg(out.image);
  if (out.output && typeof out.output === 'object') {
    const inner = out.output as Record<string, unknown>;
    if (Array.isArray(inner.images)) {
      for (const img of inner.images) pushImg(img);
    }
    pushImg(inner.image);
  }
  if (typeof out.message === 'string' && looksLikeImagePayload(out.message)) {
    pushImg(out.message);
  }
  if (Array.isArray(out.result)) {
    for (const r of out.result) pushImg(r);
  }
  return images;
}

class RunPodClient {
  private apiKey: string;
  private endpointId: string;
  private baseUrl: string;

  constructor() {
    const config = getRunPodConfig();
    this.apiKey = config.apiKey;
    this.endpointId = config.endpointId;
    this.baseUrl = config.baseUrl;
  }

  get isConfigured(): boolean {
    return !!(this.apiKey && this.endpointId);
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private resolveBase(endpointId?: string): { apiKey: string; endpointId: string; baseUrl: string } {
    this.refreshConfig();
    const id = endpointId || this.endpointId;
    if (!this.apiKey || !id) {
      throw new Error('RunPod is not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.');
    }
    return {
      apiKey: this.apiKey,
      endpointId: id,
      baseUrl: `https://api.runpod.ai/v2/${id}`,
    };
  }

  /** Best-effort cancel (only when explicitly requested). */
  async cancelJob(jobId: string, endpointId?: string): Promise<void> {
    const { baseUrl } = this.resolveBase(endpointId);
    try {
      await fetch(`${baseUrl}/cancel/${jobId}`, {
        method: 'POST',
        headers: this.headers,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* ignore */
    }
  }

  /**
   * Poll an existing job until COMPLETED/FAILED or poll budget ends.
   * Does NOT cancel on timeout by default — preserves queue position.
   */
  async pollJob(
    jobId: string,
    opts: {
      endpoint_id?: string;
      poll_interval_ms?: number;
      poll_budget_ms?: number;
      on_timeout?: 'pending' | 'cancel';
      strategy?: string;
    } = {},
  ): Promise<RunPodGenerateResult> {
    const { endpointId, baseUrl } = this.resolveBase(opts.endpoint_id);
    const pollIntervalMs = Math.max(1000, opts.poll_interval_ms ?? 2000);
    // Honor explicit short budgets (e.g. the status route's 8s "quick check").
    // Only floor at 1s to avoid busy loops; default stays 150s.
    const requestedBudgetMs =
      Number(opts.poll_budget_ms) || Number(process.env.RUNPOD_POLL_MS) || 150_000;
    const pollBudgetMs = Math.max(1_000, Math.min(requestedBudgetMs, 150_000));
    const maxAttempts = Math.max(1, Math.floor(pollBudgetMs / pollIntervalMs));
    const onTimeout = opts.on_timeout || 'pending';
    const started = Date.now();
    let lastStatus = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (Date.now() - started >= pollBudgetMs) break;
      const statusRes = await fetch(`${baseUrl}/status/${jobId}`, {
        headers: this.headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!statusRes.ok) {
        throw new Error(`RunPod status HTTP ${statusRes.status} for job ${jobId}`);
      }

      const status = (await statusRes.json()) as RunPodJobStatus & {
        output?: {
          images?: Array<RunPodImageOutput | string>;
          error?: string;
          message?: string;
          image?: unknown;
          result?: unknown;
          output?: unknown;
        };
      };

      if (status.status !== lastStatus) {
        lastStatus = status.status;
        logger.info('[runpod] job status', { id: jobId, status: status.status, attempt });
      }

      if (status.status === 'COMPLETED') {
        const images = extractImagesFromOutput(status.output as Record<string, unknown> | undefined);
        if (!images.length) {
          const out = status.output as Record<string, unknown> | undefined;
          const shape = out
            ? Object.keys(out).reduce<Record<string, string>>((acc, k) => {
                const v = out[k];
                if (v == null) acc[k] = 'null';
                else if (typeof v === 'string') acc[k] = `str:${v.length}`;
                else if (Array.isArray(v)) acc[k] = `arr:${v.length}`;
                else if (typeof v === 'object') acc[k] = `obj:${Object.keys(v as object).join(',')}`;
                else acc[k] = typeof v;
                return acc;
              }, {})
            : {};
          throw new Error(
            'COMPLETED but no valid image bytes in output. shape=' +
              JSON.stringify(shape).slice(0, 280),
          );
        }
        
        // Extract structured error info from ComfyUI response (e.g., FaceDetailer node missing)
        let structuredError: RunPodGenerateResult['error'] = undefined;
        let warning: string | undefined = undefined;
        
        if (status.output) {
          const out = status.output as Record<string, unknown>;
          // Check for node_errors in output
          if (out.node_errors && typeof out.node_errors === 'object') {
            const nodeErr = out.node_errors as Record<string, unknown>;
            const firstNodeId = Object.keys(nodeErr)[0];
            const firstErr = firstNodeId ? nodeErr[firstNodeId] : undefined;
            if (firstErr && typeof firstErr === 'object' && 'error' in firstErr) {
              const errObj = firstErr as { error?: string; type?: string };
              structuredError = {
                type: errObj.type || 'missing_node_type',
                message: errObj.error || 'Unknown node error',
              };
              
              // Generate user-friendly warning message
              if (structuredError.message?.includes('FaceDetailer')) {
                warning = 'ADetailer 增强器未安装（RunPod 缺少 Impact Pack），已跳过面部精修步骤，基础图像已保留';
              } else if (structuredError.message?.includes('ControlNet')) {
                warning = 'ControlNet 增强器未安装，已跳过姿态控制步骤';
              } else {
                warning = `增强器警告：${structuredError.message}`;
              }
            }
          }
        }
        
        return {
          images,
          execution_time: status.execution_time,
          job_id: jobId,
          pending: false,
          status: 'COMPLETED',
          endpoint_id: endpointId,
          waited_ms: Date.now() - started,
          strategy: opts.strategy,
          ...(warning && { warning }),
          ...(structuredError && { error: structuredError }),
        };
      }

      if (status.status === 'FAILED') {
        const failMsg =
          status.error ||
          status.output?.error ||
          status.output?.message ||
          JSON.stringify(status.output || status).slice(0, 280);
        throw new Error(`RunPod job FAILED: ${failMsg}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const waited = Date.now() - started;
    const last = (lastStatus as 'IN_QUEUE' | 'IN_PROGRESS') || 'IN_QUEUE';
    if (onTimeout === 'cancel') {
      await this.cancelJob(jobId, endpointId);
      throw new Error(
        `RunPod queue timeout (waited ${Math.round(waited / 1000)}s, job ${jobId}). ` +
          `Endpoint ${endpointId} workers busy/long queue. Retry later or check RunPod console.`,
      );
    }

    logger.info('[runpod] poll budget exceeded — keep job alive', {
      id: jobId,
      waited_ms: waited,
      status: last,
      endpoint: endpointId,
    });

    return {
      images: [],
      job_id: jobId,
      pending: true,
      status: last,
      endpoint_id: endpointId,
      waited_ms: waited,
      strategy: opts.strategy,
    };
  }

  /**
   * Generate images via RunPod (async polling).
   * Uses ComfyUI API workflow format internally.
   * On long queue: returns pending + job_id by default (does not cancel).
   */
  async generate(options: RunPodGenerateOptions, pollIntervalMs = 2000): Promise<RunPodGenerateResult> {
    this.refreshConfig();
    options = this.preflightValidateModelOptions(options);
    const endpointId = options.endpoint_id || this.endpointId;
    const baseUrl = endpointId ? `https://api.runpod.ai/v2/${endpointId}` : this.baseUrl;
    if (!this.apiKey || !endpointId) {
      throw new Error('RunPod is not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.');
    }

    // Resume existing job (no new /run)
    if (options.job_id) {
      const polled = await this.pollJob(options.job_id, {
        endpoint_id: endpointId,
        poll_interval_ms: pollIntervalMs,
        poll_budget_ms: options.poll_budget_ms,
        on_timeout: options.on_timeout || 'pending',
      });
      if (polled.pending && options.throw_on_pending !== false) {
        throw new RunPodPendingError({
          job_id: polled.job_id || options.job_id,
          endpoint_id: polled.endpoint_id || endpointId,
          waited_ms: polled.waited_ms || 0,
          status: polled.status || 'IN_QUEUE',
          strategy: polled.strategy,
        });
      }
      return polled;
    }

    // Resolve reference image to a base64 payload + worker-local filename.
    // ComfyUI LoadImage expects a file on the worker; most RunPod serverless
    // templates accept `images: [{ name, image }]` alongside the workflow.
    let inputImageName: string | undefined;
    let inputImageB64: string | undefined;
    if (options.input_image) {
      try {
        const resolved = await resolveInputImageBase64(options.input_image);
        if (resolved) {
          inputImageName = resolved.name;
          inputImageB64 = resolved.base64;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[runpod] failed to resolve input_image — img2img cannot proceed without reference', {
          input_image: options.input_image.slice(0, 120),
          error: msg,
        });
        throw new Error(`参考图加载失败，img2img 无法执行: ${msg}`);
      }
    }

    // Resolve IP-Adapter face reference image (same mechanism as input_image)
    let ipAdapterImageName: string | undefined;
    let ipAdapterImageB64: string | undefined;
    if (options.ip_adapter_image) {
      try {
        const resolved = await resolveInputImageBase64(options.ip_adapter_image);
        if (resolved) {
          ipAdapterImageName = `ipadapter_face.${resolved.name.split('.').pop() || 'png'}`;
          ipAdapterImageB64 = resolved.base64;
        }
      } catch (err) {
        logger.warn('[runpod] failed to resolve ip_adapter_image, skipping IP-Adapter', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Resolve ControlNet reference image (same mechanism as input_image)
    let controlImageName: string | undefined;
    let controlImageB64: string | undefined;
    if (options.control_image) {
      try {
        const resolved = await resolveInputImageBase64(options.control_image);
        if (resolved) {
          controlImageName = `controlnet_ref.${resolved.name.split('.').pop() || 'png'}`;
          controlImageB64 = resolved.base64;
        }
      } catch (err) {
        logger.warn('[runpod] failed to resolve control_image, skipping ControlNet', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const promptText = String(options.prompt || '').trim();
    if (!promptText) {
      throw new Error('prompt is required (empty positive prompt)');
    }

    // Build a ComfyUI-compatible workflow with the given prompt
    // FLUX defaults: cfg≈1.0, euler + simple (high CFG / long neg → black frames)
    const workflow = buildFluxWorkflow({
      prompt: promptText,
      negativePrompt: options.negative_prompt,
      width: options.width,
      height: options.height,
      steps: options.num_inference_steps ?? 8,
      guidance: options.guidance_scale ?? 1.0,
      flux_guidance: options.flux_guidance,
      seed: options.seed,
      sampler_name: options.sampler_name || 'euler',
      scheduler: options.scheduler || 'simple',
      clip_skip: options.clip_skip,
      batch_size: options.num_images,
      // Prefer resolved worker filename; if caller already passed a bare filename, keep it.
      input_image:
        inputImageName ||
        (options.input_image &&
        !options.input_image.startsWith('http') &&
        !options.input_image.startsWith('data:')
          ? options.input_image
          : undefined),
      denoising_strength: options.denoising_strength,
      ckpt_name: options.ckpt_name,
      ckpt_loader: options.ckpt_loader,
      clip_name: options.clip_name,
      t5_name: options.t5_name,
      vae_name: options.vae_name,
      model_family: options.model_family,
      lora_name: options.lora_name,
      lora_strength_model: options.lora_strength_model,
      lora_strength_clip: options.lora_strength_clip,
      loras: options.loras,
      ip_adapter_image: ipAdapterImageName || (options.ip_adapter_image && !options.ip_adapter_image.startsWith('http') && !options.ip_adapter_image.startsWith('data:') ? options.ip_adapter_image : undefined),
      ip_adapter_weight: options.ip_adapter_weight,
      control_image:
        controlImageName ||
        (options.control_image &&
        !options.control_image.startsWith('http') &&
        !options.control_image.startsWith('data:')
          ? options.control_image
          : undefined),
      control_strength: options.control_strength,
      face_detailer: options.face_detailer,
      upscale_factor: options.upscale_factor,
    });

    const samplerNode = workflow['5'] as { inputs?: Record<string, unknown> } | undefined;
    const fluxGuidanceNode = workflow['21'] as { inputs?: Record<string, unknown> } | undefined;
    const checkpointNode = workflow['1'] as { class_type?: string; inputs?: Record<string, unknown> } | undefined;
    logger.info('[runpod] workflow resolved', {
      model_family: options.model_family || 'flux',
      checkpoint_loader: checkpointNode?.class_type,
      loader_mode: checkpointNode?.class_type === 'UNETLoader' ? 'split' : 'checkpoint',
      checkpoint: options.ckpt_name || 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      width: options.width ?? 832,
      height: options.height ?? 1216,
      steps: samplerNode?.inputs?.steps,
      cfg: samplerNode?.inputs?.cfg,
      flux_guidance: fluxGuidanceNode?.inputs?.guidance,
      sampler: samplerNode?.inputs?.sampler_name,
      scheduler: samplerNode?.inputs?.scheduler,
      img2img: !!inputImageName,
      ip_adapter: !!ipAdapterImageName,
      lora_count: options.loras?.length || (options.lora_name ? 1 : 0),
    });
    const imageEntries: Array<{ name: string; image: string }> = [];
    if (inputImageName && inputImageB64) {
      imageEntries.push({ name: inputImageName, image: inputImageB64 });
    }
    if (ipAdapterImageName && ipAdapterImageB64) {
      imageEntries.push({ name: ipAdapterImageName, image: ipAdapterImageB64 });
    }
    if (controlImageName && controlImageB64) {
      imageEntries.push({ name: controlImageName, image: controlImageB64 });
    }
    const imagesPayload = imageEntries.length ? { images: imageEntries } : {};

    /**
     * Payload strategies — RunPod Comfy / FLUX handlers are inconsistent.
     * Worker error "prompt is required" usually means they expect ComfyUI API field
     * `input.prompt` = node graph (object), NOT a missing text string.
     * Some want `workflow`; a few simple FLUX APIs want text `prompt` string.
     */
    // Comfy-first payloads. Do NOT send text string as `prompt` for Comfy workers —
    // they try to queue it as a workflow and return HTTP 400 Bad Request.
    const strategies: Array<{ name: string; input: Record<string, unknown> }> = [
      {
        name: 'comfy_dual',
        input: {
          // ComfyUI API field name is `prompt` (= node graph)
          prompt: workflow,
          workflow,
          ...imagesPayload,
        },
      },
      {
        name: 'comfy_prompt',
        input: {
          prompt: workflow,
          ...imagesPayload,
        },
      },
      {
        name: 'comfy_workflow',
        input: {
          workflow,
          ...imagesPayload,
        },
      },
    ];

    /**
     * Queue delay on this endpoint is often 2–5 min (single worker).
     * Old 90s budget abandoned jobs mid-queue and re-submitted next strategy → flood.
     * Only fall through to the next strategy on hard submit/FAILED (not on timeout).
     */
    // Cap under Vercel Hobby serverless limit (300s). Prefer finishing one job
    // over re-submitting strategies and flooding the queue.
    const pollBudgetMs = Math.max(
      60_000,
      Math.min(
        Number(process.env.RUNPOD_POLL_MS) || 150_000,
        150_000, // ~2.5 min — leave headroom for Vercel 180s serverless timeout
      ),
    );
    const maxAttempts = Math.max(1, Math.floor(pollBudgetMs / pollIntervalMs));
    const errors: string[] = [];

    for (const strategy of strategies) {
      try {
        logger.info('[runpod] submit strategy', {
          strategy: strategy.name,
          endpoint: endpointId,
          workflow_nodes: Object.keys(workflow).length,
          prompt_len: promptText.length,
          poll_budget_ms: pollBudgetMs,
        });

        const submitRes = await fetch(`${baseUrl}/run`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ input: strategy.input }),
          signal: AbortSignal.timeout(15000),
        });

        if (!submitRes.ok) {
          const errText = await submitRes.text();
          errors.push(`${strategy.name}: submit HTTP ${submitRes.status} ${errText.slice(0, 160)}`);
          // Hard submit fail → try next payload shape
          continue;
        }

        const { id } = (await submitRes.json()) as { id: string };
        if (!id) {
          errors.push(`${strategy.name}: no job id`);
          continue;
        }

        // submit_only: return immediately — client will poll /api/runpod/status
        if (options.submit_only) {
          logger.info('[runpod] job submitted (submit_only) — client will poll', {
            id,
            strategy: strategy.name,
          });
          return {
            images: [],
            job_id: id,
            pending: true,
            status: 'IN_QUEUE',
            endpoint_id: endpointId,
            waited_ms: 0,
            strategy: strategy.name,
          };
        }

        logger.info('[runpod] job submitted — waiting (queue may be 2–5 min)', {
          id,
          strategy: strategy.name,
        });

        let terminal: 'success' | 'fail' | 'timeout' = 'timeout';
        let successResult: RunPodGenerateResult | null = null;
        let failMsg = '';
        let lastStatus = '';

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const statusRes = await fetch(`${baseUrl}/status/${id}`, {
            headers: this.headers,
            signal: AbortSignal.timeout(10000),
          });

          if (!statusRes.ok) {
            failMsg = `status HTTP ${statusRes.status}`;
            terminal = 'fail';
            break;
          }

          const status = (await statusRes.json()) as RunPodJobStatus & {
            output?: {
              images?: Array<RunPodImageOutput | string>;
              error?: string;
              message?: string;
            };
          };

          if (status.status !== lastStatus) {
            lastStatus = status.status;
            logger.info('[runpod] job status', { id, status: status.status, attempt });
          }

          if (status.status === 'COMPLETED') {
            const images: string[] = [];
            const out = status.output as Record<string, unknown> | undefined;

            /** Only accept real image payloads — never prompts / bare filenames */
            const looksLikeImagePayload = (s: string): boolean => {
              const t = s.trim();
              if (!t || t.length < 64) return false;
              if (/^https?:\/\//i.test(t)) return true;
              if (t.startsWith('data:image/')) return true;
              // Reject natural-language prompts (common worker mis-map)
              if (/\s/.test(t) && /\b(photo|portrait|woman|photorealistic|masterpiece)\b/i.test(t)) {
                return false;
              }
              // Bare Comfy filename without bytes — not usable
              if (/^[\w./-]+\.(png|jpe?g|webp)$/i.test(t) && t.length < 180) return false;
              // Base64-ish long blob (PNG magic in b64 often starts iVBOR)
              const compact = t.replace(/\s+/g, '');
              if (compact.startsWith('iVBOR') && compact.length > 200) return true;
              if (compact.startsWith('/9j/') && compact.length > 200) return true;
              return compact.length > 500 && /^[A-Za-z0-9+/_=-]+$/.test(compact.slice(0, 120));
            };

            const pushImg = (v: unknown) => {
              if (!v) return;
              if (typeof v === 'string') {
                if (looksLikeImagePayload(v)) images.push(v);
                return;
              }
              if (typeof v === 'object' && v !== null) {
                const o = v as Record<string, unknown>;
                // Prefer binary fields; never use prompt/text/filename alone
                const candidates = [
                  o.data,
                  o.image,
                  o.base64,
                  o.b64_json,
                  o.b64,
                  o.url, // may be https
                ];
                for (const cand of candidates) {
                  if (typeof cand === 'string' && looksLikeImagePayload(cand)) {
                    images.push(cand);
                    return;
                  }
                }
              }
            };

            if (Array.isArray(out?.images)) {
              for (const img of out!.images as unknown[]) pushImg(img);
            }
            pushImg(out?.image);
            // Some workers wrap: { output: { images: [...] } }
            if (out?.output && typeof out.output === 'object') {
              const inner = out.output as Record<string, unknown>;
              if (Array.isArray(inner.images)) {
                for (const img of inner.images) pushImg(img);
              }
              pushImg(inner.image);
            }
            // Only treat message as image if it is clearly a data-URL / base64 blob
            if (typeof out?.message === 'string' && looksLikeImagePayload(out.message)) {
              pushImg(out.message);
            }
            if (Array.isArray(out?.result)) {
              for (const r of out!.result as unknown[]) pushImg(r);
            }

            if (!images.length) {
              // Help debug worker shape without dumping huge base64
              const shape = out
                ? Object.keys(out).reduce<Record<string, string>>((acc, k) => {
                    const v = out[k];
                    if (v == null) acc[k] = 'null';
                    else if (typeof v === 'string') acc[k] = `str:${v.length}`;
                    else if (Array.isArray(v)) acc[k] = `arr:${v.length}`;
                    else if (typeof v === 'object') acc[k] = `obj:${Object.keys(v as object).join(',')}`;
                    else acc[k] = typeof v;
                    return acc;
                  }, {})
                : {};
              failMsg =
                'COMPLETED but no valid image bytes in output. shape=' +
                JSON.stringify(shape).slice(0, 280);
              terminal = 'fail';
              break;
            }
            successResult = {
              images,
              execution_time: status.execution_time,
              job_id: id,
            };
            terminal = 'success';
            break;
          }

          if (status.status === 'FAILED') {
            failMsg =
              status.error ||
              status.output?.error ||
              status.output?.message ||
              JSON.stringify(status.output || status).slice(0, 280);
            terminal = 'fail';
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        if (terminal === 'success' && successResult) {
          logger.info('[runpod] success', {
            strategy: strategy.name,
            id,
            count: successResult.images.length,
          });
          return successResult;
        }

                if (terminal === 'timeout') {
          // Keep queue position — do NOT cancel unless caller opts in.
          const waited = pollBudgetMs;
          if ((options.on_timeout || 'pending') === 'cancel') {
            try {
              await fetch(`${baseUrl}/cancel/${id}`, {
                method: 'POST',
                headers: this.headers,
                signal: AbortSignal.timeout(5000),
              });
            } catch {
              /* ignore */
            }
            throw new Error(
              `RunPod queue timeout (waited ${Math.round(pollBudgetMs / 1000)}s, job ${id}). ` +
                `Endpoint ${endpointId} workers busy/long queue. Retry later or check RunPod console.`,
            );
          }
          logger.info('[runpod] poll budget exceeded — keep job alive', {
            id,
            strategy: strategy.name,
            waited_ms: waited,
            endpoint: endpointId,
          });
          const pendingResult: RunPodGenerateResult = {
            images: [],
            job_id: id,
            pending: true,
            status: (lastStatus as 'IN_QUEUE' | 'IN_PROGRESS') || 'IN_QUEUE',
            endpoint_id: endpointId,
            waited_ms: waited,
            strategy: strategy.name,
          };
          if (options.throw_on_pending !== false) {
            throw new RunPodPendingError({
              job_id: id,
              endpoint_id: endpointId,
              waited_ms: waited,
              status: pendingResult.status || 'IN_QUEUE',
              strategy: strategy.name,
            });
          }
          return pendingResult;
        }

        // FAILED with this payload shape → try next strategy
        errors.push(`${strategy.name}: ${failMsg || 'failed'}`);
        // If the error is clearly "missing workflow" / bad shape, fall through.
        // Otherwise still try next once.
      } catch (e) {
        // Re-throw pending/timeout so caller can resume the same job_id
        if (e instanceof RunPodPendingError) throw e;
        if (
          e instanceof Error &&
          (e.message.startsWith('RunPod queue timeout') ||
            e.message.startsWith('RunPod still queued') ||
            e.message.includes('仍在排队') ||
            e.message.includes('排队超时'))
        ) {
          throw e;
        }
        errors.push(
          `${strategy.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const joined = errors.join(' | ') || 'Unknown error';
    // Auto-fallback retry: if the error is value_not_in_list (missing model/LoRA),
    // retry with FLUX-compatible settings. This handles the case where routing
    // selected Pony/Illustrious models that aren't on the target endpoint.
    if (isModelNotFoundError(joined) && options.model_family !== 'flux') {
      logger.warn('[runpod] model/LoRA not found on endpoint, retrying with FLUX fallback', {
        original_model_family: options.model_family,
        original_checkpoint: options.ckpt_name,
        error: joined.slice(0, 300),
      });

      // Build FLUX-safe fallback options. Use the base FLUX checkpoint with the
      // simple CheckpointLoader (guaranteed on the primary endpoint) — the NSFW
      // split checkpoint may also be missing from the failing worker's volume.
      const fallbackCkpt = process.env.RUNPOD_FLUX_CHECKPOINT || 'flux1-dev-fp8.safetensors';
      const fallbackLoras = (options.loras || [])
        .filter((lora) => {
          // Only keep FLUX-compatible LoRAs (flux_ prefix or known FLUX names)
          const name = lora.name.toLowerCase();
          return name.startsWith('flux_') ||
            name.startsWith('rdanimeflux') ||
            name.startsWith('realistic-mtf') ||
            name.startsWith('anet_') ||
            name === 'flux1-dev-fp8.safetensors';
        })
        .slice(0, 4);

      const fallbackOptions: RunPodGenerateOptions = {
        ...options,
        ckpt_name: fallbackCkpt,
        ckpt_loader: 'checkpoint',
        model_family: 'flux',
        loras: fallbackLoras.length > 0 ? fallbackLoras : undefined,
        lora_name: undefined,
        lora_strength_model: undefined,
        lora_strength_clip: undefined,
      };

      // Retry on the primary FLUX endpoint — the SDXL endpoint that failed
      // validation may not carry any FLUX checkpoints either.
      const sdxlEndpoint = process.env.RUNPOD_ENDPOINT_ID_SDXL;
      if (fallbackOptions.endpoint_id && sdxlEndpoint && fallbackOptions.endpoint_id === sdxlEndpoint) {
        fallbackOptions.endpoint_id = process.env.RUNPOD_ENDPOINT_ID || undefined;
      }

      logger.info('[runpod] FLUX fallback retry', {
        fallback_checkpoint: fallbackCkpt,
        fallback_loras: fallbackLoras.map((l) => l.name),
        fallback_endpoint: endpointId,
      });

      try {
        return await this.generate(fallbackOptions, pollIntervalMs);
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        logger.error('[runpod] FLUX fallback also failed', { error: fbMsg.slice(0, 300) });
        throw new Error(
          'RunPod generation failed (original: ' + joined.slice(0, 200) + ' | fallback: ' + fbMsg.slice(0, 200) + ')',
        );
      }
    }

    const hint =
      endpointId.startsWith('h0p7dpiv')
        ? ' [提示: 端点 h0p7dpiv* 在项目文档中标记为不可用，请把 Vercel RUNPOD_ENDPOINT_ID 改成可用的 Comfy 端点，例如本地 b6r5nhhrddf8dx]'
        : ' [提示: 确认 RUNPOD_ENDPOINT_ID 是 Comfy/FLUX 出图端点；Flux Unchained 需 worker 有 clip_l.safetensors + t5xxl_fp8_e4m3fn.safetensors (models/clip) 与 ae.safetensors (models/vae)]';

    throw new Error(`RunPod generation failed: ${joined}${hint}`);
  }

  /**
   * Generate images and upload to S3, returning public URLs
   *
   *  generation-cache (prompt + params) 24h  OSS  GPU
   *  URL   RunPod    
   *
   *   URL  URL30  resolveImageUrl
   */
  async generateAndUpload(options: RunPodGenerateOptions, folder = 'runpod'): Promise<string[]> {
    const cacheKey = computeCacheKey({
      prompt: options.prompt,
      negativePrompt: options.negative_prompt,
      width: options.width,
      height: options.height,
      steps: options.num_inference_steps,
      guidance: options.guidance_scale,
      model: 'flux-dev',
      kind: 'image',
    });

    // 1. cache hit
    const cachedKey = await lookupCache(cacheKey, 'image');
    if (cachedKey) {
      try {
        const { resolveImageUrl } = await import('./storage');
        const url = await resolveImageUrl(cachedKey);
        if (url) {
          capture('runpod-cache', AnalyticsEvents.IMAGE_CACHED_HIT, { cache_key: cacheKey });
          return [url];
        }
      } catch {}
    }

    // 2. cache miss -> RunPod
    const result = await this.generate({ ...options, throw_on_pending: true });
    if (result.pending || !result.images?.length) {
      throw new Error(
        result.job_id
          ? `RunPod job still pending (${result.job_id}). Resume with job_id.`
          : 'RunPod returned no images',
      );
    }
    const { uploadImageBase64 } = await import('./storage');
    const urls: string[] = [];
    for (let i = 0; i < result.images.length; i++) {
      const raw = result.images[i];
      // Already a hosted URL — use directly
      if (typeof raw === 'string' && /^https?:\/\//i.test(raw)) {
        urls.push(raw);
        continue;
      }
      const { key, url } = await uploadImageBase64(raw, folder, 'image/png');
      urls.push(url);
      if (i === 0) {
        await writeCache(cacheKey, 'image', key);
        capture('runpod-gen', AnalyticsEvents.IMAGE_GENERATED, {
          model: 'flux-dev',
          job_id: result.job_id,
          execution_time_ms: result.execution_time,
        });
      }
    }
    return urls;
  }

  /**
   * Validate and adjust model options before submission.
   * Prevents submit_only jobs from failing with value_not_in_list errors
   * when the endpoint lacks the requested checkpoint or LoRAs.
   * Handles all model families: FLUX, Pony, Illustrious.
   */
  private preflightValidateModelOptions(options: RunPodGenerateOptions): RunPodGenerateOptions {
    const adjusted = { ...options };
    const family = options.model_family || 'flux';

    // Check if SDXL specialist models (Pony/Illustrious) are actually ready.
    // If RUNPOD_SDXL_MODELS_READY is not explicitly 'true', the SDXL endpoint
    // may not have the required checkpoints/LoRAs installed.
    const sdxlReady = process.env.RUNPOD_SDXL_MODELS_READY === 'true';
    // Inventory cross-check: when RUNPOD_SDXL_CHECKPOINTS declares the mounted
    // checkpoint list, a requested checkpoint missing from it means the worker
    // would reject the workflow with value_not_in_list — fall back early.
    const inventory = specialistCheckpointInventory();
    const requestedCkptKey = (adjusted.ckpt_name || '').trim().toLowerCase();
    const checkpointMissingFromInventory = Boolean(
      inventory && requestedCkptKey && !inventory.has(requestedCkptKey),
    );

    // Pony / Illustrious: fall back to FLUX if SDXL models are not ready.
    if ((family === 'pony' || family === 'illustrious') && (!sdxlReady || checkpointMissingFromInventory)) {
      logger.warn('[runpod] SDXL models unavailable, falling back to FLUX', {
        requested_family: family,
        requested_checkpoint: adjusted.ckpt_name,
        sdxl_ready: sdxlReady,
        checkpoint_missing_from_inventory: checkpointMissingFromInventory,
        fallback: 'flux',
      });
      adjusted.model_family = 'flux';
      adjusted.ckpt_name = process.env.RUNPOD_FLUX_CHECKPOINT || 'flux1-dev-fp8.safetensors';
      adjusted.ckpt_loader = 'checkpoint';
      // Clear SDXL-specific LoRAs; they will be re-filtered below.
      adjusted.loras = undefined;
      adjusted.lora_name = null;
      // Also route to the primary FLUX endpoint, not the SDXL one. The SDXL
      // endpoint may or may not have FLUX checkpoints installed; the primary
      // endpoint is guaranteed to. Without this, the request still goes to the
      // SDXL endpoint with FLUX settings and can fail with value_not_in_list.
      const sdxlEndpoint = process.env.RUNPOD_ENDPOINT_ID_SDXL;
      if (adjusted.endpoint_id && sdxlEndpoint && adjusted.endpoint_id === sdxlEndpoint) {
        adjusted.endpoint_id = process.env.RUNPOD_ENDPOINT_ID || undefined;
        logger.warn('[runpod] remapped SDXL endpoint to primary FLUX endpoint', {
          from: sdxlEndpoint,
          to: adjusted.endpoint_id,
        });
      }
    }

    // FLUX checkpoint validation: fluxUnchained requires the NSFW volume to be ready.
    if ((adjusted.model_family || family) === 'flux') {
      const nsfwReady = process.env.RUNPOD_FLUX_NSFW_READY === 'true';
      const requestedCkpt = adjusted.ckpt_name || process.env.RUNPOD_FLUX_NSFW_CHECKPOINT || 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors';
      const safeCkpt = process.env.RUNPOD_FLUX_CHECKPOINT || 'flux1-dev-fp8.safetensors';

      if (requestedCkpt === 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors' && !nsfwReady) {
        logger.warn('[runpod] NSFW checkpoint not ready, falling back to base FLUX checkpoint', {
          requested: requestedCkpt,
          fallback: safeCkpt,
        });
        adjusted.ckpt_name = safeCkpt;
        adjusted.ckpt_loader = 'checkpoint';
        // flux1-dev-fp8 is NOT distilled — the 8-step Unchained budget would
        // produce smeared undercooked frames. Restore the dev-fp8 step floor.
        if ((adjusted.num_inference_steps ?? 0) < 24) {
          logger.warn('[runpod] raising steps for non-distilled FLUX fallback', {
            from: adjusted.num_inference_steps,
            to: 24,
          });
          adjusted.num_inference_steps = 24;
        }
      }
      // IP-Adapter: the FLUX worker must carry Shakker-Labs/ComfyUI-IPAdapter-Flux.
      // When the flag is off, actually strip ip_adapter_image — otherwise the
      // workflow builder still injects ApplyIPAdapterFlux and the worker fails
      // with missing_node_type. Identity keeps flowing through the img2img
      // anchor + identity-anchor prompt. Non-flux families keep the field
      // (buildFluxWorkflow downgrades it to an img2img anchor, no custom node).
      if (adjusted.ip_adapter_image && process.env.RUNPOD_IPADAPTER_INSTALLED !== '1' && adjusted.model_family === 'flux') {
        logger.warn('[runpod] IP-Adapter flag off, stripping ip_adapter_image for flux family', {
          flagStatus: process.env.RUNPOD_IPADAPTER_INSTALLED || 'not set',
        });
        adjusted.ip_adapter_image = undefined;
      }
    }

    // Filter LoRAs against the installed inventory for this model family.
    // Use adjusted.model_family to reflect any fallback (e.g. Pony -> FLUX).
    const effectiveFamily = adjusted.model_family || family;
    const inventoryEnv =
      effectiveFamily === 'flux'
        ? 'RUNPOD_INSTALLED_LORAS_FLUX'
        : effectiveFamily === 'pony'
          ? 'RUNPOD_INSTALLED_LORAS_PONY'
          : effectiveFamily === 'illustrious'
            ? 'RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS'
            : 'RUNPOD_INSTALLED_LORAS_FLUX';
    const installedRaw = process.env[inventoryEnv] || '';
    const installed = new Set(
      installedRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );

    const filterLoras = (loras: Array<{ name: string; strength_model?: number; strength_clip?: number }> | undefined) => {
      if (!loras || loras.length === 0) return loras;
      const kept = loras.filter((l) => {
        const base = l.name.split('/').pop() || l.name;
        const key = base.trim().toLowerCase();
        return installed.size === 0 || installed.has(key);
      });
      if (kept.length !== loras.length) {
        logger.warn('[runpod] filtered LoRAs not present on endpoint', {
          removed: loras.filter((l) => !kept.includes(l)).map((l) => l.name),
        });
      }
      return kept.length > 0 ? kept : undefined;
    };

    adjusted.loras = filterLoras(options.loras);
    if (options.lora_name) {
      const base = options.lora_name.split('/').pop() || options.lora_name;
      const key = base.trim().toLowerCase();
      if (installed.size > 0 && !installed.has(key)) {
        logger.warn('[runpod] dropping single LoRA not present on endpoint', {
          removed: options.lora_name,
        });
        adjusted.lora_name = null;
      }
    }

    return adjusted;
  }

  private refreshConfig(): void {
    const config = getRunPodConfig();
    this.apiKey = config.apiKey;
    this.endpointId = config.endpointId;
    this.baseUrl = config.baseUrl;
  }
}

/** Singleton RunPod client */
export const runpodClient = new RunPodClient();
/**
 * Detect if a RunPod error is due to missing checkpoint or LoRA files.
 * These errors indicate the endpoint doesn't have the requested models installed.
 */
export function isModelNotFoundError(errorText: string): boolean {
  return /value_not_in_list|not in \[|available checkpoint models|no such file/i.test(errorText);
}

/**
 * Extract checkpoint and LoRA names from a workflow validation error.
 * Returns { ckptName, loraNamesNotFound } if detectable, null otherwise.
 */
export function parseModelNotFoundError(errorText: string): {
  ckptName?: string;
  loraNamesNotFound: string[];
} | null {
  const ckptMatch = errorText.match(/ckpt_name:\s*'([^']+)'/);
  const loraMatches = Array.from(errorText.matchAll(/lora_name:\s*'([^']+)'/g));

  if (!ckptMatch && loraMatches.length === 0) return null;

  return {
    ckptName: ckptMatch?.[1],
    loraNamesNotFound: loraMatches.map(m => m[1]),
  };
}
