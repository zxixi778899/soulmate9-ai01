/**
 * Smart Image Generation Module
 *
 * Key Feature: IP-Adapter ONLY enabled for img2img mode
 * - txt2img (default): No face lock, random faces generated
 * - img2img: IP-Adapter active, maintains facial consistency
 * - hybrid: Both img2img and IP-Adapter active
 */

import { runpodClient, type RunPodGenerateOptions, type RunPodGenerateResult } from '@/lib/runpod';
import { detectCompositionFromPrompt } from './prompt-composition-detect';
import { logger } from '@/lib/logger';

export interface SmartGenerateOptions {
  /** Core prompt input */
  prompt: string;

  /** Reference image for img2img AND IP-Adapter face consistency */
  referenceImage?: string;

  /** Negative prompt (optional) */
  negativePrompt?: string;

  /** Mode selection */
  mode?: 'txt2img' | 'img2img' | 'hybrid';

  /** Whether to auto-enable IP-Adapter based on referenceImage presence */
  enableAutoIpAdapter?: boolean;

  /** Auto composition detection (on/off) */
  enableAutoComposition?: boolean;

  /** Force specific composition type */
  forceComposition?: 'headshot' | 'portrait' | 'fullbody' | 'scene';

  /** Force IP-Adapter on regardless of mode gating */
  forceIpAdapter?: boolean;

  /** img2img denoise strength (default 0.55 when IP-Adapter path is active) */
  denoising_strength?: number;

  /** Model family routed to the RunPod endpoint */
  model_family?: 'flux' | 'pony' | 'illustrious' | 'sdxl';

  /** Number of images per generation */
  num_images?: number;

  /** Sampling steps */
  num_inference_steps?: number;

  /** Optional seed for reproducible output */
  seed?: number;
}

export interface SmartGenerateResult {
  images: string[];
  compositionType: string;
  appliedPrompts: string[];
  detectedSize: { width: number; height: number };
  ipAdapterUsed: boolean;
}

/**
 * Smart Generate - Core function with selective IP-Adapter usage
 */
export async function smartGenerate(opts: SmartGenerateOptions): Promise<SmartGenerateResult> {
  const {
    prompt,
    referenceImage,
    negativePrompt,
    mode = 'txt2img', // default to txt2img (no face lock)
    enableAutoIpAdapter = true,
    enableAutoComposition = true,
    forceComposition,
    forceIpAdapter,
    denoising_strength,
    model_family,
    num_images,
    num_inference_steps,
    seed,
  } = opts;

  logger.debug('[smart-generate] Starting generation', {
    mode,
    hasReference: !!referenceImage,
    autoIpAdapter: enableAutoIpAdapter,
  });

  // === COMPOSITION DETECTION ===
  let sizeInfo: ReturnType<typeof detectCompositionFromPrompt> | null = null;
  if (enableAutoComposition && !forceComposition) {
    try {
      sizeInfo = detectCompositionFromPrompt(prompt);
    } catch (error) {
      logger.warn('[smart-generate] Composition detection failed, using defaults', { error });
    }
  }

  // === PROMPT ENHANCEMENT ===
  let finalPrompt = prompt;
  let additionalPrompts: string[] = [];

  if (sizeInfo) {
    additionalPrompts = sizeInfo.additionalPrompts || [];

    if (sizeInfo.compositionType === 'fullbody') {
      finalPrompt += ', full body portrait, complete outfit visible, standing pose';
    } else if (sizeInfo.compositionType === 'headshot') {
      finalPrompt += ', professional headshot, sharp focus on face, bokeh background';
    } else if (sizeInfo.compositionType === 'scene') {
      finalPrompt += ', cinematic scene, atmospheric lighting, wide angle view';
    }
  } else if (forceComposition === 'fullbody') {
    finalPrompt += ', full body shot, entire body visible, detailed clothing';
  } else if (forceComposition === 'headshot') {
    finalPrompt += ', extreme close-up, face detail only, high quality portrait';
  }

  // === SIZE PARAMETER ===
  let width: number | undefined;
  let height: number | undefined;

  if (sizeInfo) {
    width = sizeInfo.width;
    height = sizeInfo.height;
  } else if (forceComposition) {
    switch (forceComposition) {
      case 'headshot':
        width = 512;
        height = 768;
        break;
      case 'fullbody':
        width = 768;
        height = 1024;
        break;
      case 'scene':
        width = 1280;
        height = 720;
        break;
    }
  }

  // === IP-ADAPTER ENABLE LOGIC ===
  // Only enable for img2img mode or when explicitly requested
  const shouldUseIpAdapter = Boolean(
    referenceImage &&
      enableAutoIpAdapter &&
      (mode === 'img2img' || mode === 'hybrid' || forceIpAdapter),
  );

  const runpodOptions: RunPodGenerateOptions = {
    prompt: finalPrompt,
    negative_prompt: negativePrompt,
    width,
    height,
    model_family,
    num_images,
    num_inference_steps,
    seed,
  };

  // Apply IP-Adapter AND input_image ONLY when conditions are met
  if (shouldUseIpAdapter && referenceImage) {
    runpodOptions.input_image = referenceImage; // img2img base
    runpodOptions.ip_adapter_image = referenceImage; // face identity lock
    runpodOptions.denoising_strength = denoising_strength ?? 0.55;

    logger.info('[smart-generate] IP-Adapter & img2img enabled', {
      mode,
      referenceImage,
    });
  } else {
    // txt2img mode - NO face lock, random new faces
    logger.debug('[smart-generate] IP-Adapter disabled (txt2img)', { mode });
  }

  // === GENERATE IMAGE ===
  const result: RunPodGenerateResult = await runpodClient.generate(runpodOptions);

  logger.info('[smart-generate] Generation completed', {
    compositionType: sizeInfo?.compositionType || forceComposition || 'portrait',
    numImages: result.images?.length || 0,
    ipAdapterUsed: shouldUseIpAdapter,
  });

  return {
    images: result.images || [],
    compositionType: sizeInfo?.compositionType || forceComposition || 'portrait',
    appliedPrompts: additionalPrompts,
    detectedSize: { width: width || 1024, height: height || 1280 },
    ipAdapterUsed: shouldUseIpAdapter,
  };
}

/**
 * Helper for SDXL model compatibility
 */
export async function smartGenerateSDXL(
  opts: Omit<SmartGenerateOptions, 'mode' | 'model_family'> & {
    model_family?: 'sdxl' | 'pony' | 'illustrious';
  },
): Promise<SmartGenerateResult> {
  return smartGenerate({
    ...opts,
    mode: 'txt2img',
    model_family: opts.model_family || 'sdxl',
  });
}

/**
 * Face consistency batch generator (for img2img mode only)
 */
export async function generateWithFaceConsistency(
  baseImage: string, // Reference image for face locking
  variations: Array<{
    description: string;
    style?: string;
    composition?: 'headshot' | 'portrait' | 'fullbody' | 'scene';
  }>,
): Promise<
  Array<{
    variation: string;
    image: string;
    prompt: string;
  }>
> {
  const results = await Promise.all(
    variations.map(async (variation) => {
      let enhancedPrompt = `photorealistic portrait, ${variation.description}`;

      if (variation.composition === 'fullbody') {
        enhancedPrompt += ', full body shot, standing pose';
      } else if (variation.composition === 'headshot') {
        enhancedPrompt += ', close-up, headshot, face focus';
      } else if (variation.composition === 'scene') {
        enhancedPrompt += ', cinematic scene, wide angle';
      }

      if (variation.style) {
        if (variation.style.includes('写实')) {
          enhancedPrompt += ', photorealistic, 8k, highly detailed';
        } else if (variation.style.includes('动漫')) {
          enhancedPrompt += ', anime style, manga illustration';
        } else if (variation.style.includes('艺术')) {
          enhancedPrompt += ', digital art, artistic rendering';
        }
      }

      // Use img2img mode for face consistency
      const result = await smartGenerate({
        prompt: enhancedPrompt,
        referenceImage: baseImage, // Pass reference image
        mode: 'img2img', // Explicitly enable img2img+IP-Adapter
        forceComposition: variation.composition,
      });

      return {
        variation: variation.description,
        image: result.images[0],
        prompt: enhancedPrompt,
      };
    }),
  );

  return results;
}
