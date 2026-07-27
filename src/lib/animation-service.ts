/**
 * Animation Generation & Lookup Service
 *
 * Manages the lifecycle of pre-rendered portrait animations:
 * - Builds ComfyUI AnimateDiff workflows (img2vid with motion module)
 * - Submits to RunPod serverless endpoint
 * - Polls until complete
 * - Uploads result to Supabase Storage
 * - Tracks records in companion_animations table
 *
 * Env:
 *   RUNPOD_ANIMATEDIFF_ENDPOINT  - RunPod endpoint ID for AnimateDiff worker
 *   RUNPOD_API_KEY               - Shared RunPod API key (same as image gen)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import {
  buildAnimationPrompt,
  getPresetById,
  type CompanionAnimation,
} from '@/lib/animation-presets';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getAnimateDiffConfig(): { apiKey: string; endpointId: string; baseUrl: string } {
  const apiKey = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
  const endpointId = process.env.RUNPOD_ANIMATEDIFF_ENDPOINT || '';
  const baseUrl = endpointId ? `https://api.runpod.ai/v2/${endpointId}` : '';
  return { apiKey, endpointId, baseUrl };
}

/**
 * Check whether the AnimateDiff RunPod endpoint is configured.
 * All generation functions gracefully no-op when this returns false.
 */
export function isAnimationConfigured(): boolean {
  const { apiKey, endpointId } = getAnimateDiffConfig();
  return !!(apiKey && endpointId);
}

// ---------------------------------------------------------------------------
// ComfyUI AnimateDiff Workflow Builder
// ---------------------------------------------------------------------------

/**
 * Build a ComfyUI API-format node graph for AnimateDiff img2vid generation.
 * Follows the same numbered-string-key pattern as buildFluxWorkflow in runpod.ts.
 *
 * Node layout:
 *   1 - CheckpointLoaderSimple (SD1.5 realistic vision)
 *   2 - AnimateDiffLoaderWithContext (motion module)
 *   3 - CLIPTextEncode (positive)
 *   4 - CLIPTextEncode (negative)
 *   5 - LoadImage (reference portrait)
 *   6 - ImageScale (resize to target)
 *   7 - VAEEncode (encode reference to latent)
 *   8 - KSampler (denoise the latent with motion)
 *   9 - VAEDecode (latent -> frames)
 *  10 - SaveAnimatedWEBM (output)
 */
export function buildAnimateDiffWorkflow(opts: {
  prompt: string;
  reference_image: string;
  frames: number;
  fps: number;
  motion_strength: number;
  width: number;
  height: number;
}): Record<string, unknown> {
  const seed = Math.floor(Math.random() * 2 ** 32);
  // Scale motion_strength (1-10) to a denoise range (0.35 - 0.75)
  const denoise = 0.35 + (Math.min(10, Math.max(1, opts.motion_strength)) / 10) * 0.4;

  const graph: Record<string, unknown> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: 'realisticVisionV60B1_v51VAE.safetensors',
      },
    },
    '2': {
      class_type: 'AnimateDiffLoaderWithContext',
      inputs: {
        model: ['1', 0],
        motion_module: 'mm_sd_v15_v2.ckpt',
        motion_strength: opts.motion_strength / 10,
        frame_count: opts.frames,
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: opts.prompt,
        clip: ['1', 1],
      },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text:
          'static, frozen, jittery, flickering, morphing face, deformed, blurry, low quality, watermark, text',
        clip: ['1', 1],
      },
    },
    '5': {
      class_type: 'LoadImage',
      inputs: {
        image: opts.reference_image,
      },
    },
    '6': {
      class_type: 'ImageScale',
      inputs: {
        image: ['5', 0],
        upscale_method: 'lanczos',
        width: opts.width,
        height: opts.height,
        crop: 'center',
      },
    },
    '7': {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['6', 0],
        vae: ['1', 2],
      },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 20,
        cfg: 7,
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        denoise,
        model: ['2', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['7', 0],
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['8', 0],
        vae: ['1', 2],
      },
    },
    '10': {
      class_type: 'SaveAnimatedWEBM',
      inputs: {
        filename_prefix: 'soulmate_anim',
        fps: opts.fps,
        quality: 90,
        images: ['9', 0],
      },
    },
  };

  return graph;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface RunPodJobResponse {
  id: string;
  status?: string;
}

interface RunPodStatusResponse {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output?: {
    videos?: Array<{ data?: string; url?: string; filename?: string }>;
    gifs?: Array<{ data?: string; url?: string; filename?: string }>;
    images?: Array<{ data?: string; url?: string; filename?: string }>;
    [key: string]: unknown;
  };
  error?: string;
  execution_time?: number;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 90; // ~4.5 minutes

/**
 * Generate a single animation for a companion using a preset.
 *
 * Flow:
 * 1. Build AnimateDiff workflow from preset + reference image
 * 2. Submit to RunPod endpoint
 * 3. Poll until COMPLETED / FAILED
 * 4. Upload video to Supabase Storage
 * 5. Insert record into companion_animations table
 */
export async function generateAnimation(
  companionId: string,
  presetId: string,
  referenceImageUrl: string,
  supabase: SupabaseClient,
): Promise<CompanionAnimation> {
  const config = getAnimateDiffConfig();
  if (!config.apiKey || !config.endpointId) {
    throw new Error(
      'AnimateDiff endpoint not configured. Set RUNPOD_ANIMATEDIFF_ENDPOINT and RUNPOD_API_KEY.',
    );
  }

  const preset = getPresetById(presetId);
  if (!preset) {
    throw new Error(`Unknown animation preset: ${presetId}`);
  }

  // Fetch companion data for prompt building
  const { data: companion } = await supabase
    .from('girlfriends')
    .select('name, hair_color, eye_color')
    .eq('id', companionId)
    .maybeSingle();

  const companionAttrs = {
    name: companion?.name || 'companion',
    hair_color: companion?.hair_color || undefined,
    eye_color: companion?.eye_color || undefined,
  };

  const prompt = buildAnimationPrompt(preset, companionAttrs);

  // Resolve reference image to worker-usable form
  const referenceImage = resolveReferenceForWorker(referenceImageUrl);

  const workflow = buildAnimateDiffWorkflow({
    prompt,
    reference_image: referenceImage,
    frames: preset.frames,
    fps: preset.fps,
    motion_strength: preset.motion_strength,
    width: 512,
    height: 768,
  });

  // Insert a "generating" record immediately
  const { data: insertData, error: insertError } = await supabase
    .from('companion_animations')
    .insert({
      companion_id: companionId,
      preset_id: presetId,
      video_url: '',
      thumbnail_url: '',
      duration_ms: (preset.frames / preset.fps) * 1000,
      format: 'webm',
      status: 'generating',
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create animation record: ${insertError.message}`);
  }

  const record = insertData as CompanionAnimation;

  try {
    // Submit to RunPod
    const headers = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };

    const submitRes = await fetch(`${config.baseUrl}/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: {
          prompt: workflow,
          workflow,
          images: referenceImage.startsWith('http')
            ? [{ name: 'ref_input.png', image: referenceImageUrl }]
            : undefined,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new Error(`RunPod submit failed: HTTP ${submitRes.status} ${errText.slice(0, 200)}`);
    }

    const { id: jobId } = (await submitRes.json()) as RunPodJobResponse;
    if (!jobId) {
      throw new Error('RunPod returned no job ID');
    }

    logger.info('[animation] job submitted', {
      jobId,
      companionId,
      presetId,
      endpoint: config.endpointId,
    });

    // Poll until complete
    const videoData = await pollAnimationJob(config.baseUrl, headers, jobId);

    // Upload to Supabase Storage
    const storagePath = `portraits/${companionId}/animations/${presetId}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('portraits')
      .upload(storagePath, Buffer.from(videoData, 'base64'), {
        contentType: 'video/webm',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Build public URL
    const { data: urlData } = supabase.storage.from('portraits').getPublicUrl(storagePath);
    const videoUrl = urlData?.publicUrl || storagePath;

    // Thumbnail: use reference portrait as thumbnail
    const thumbnailUrl = referenceImageUrl;

    // Update record to ready
    const { data: updated, error: updateError } = await supabase
      .from('companion_animations')
      .update({
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        status: 'ready',
      })
      .eq('id', record.id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update animation record: ${updateError.message}`);
    }

    logger.info('[animation] generation complete', {
      companionId,
      presetId,
      videoUrl,
    });

    return updated as CompanionAnimation;
  } catch (err) {
    // Mark as failed
    await supabase
      .from('companion_animations')
      .update({ status: 'failed' })
      .eq('id', record.id);

    logger.error('[animation] generation failed', {
      companionId,
      presetId,
      error: err instanceof Error ? err.message : String(err),
    });

    throw err;
  }
}

/**
 * Poll a RunPod animation job until COMPLETED or FAILED.
 * Returns base64-encoded video data on success.
 */
async function pollAnimationJob(
  baseUrl: string,
  headers: Record<string, string>,
  jobId: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const statusRes = await fetch(`${baseUrl}/status/${jobId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!statusRes.ok) {
      throw new Error(`RunPod status HTTP ${statusRes.status} for job ${jobId}`);
    }

    const status = (await statusRes.json()) as RunPodStatusResponse;

    if (status.status === 'COMPLETED') {
      const output = status.output;
      // AnimateDiff workers may return videos, gifs, or images arrays
      const videoPayload =
        output?.videos?.[0] || output?.gifs?.[0] || output?.images?.[0];

      if (!videoPayload) {
        throw new Error(
          'Animation job COMPLETED but no video output found. Keys: ' +
            JSON.stringify(Object.keys(output || {})).slice(0, 200),
        );
      }

      // Prefer URL (download it) or inline base64 data
      if (videoPayload.url) {
        const dlRes = await fetch(videoPayload.url, { signal: AbortSignal.timeout(30000) });
        if (!dlRes.ok) throw new Error(`Failed to download video: HTTP ${dlRes.status}`);
        const buf = Buffer.from(await dlRes.arrayBuffer());
        return buf.toString('base64');
      }

      if (videoPayload.data) {
        return videoPayload.data;
      }

      throw new Error('Animation output has no data or url field');
    }

    if (status.status === 'FAILED') {
      throw new Error(`Animation job FAILED: ${status.error || 'unknown error'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Animation job timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS}ms`);
}

/**
 * Resolve a reference image URL to a form usable by the RunPod worker.
 * If it is already a URL, return it (worker will download).
 * If it is a storage key, build the public URL.
 */
function resolveReferenceForWorker(imageUrl: string): string {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  // Assume it is a Supabase storage key - build public URL
  const supabaseUrl =
    process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/portraits/${imageUrl.replace(/^\/+/, '')}`;
  }
  return imageUrl;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Get all ready animations for a companion.
 */
export async function getCompanionAnimations(
  companionId: string,
  supabase: SupabaseClient,
): Promise<CompanionAnimation[]> {
  const { data, error } = await supabase
    .from('companion_animations')
    .select('*')
    .eq('companion_id', companionId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true });

  if (error) {
    logger.warn('[animation] failed to fetch animations', {
      companionId,
      error: error.message,
    });
    return [];
  }

  return (data || []) as CompanionAnimation[];
}

/** Slot -> preset mapping for the public API */
const SLOT_PRESET_MAP: Record<string, string> = {
  idle: 'breathing_idle',
  greeting: 'wave_hello',
  reaction: 'giggle',
};

/**
 * Get the animation for a specific UI slot.
 * Maps slots to preset IDs: idle->breathing_idle, greeting->wave_hello, reaction->giggle
 */
export async function getAnimationForSlot(
  companionId: string,
  slot: 'idle' | 'greeting' | 'reaction',
  supabase: SupabaseClient,
): Promise<CompanionAnimation | null> {
  const presetId = SLOT_PRESET_MAP[slot];
  if (!presetId) return null;

  const { data, error } = await supabase
    .from('companion_animations')
    .select('*')
    .eq('companion_id', companionId)
    .eq('preset_id', presetId)
    .eq('status', 'ready')
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn('[animation] slot lookup failed', {
      companionId,
      slot,
      error: error.message,
    });
    return null;
  }

  return (data as CompanionAnimation) || null;
}
