/**
 * RunPod Serverless API Client
 *
 * Handles image generation via RunPod serverless endpoints (ComfyUI / FLUX).
 * Uses async mode only: POST /run → poll /status/{id}.
 *
 * Architecture verified on this endpoint:
 * - CheckpointLoaderSimple with 'flux1-dev-fp8.safetensors'
 * - CLIPTextEncode (positive + negative)
 * - EmptyLatentImage → KSampler → VAEDecode → SaveImage
 */

import fs from 'node:fs';
import { uploadFile } from './storage';

// ────────────────────────────────
// RunPod credentials — MUST come from environment variables
// ────────────────────────────────

function getRunPodConfig(): { apiKey: string; endpointId: string; baseUrl: string } {
  const apiKey = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
  const endpointId = process.env.RUNPOD_ENDPOINT_ID || '';
  // Don't throw at module load time (breaks Next.js build).
  // Validation happens at call time instead.
  const baseUrl = endpointId ? `https://api.runpod.ai/v2/${endpointId}` : '';
  return { apiKey, endpointId, baseUrl };
}

// ────────────────────────────────
// FLUX.1-dev ComfyUI Workflow Template (API format)
// Using CheckpointLoaderSimple (single unified checkpoint file)
// ────────────────────────────────

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
}): Record<string, unknown> {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
  const width = opts.width ?? 768;
  const height = opts.height ?? 1024;
  const steps = opts.steps ?? 28;
  const guidance = opts.guidance ?? 3.5;
  const sampler_name = opts.sampler_name || 'euler';
  const scheduler = opts.scheduler || 'simple';

  return {
    "4": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": "flux1-dev-fp8.safetensors"
      }
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": opts.prompt,
        "clip": ["4", 1]
      }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": opts.negativePrompt ?? 'blurry, low quality, deformed, distorted, ugly, bad anatomy, watermark, text, signature, logo, nsfw, lowres, bad proportions, stiff, unnatural, plastic, artificial, dead eyes, blank expression, gloomy, depressing',
        "clip": ["4", 1]
      }
    },
    "7": {
      "class_type": "EmptyLatentImage",
      "inputs": {
        "width": width,
        "height": height,
        "batch_size": 1
      }
    },
    "8": {
      "class_type": "KSampler",
      "inputs": {
        "seed": seed,
        "steps": steps,
        "cfg": guidance,
        "sampler_name": sampler_name,
        "scheduler": scheduler,
        "denoise": 1,
        "model": ["4", 0],
        "positive": ["5", 0],
        "negative": ["6", 0],
        "latent_image": ["7", 0]
      }
    },
    "9": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["8", 0],
        "vae": ["4", 2]
      }
    },
    "10": {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": "soulmate",
        "images": ["9", 0]
      }
    }
  };
}

// ────────────────────────────────
// Types
// ────────────────────────────────

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

// ────────────────────────────────
// Client
// ────────────────────────────────

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
    if (!this.isConfigured) {
      throw new Error('RunPod is not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.');
    }

    // Build a ComfyUI-compatible workflow with the given prompt
    const workflow = buildFluxWorkflow({
      prompt: options.prompt,
      negativePrompt: options.negative_prompt,
      width: options.width,
      height: options.height,
      steps: options.num_inference_steps ?? 28,
      guidance: options.guidance_scale ?? 3.5,
      seed: options.seed,
      sampler_name: options.scheduler === 'karras' ? 'dpmpp_2m' : 'euler',
      scheduler: options.scheduler ?? 'karras',
    });

    // Step 1: Submit job with workflow
    const requestBody = {
      input: {
        workflow,
      },
    };
    const bodyStr = JSON.stringify(requestBody);
    const debugLog = `[RUNPOD_DEBUG ${new Date().toISOString()}] endpoint: ${this.baseUrl} workflow_keys: ${Object.keys(workflow).join(',')}\n`;
    fs.appendFileSync('/app/work/logs/bypass//dev.log', debugLog);
    const bodyPreview = bodyStr.length > 300 ? bodyStr.substring(0, 300) : bodyStr;
    fs.appendFileSync('/app/work/logs/bypass//dev.log', `[RUNPOD_DEBUG] body_preview: ${bodyPreview}\n`);

    const submitRes = await fetch(`${this.baseUrl}/run`, {
      method: 'POST',
      headers: this.headers,
      body: bodyStr,
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new Error(`RunPod async submit failed (${submitRes.status}): ${errText}`);
    }

    const { id } = await submitRes.json() as { id: string };
    fs.appendFileSync('/app/work/logs/bypass//dev.log', `[RUNPOD_DEBUG] job submitted, id: ${id}\n`);

    // Step 2: Poll until COMPLETED or FAILED
    const maxAttempts = 120;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusRes = await fetch(`${this.baseUrl}/status/${id}`, {
        headers: this.headers,
      });

      if (!statusRes.ok) {
        const errText = await statusRes.text();
        throw new Error(`RunPod status check failed (${statusRes.status}): ${errText}`);
      }

      const status = await statusRes.json() as RunPodJobStatus;

      switch (status.status) {
        case 'COMPLETED': {
          const images: string[] = [];
          if (status.output?.images) {
            for (const img of status.output.images) {
              images.push(img.data); // base64 data
            }
          }
          return {
            images,
            execution_time: status.execution_time,
            job_id: id,
          };
        }
        case 'FAILED':
          try { fs.appendFileSync('/app/work/logs/bypass//dev.log', `[RUNPOD_DEBUG] FAILED id:${id} error:${status.error} full:${JSON.stringify(status).substring(0,1000)}\n`); } catch(e) {}
          throw new Error(`RunPod generation failed: ${status.error || 'Unknown error'}`);
        case 'IN_QUEUE':
        case 'IN_PROGRESS':
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          break;
      }
    }

    throw new Error(`RunPod generation timed out after ${maxAttempts * pollIntervalMs}ms`);
  }

  /**
   * Generate images and upload to S3, returning public URLs
   */
  async generateAndUpload(options: RunPodGenerateOptions, folder = 'runpod'): Promise<string[]> {
    const result = await this.generate(options);

    const urls: string[] = [];
    for (let i = 0; i < result.images.length; i++) {
      const base64 = result.images[i];
      const buffer = Buffer.from(base64, 'base64');
      const filename = `runpod_${Date.now()}_${i}.png`;
      const { url } = await uploadFile(buffer, filename, 'image/png', folder);
      urls.push(url);
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