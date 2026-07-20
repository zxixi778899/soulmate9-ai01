/**
 * fal.ai FLUX.1 Client
 *
 * Fast, reliable image generation fallback when RunPod is busy.
 * fal.ai offers FLUX.1 dev/schnell with 3-5s inference, no queue, 99.9% uptime.
 *
 * Env: FAL_KEY (required for fal.ai provider)
 * Docs: https://fal.ai/models/fal-ai/flux/dev
 */

import { logger } from '@/lib/logger';

const FAL_BASE = 'https://fal.run';

export interface FalGenerateOptions {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  /** Reference image URL for img2img (character consistency) */
  image_url?: string;
  /** Denoising strength for img2img (0-1, lower = closer to reference) */
  strength?: number;
  /** LoRA models to apply */
  loras?: Array<{ path: string; scale?: number }>;
  /** Model variant: 'dev' (quality) or 'schnell' (speed) */
  model?: 'dev' | 'schnell' | 'pro';
}

export interface FalGenerateResult {
  images: string[]; // URLs
  seed?: number;
  inference_time_ms?: number;
}

function getFalKey(): string {
  return process.env.FAL_KEY || '';
}

export function isFalConfigured(): boolean {
  return !!getFalKey();
}

/**
 * Generate images via fal.ai FLUX.1
 * Synchronous call — returns result directly (no polling needed).
 * Typical latency: 3-5 seconds.
 */
export async function falGenerate(options: FalGenerateOptions): Promise<FalGenerateResult> {
  const key = getFalKey();
  if (!key) {
    throw new Error('fal.ai not configured. Set FAL_KEY environment variable.');
  }

  const model = options.model || 'dev';
  const isImg2Img = !!options.image_url;
  const endpoint = isImg2Img
    ? `${FAL_BASE}/fal-ai/flux/${model}/image-to-image`
    : `${FAL_BASE}/fal-ai/flux/${model}`;

  const body: Record<string, unknown> = {
    prompt: options.prompt,
    image_size: {
      width: options.width || 704,
      height: options.height || 960,
    },
    num_inference_steps: options.num_inference_steps || (model === 'schnell' ? 4 : 28),
    guidance_scale: options.guidance_scale ?? (model === 'schnell' ? 0 : 3.5),
    seed: options.seed ?? Math.floor(Math.random() * 2 ** 32),
    enable_safety_checker: false,
  };

  if (options.negative_prompt) {
    body.negative_prompt = options.negative_prompt;
  }
  if (isImg2Img) {
    body.image_url = options.image_url;
    body.strength = options.strength ?? 0.75;
  }
  if (options.loras?.length) {
    body.loras = options.loras.map((l) => ({
      path: l.path,
      scale: l.scale ?? 0.7,
    }));
  }

  const started = Date.now();
  logger.info('[fal] generating', {
    model,
    img2img: isImg2Img,
    prompt_len: options.prompt.length,
    steps: body.num_inference_steps,
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000), // 60s max — fal is usually 3-5s
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.error('[fal] HTTP error', { status: res.status, body: errText.slice(0, 300) });
    throw new Error(`fal.ai HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    images?: Array<{ url?: string; content?: string; width?: number; height?: number }>;
    seed?: number;
    timings?: { inference?: number };
  };

  const images: string[] = [];
  for (const img of data.images || []) {
    if (img.url) images.push(img.url);
    else if (img.content) images.push(img.content);
  }

  if (!images.length) {
    throw new Error('fal.ai returned no images');
  }

  const latency = Date.now() - started;
  logger.info('[fal] success', {
    model,
    count: images.length,
    latency_ms: latency,
    seed: data.seed,
  });

  return {
    images,
    seed: data.seed,
    inference_time_ms: data.timings?.inference ? Math.round(data.timings.inference * 1000) : latency,
  };
}
