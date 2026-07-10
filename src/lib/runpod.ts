/**
 * RunPod Serverless API Client
 *
 * Handles image generation via RunPod serverless endpoints (ComfyUI / FLUX).
 * Uses async mode only: POST /run  poll /status/{id}.
 *
 * Architecture verified on this endpoint:
 * - CheckpointLoaderSimple with 'flux1-dev-fp8.safetensors'
 * - CLIPTextEncode (positive + negative)
 * - EmptyLatentImage  KSampler  VAEDecode  SaveImage
 */

import { uploadFile } from './storage';
import { computeCacheKey, lookupCache, writeCache } from './generation-cache';
import { capture, AnalyticsEvents } from './analytics';
import { logger } from './logger';

// 
// RunPod credentials  MUST come from environment variables
// 

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
// Using CheckpointLoaderSimple (single unified checkpoint file)
// 

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
  seed?: number;
  sampler_name?: string;
  scheduler?: string;
  /** Worker-local filename registered via RunPod `images` payload, or path for LoadImage */
  input_image?: string;
  denoising_strength?: number;
  /** Checkpoint filename as seen by Comfy on the worker / network volume */
  ckpt_name?: string;
  /** LoRA filename under models/loras (network volume supported if mounted) */
  lora_name?: string | null;
  lora_strength_model?: number;
  lora_strength_clip?: number;
}): Record<string, unknown> {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const width = opts.width ?? 832;
  const height = opts.height ?? 1216;
  const steps = opts.steps ?? 28;
  const guidance = opts.guidance ?? 3.5;
  const sampler_name = opts.sampler_name || 'euler';
  const scheduler = opts.scheduler || 'simple';
  const ckpt = opts.ckpt_name || 'flux1-dev-fp8.safetensors';
  const useLora = !!(opts.lora_name && String(opts.lora_name).trim());

  const promptText = String(opts.prompt || '').trim();
  if (!promptText) {
    throw new Error('buildFluxWorkflow: empty prompt');
  }

  const negText =
    opts.negativePrompt ??
    'blurry, low quality, deformed, distorted, ugly, bad anatomy, watermark, text, signature, logo, lowres, bad proportions, child, underage';

  // Node IDs aligned with generate-from-meta (proven on soulmate FLUX fp8 workers)
  // 1 Checkpoint → 2/3 CLIP encode → 4 latent → 5 KSampler → 6 VAEDecode → 7 Save
  // Optional LoRA as node 14 between checkpoint and encode.
  const modelRef: [string, number] = useLora ? ['14', 0] : ['1', 0];
  const clipRef: [string, number] = useLora ? ['14', 1] : ['1', 1];
  const vaeRef: [string, number] = ['1', 2];

  // img2img path
  if (opts.input_image) {
    const denoise = opts.denoising_strength ?? 0.65;
    const graph: Record<string, unknown> = {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: ckpt },
      },
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
          cfg: guidance,
          sampler_name,
          scheduler,
          denoise,
          model: modelRef,
          positive: ['2', 0],
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
        inputs: { image: opts.input_image },
      },
      '12': {
        class_type: 'ImageScale',
        inputs: {
          image: ['11', 0],
          upscale_method: 'lanczos',
          width,
          height,
          crop: 'center',
        },
      },
      '13': {
        class_type: 'VAEEncode',
        inputs: { pixels: ['12', 0], vae: vaeRef },
      },
    };
    if (useLora) {
      graph['14'] = {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: String(opts.lora_name).trim(),
          strength_model: opts.lora_strength_model ?? 0.8,
          strength_clip: opts.lora_strength_clip ?? 0.8,
          model: ['1', 0],
          clip: ['1', 1],
        },
      };
    }
    return graph;
  }

  // txt2img (default) — same structure as admin generate-from-meta
  const graph: Record<string, unknown> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: ckpt },
    },
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
      inputs: { width, height, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: guidance,
        sampler_name,
        scheduler,
        denoise: 1.0,
        model: modelRef,
        positive: ['2', 0],
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
  if (useLora) {
    graph['14'] = {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: String(opts.lora_name).trim(),
        strength_model: opts.lora_strength_model ?? 0.8,
        strength_clip: opts.lora_strength_clip ?? 0.8,
        model: ['1', 0],
        clip: ['1', 1],
      },
    };
  }
  return graph;
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
  num_images?: number;
  seed?: number;
  scheduler?: string;
  input_image?: string;      // For img2img (character consistency)
  denoising_strength?: number; // 0-1, lower = closer to input
  ckpt_name?: string;
  lora_name?: string | null;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  /** Override default RUNPOD_ENDPOINT_ID for this call */
  endpoint_id?: string;
}

export interface RunPodGenerateResult {
  images: string[];
  execution_time?: number;
  job_id?: string;
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

  /**
   * Generate images via RunPod (async polling).
   * Uses ComfyUI API workflow format internally.
   */
  async generate(options: RunPodGenerateOptions, pollIntervalMs = 3000): Promise<RunPodGenerateResult> {
    this.refreshConfig();
    const endpointId = options.endpoint_id || this.endpointId;
    const baseUrl = endpointId ? `https://api.runpod.ai/v2/${endpointId}` : this.baseUrl;
    if (!this.apiKey || !endpointId) {
      throw new Error('RunPod is not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.');
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
        logger.warn('[runpod] failed to resolve input_image, falling back to txt2img', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const promptText = String(options.prompt || '').trim();
    if (!promptText) {
      throw new Error('prompt is required (empty positive prompt)');
    }

    // Build a ComfyUI-compatible workflow with the given prompt
    const workflow = buildFluxWorkflow({
      prompt: promptText,
      negativePrompt: options.negative_prompt,
      width: options.width,
      height: options.height,
      steps: options.num_inference_steps ?? 28,
      guidance: options.guidance_scale ?? 3.5,
      seed: options.seed,
      sampler_name: options.scheduler === 'karras' ? 'dpmpp_2m' : 'euler',
      scheduler: options.scheduler ?? 'karras',
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
      lora_name: options.lora_name,
      lora_strength_model: options.lora_strength_model,
      lora_strength_clip: options.lora_strength_clip,
    });

    const imagesPayload =
      inputImageName && inputImageB64
        ? {
            images: [
              {
                name: inputImageName,
                image: inputImageB64,
              },
            ],
          }
        : {};

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

    // Short budget per strategy so batch can fall through quickly on hard fail
    const maxAttempts = Math.floor(90000 / pollIntervalMs) || 1;
    const errors: string[] = [];

    for (const strategy of strategies) {
      try {
        logger.info('[runpod] submit strategy', {
          strategy: strategy.name,
          endpoint: endpointId,
          workflow_nodes: Object.keys(workflow).length,
          prompt_len: promptText.length,
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
          continue;
        }

        const { id } = (await submitRes.json()) as { id: string };
        if (!id) {
          errors.push(`${strategy.name}: no job id`);
          continue;
        }

        logger.debug('[runpod] job submitted', { id, strategy: strategy.name });

        let terminal: 'success' | 'fail' | 'timeout' = 'timeout';
        let successResult: RunPodGenerateResult | null = null;
        let failMsg = '';

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

          if (status.status === 'COMPLETED') {
            const images: string[] = [];
            if (status.output?.images) {
              for (const img of status.output.images) {
                const raw = typeof img === 'string' ? img : img?.data;
                if (raw) images.push(raw);
              }
            }
            if (!images.length) {
              failMsg = 'COMPLETED but no images in output';
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
          errors.push(
            `${strategy.name}: timeout ${maxAttempts * pollIntervalMs}ms (job ${id}) — worker 可能冷启动过久或端点无可用 worker`,
          );
        } else {
          errors.push(`${strategy.name}: ${failMsg || 'failed'}`);
        }
      } catch (e) {
        errors.push(
          `${strategy.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const joined = errors.join(' | ') || 'Unknown error';
    const hint =
      endpointId.startsWith('h0p7dpiv')
        ? ' [提示: 端点 h0p7dpiv* 在项目文档中标记为不可用，请把 Vercel RUNPOD_ENDPOINT_ID 改成可用的 Comfy 端点，例如本地 b6r5nhhrddf8dx]'
        : ' [提示: 确认 RUNPOD_ENDPOINT_ID 是 Comfy/FLUX 出图端点，且 worker 上有 flux1-dev-fp8.safetensors]';

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
    const result = await this.generate(options);
    const urls: string[] = [];
    for (let i = 0; i < result.images.length; i++) {
      const base64 = result.images[i];
      const buffer = Buffer.from(base64, 'base64');
      const filename = `runpod_${Date.now()}_${i}.png`;
      const { key, url } = await uploadFile(buffer, filename, 'image/png', folder);
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

  private refreshConfig(): void {
    const config = getRunPodConfig();
    this.apiKey = config.apiKey;
    this.endpointId = config.endpointId;
    this.baseUrl = config.baseUrl;
  }
}

/** Singleton RunPod client */
export const runpodClient = new RunPodClient();
