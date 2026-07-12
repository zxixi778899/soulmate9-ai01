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
  // FLUX defaults: lower CFG + empty/minimal negative avoids black frames
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const width = opts.width ?? 832;
  const height = opts.height ?? 1216;
  const steps = Math.max(opts.steps ?? 20, 12);
  // FLUX.1-dev: cfg 1.0–3.5; higher often darkens/destroys image
  const guidance = Math.min(Math.max(opts.guidance ?? 1.0, 1.0), 3.5);
  const sampler_name = opts.sampler_name || 'euler';
  const scheduler = opts.scheduler || 'simple';
  const ckpt = opts.ckpt_name || 'flux1-dev-fp8.safetensors';
  const useLora = !!(opts.lora_name && String(opts.lora_name).trim());

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
  const rawNeg = String(opts.negativePrompt ?? '').trim();
  const negText =
    rawNeg.length > 0 && rawNeg.length < 200
      ? rawNeg
      : '';

  // Node IDs: 1 Checkpoint → 2 pos CLIP → 3 neg CLIP → 4 latent → 5 KSampler → 6 VAE → 7 Save
  // Optional LoRA node 14
  const modelRef: [string, number] = useLora ? ['14', 0] : ['1', 0];
  const clipRef: [string, number] = useLora ? ['14', 1] : ['1', 1];
  const vaeRef: [string, number] = ['1', 2];

  const loraNode = useLora
    ? {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: String(opts.lora_name).trim(),
          strength_model: opts.lora_strength_model ?? 0.8,
          strength_clip: opts.lora_strength_clip ?? 0.8,
          model: ['1', 0],
          clip: ['1', 1],
        },
      }
    : null;

  // img2img path
  if (opts.input_image) {
    const denoise = opts.denoising_strength ?? 0.55;
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
    if (loraNode) graph['14'] = loraNode;
    return graph;
  }

  // txt2img (default) — FLUX-safe empty negative + cfg≈1
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
  if (loraNode) graph['14'] = loraNode;
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
  /** Comfy KSampler sampler_name (FLUX: euler) */
  sampler_name?: string;
  /** Comfy KSampler scheduler (FLUX: simple) */
  scheduler?: string;
  input_image?: string;      // For img2img (character consistency)
  denoising_strength?: number; // 0-1, lower = closer to input
  ckpt_name?: string;
  lora_name?: string | null;
  lora_strength_model?: number;
  lora_strength_clip?: number;
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
    const pollBudgetMs = Math.max(
      15_000,
      Math.min(Number(opts.poll_budget_ms) || Number(process.env.RUNPOD_POLL_MS) || 240_000, 270_000),
    );
    const maxAttempts = Math.max(1, Math.floor(pollBudgetMs / pollIntervalMs));
    const onTimeout = opts.on_timeout || 'pending';
    const started = Date.now();
    let lastStatus = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
        return {
          images,
          execution_time: status.execution_time,
          job_id: jobId,
          pending: false,
          status: 'COMPLETED',
          endpoint_id: endpointId,
          waited_ms: Date.now() - started,
          strategy: opts.strategy,
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
    // FLUX defaults: cfg≈1.0, euler + simple (high CFG / long neg → black frames)
    const workflow = buildFluxWorkflow({
      prompt: promptText,
      negativePrompt: options.negative_prompt,
      width: options.width,
      height: options.height,
      steps: options.num_inference_steps ?? 18,
      guidance: options.guidance_scale ?? 1.0,
      seed: options.seed,
      sampler_name: options.sampler_name || 'euler',
      scheduler: options.scheduler || 'simple',
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
        Number(process.env.RUNPOD_POLL_MS) || 270_000,
        270_000, // ~4.5 min leave headroom for upload + response
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

  private refreshConfig(): void {
    const config = getRunPodConfig();
    this.apiKey = config.apiKey;
    this.endpointId = config.endpointId;
    this.baseUrl = config.baseUrl;
  }
}

/** Singleton RunPod client */
export const runpodClient = new RunPodClient();
