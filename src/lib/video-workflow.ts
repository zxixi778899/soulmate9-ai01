/**
 * Video Generation Workflow Builder for RunPod ComfyUI
 * 
 * Supports:
 * - Text-to-video (5-10s clips)
 * - Image-to-video (animate companion portrait)
 * - Style transfer (apply cinematic effects)
 * 
 * @priority P2
 */

export interface VideoGenerationParams {
  prompt: string;
  negativePrompt?: string;
  duration: 5 | 10;  // seconds
  fps?: number;      // frames per second (default 12)
  resolution?: '512x512' | '768x768' | '1024x1024';
  inputFileImage?: string;  // For img2vid
  denoise?: number;         // img2vid denoise strength
  seed?: number;
}

export function buildVideoWorkflow(params: VideoGenerationParams): Record<string, unknown> {
  const {
    prompt,
    negativePrompt = 'blurry, low quality, distorted face',
    duration,
    fps = 12,
    resolution = '512x512',
    inputFileImage,
    seed = Math.floor(Math.random() * 2 ** 32),
  } = params;

  const [width, height] = resolution.split('x').map(Number);
  const frameCount = duration * fps;

  const graph: Record<string, unknown> = {};

  // ─── Model Loaders ─────────────────────────────────────────────
  graph['1'] = {
    class_type: 'UNETLoader',
    inputs: {
      unet_name: 'animatediff-motion-v1-0.ckpt',
      weight_dtype: 'default',
    },
  };

  graph['2'] = {
    class_type: 'DualCLIPLoader',
    inputs: {
      clip_name1: process.env.RUNPOD_FLUX_CLIP || 'clip_l.safetensors',
      clip_name2: process.env.RUNPOD_FLUX_T5 || 't5xxl_fp8_e4m3fn.safetensors',
      type: 'flux',
    },
  };

  graph['3'] = {
    class_type: 'VAELoader',
    inputs: {
      vae_name: process.env.RUNPOD_FLUX_VAE || 'ae.safetensors',
    },
  };

  // ─── CLIP Encoding ─────────────────────────────────────────────
  graph['4'] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: prompt, clip: ['2', 0] },
  };

  graph['5'] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: negativePrompt, clip: ['2', 0] },
  };

  // ─── Latent Initialization ─────────────────────────────────────
  if (inputFileImage) {
    // img2vid: Start from reference image
    graph['10'] = {
      class_type: 'LoadImage',
      inputs: { image: inputFileImage },
    };

    graph['11'] = {
      class_type: 'ImageScale',
      inputs: {
        image: ['10', 0],
        upscale_method: 'lanczos',
        width,
        height,
        crop: 'disabled',
      },
    };

    graph['12'] = {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['11', 0],
        vae: ['3', 0],
      },
    };

    // Use encoded image as starting frame for video diffusion
    graph['6'] = {
      class_type: 'EmptyLatentVideo',
      inputs: {
        width,
        height,
        frames: frameCount,
        batch_size: 1,
      },
    };
  } else {
    // txt2vid: Generate from scratch
    graph['6'] = {
      class_type: 'EmptyLatentVideo',
      inputs: {
        width,
        height,
        frames: frameCount,
        batch_size: 1,
      },
    };
  }

  // ─── AnimateDiff Motion Module ─────────────────────────────────
  graph['20'] = {
    class_type: 'AnimateDiffLoader',
    inputs: {
      model: ['1', 0],
      motion_model: 'v3_sd15_mm.ckpt',
      beta_schedule: 'sqrt_linear',
    },
  };

  // ─── Video Sampler ─────────────────────────────────────────────
  graph['7'] = {
    class_type: 'KSamplerAdvanced',
    inputs: {
      add_noise: 'enable',
      noise_seed: seed,
      steps: 20,
      cfg: 7.5,
      sampler_name: 'euler_ancestral',
      scheduler: 'normal',
      start_at_step: 0,
      end_at_step: 20,
      return_with_leftover_noise: 'disable',
      model: ['20', 0],
      positive: ['4', 0],
      negative: ['5', 0],
      latent_image: inputFileImage ? ['12', 0] : ['6', 0],
    },
  };

  // ─── VAE Decode ────────────────────────────────────────────────
  graph['8'] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: ['7', 0],
      vae: ['3', 0],
    },
  };

  // ─── Video Save ────────────────────────────────────────────────
  graph['9'] = {
    class_type: 'VHS_VideoCombine',
    inputs: {
      frame_rate: fps,
      loop_count: 0,
      filename_prefix: 'soulmate_video',
      format: 'video/h264-mp4',
      pingpong: false,
      save_output: true,
      images: ['8', 0],
    },
  };

  return graph;
}

/**
 * Calculate video generation cost based on duration
 */
export function calculateVideoCost(duration: 5 | 10): number {
  return duration === 5 ? 200 : 350;
}

/**
 * Estimate generation time
 */
export function estimateGenerationTime(duration: 5 | 10): string {
  return duration === 5 ? '~15 seconds' : '~30 seconds';
}
