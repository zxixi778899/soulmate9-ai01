/**
 * ImageService - Unified Image Generation Service
 * Single source of truth for ALL image generation operations
 * 
 * Purpose: Eliminate 6 duplicate routes, unify caching, quota management
 * Status: MVP Implementation (Day 1-2)
 */

import { createHash } from 'crypto';
import {
  resolveImageGenerationRoute,
  TASK_DENOISE_DEFAULTS,
  type ImageGenerationRoute,
} from '@/lib/image-generation-routing';
import { runpodClient, type RunPodGenerateOptions } from '@/lib/runpod';
import { logger } from '@/lib/logger';
import { GenerationCacheStore } from './generation-cache-store';
import { QuotaManager, type MembershipTier } from './quota-manager';
import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';

export interface GenerateOptions {
  prompt: string;
  negativePrompt?: string;
  companionId?: string;
  surface: 'companion' | 'outfit' | 'prop' | 'advert';
  category?: CompanionCategory;
  renderStyle?: AnimeRenderStyle;
  nsfwIntensity?: NsfwIntensity;
  referenceImageUrl?: string; // For img2img
  denoise?: number;           // For img2img
  width?: number;
  height?: number;
  userId?: string;            // For rate limiting & quota
}

export interface GenerateResult {
  url: string;
  cached: boolean;
  jobId?: string;
  durationMs?: number;
  error?: string;
}

/** Daily image quota per membership tier (admin = no cap). */
const IMAGE_QUOTA_BY_TIER: Record<MembershipTier, number> = {
  free: 0,
  pro: 30,
  unlimited: 100,
  admin: Number.POSITIVE_INFINITY,
};

/**
 * Main ImageService class using singleton pattern
 */
export class ImageService {
  private static instance: ImageService;
  
  private cache: GenerationCacheStore;
  private quota: QuotaManager;
  
  private constructor() {
    this.cache = new GenerationCacheStore();
    this.quota = new QuotaManager();
  }
  
  /** Get singleton instance */
  static getInstance(): ImageService {
    if (!ImageService.instance) {
      ImageService.instance = new ImageService();
    }
    return ImageService.instance;
  }
  
  /**
   * Unified entry point for all image generation requests
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Validate user limits (if userId provided)
      if (options.userId) {
        await this.validateUserLimits(options.userId, options.surface);
      }
      
      // Step 2: Check generation cache
      const cacheKey = this.computeCacheKey(options);
      const cachedUrl = await this.cache.get(cacheKey);
      
      if (cachedUrl) {
        logger.info('[ImageService] Cache hit', { 
          cacheKey: cacheKey.slice(0, 8),
          surface: options.surface,
        });
        return { url: cachedUrl, cached: true, durationMs: Date.now() - startTime };
      }
      
      logger.info('[ImageService] Cache miss, generating new image', {
        surface: options.surface,
        nsfw: options.nsfwIntensity,
      });
      
      // Step 3: Resolve generation route (FLUX / SDXL matrix fail-open handled inside)
      const route = resolveImageGenerationRoute(options);
      
      // Step 4: Submit to RunPod (generateAndUpload handles S3 upload + generation cache)
      const runpodOptions = this.buildRunPodOptions(route, options);
      const urls = await runpodClient.generateAndUpload(runpodOptions, `img-${options.surface}`);
      const uploadedUrl = urls[0];
      if (!uploadedUrl) {
        throw new Error('RunPod returned no images');
      }
      
      // Step 5: Record in ImageService cache (SHA-256 keyed)
      await this.cache.set(cacheKey, uploadedUrl, {
        prompt: options.prompt,
        surface: options.surface,
      });
      
      // Step 6: Increment usage counter
      if (options.userId) {
        await this.quota.incrementUsage(options.userId, 'image_generation');
      }
      
      logger.info('[ImageService] Generation complete', {
        durationMs: Date.now() - startTime,
        url: uploadedUrl,
      });
      
      return { 
        url: uploadedUrl, 
        cached: false,
        durationMs: Date.now() - startTime,
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[ImageService] Generation failed', { error: errorMsg, options });
      
      return { 
        url: '', 
        cached: false, 
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }
  
  /** Compute deterministic cache key */
  private computeCacheKey(options: GenerateOptions): string {
    const keyData = {
      prompt: options.prompt.trim().toLowerCase(),
      negativePrompt: options.negativePrompt?.trim().toLowerCase() || '',
      surface: options.surface,
      renderStyle: options.renderStyle,
      nsfwIntensity: options.nsfwIntensity,
      width: options.width,
      height: options.height,
      useReference: !!options.referenceImageUrl,
      denoise: options.denoise,
    };
    
    return createHash('sha-256').update(JSON.stringify(keyData)).digest('hex');
  }
  
  /** Map a resolved route + caller options onto the RunPod client contract. */
  private buildRunPodOptions(
    route: ImageGenerationRoute,
    options: GenerateOptions,
  ): RunPodGenerateOptions {
    const runpodOptions: RunPodGenerateOptions = {
      prompt: options.prompt,
      negative_prompt: options.negativePrompt || route.negativePrompt,
      width: options.width || route.width,
      height: options.height || route.height,
      num_inference_steps: route.steps,
      guidance_scale: route.cfg,
      flux_guidance: route.fluxGuidance,
      sampler_name: route.sampler,
      scheduler: route.scheduler,
      clip_skip: route.clipSkip,
      ckpt_name: route.checkpoint,
      model_family: route.modelFamily,
      endpoint_id: route.endpointId,
    };

    // img2img: reference image drives both the latent input and the IP-Adapter
    // identity lock (face consistency).
    if (options.referenceImageUrl) {
      runpodOptions.input_image = options.referenceImageUrl;
      runpodOptions.denoising_strength = options.denoise ?? TASK_DENOISE_DEFAULTS.portrait;
      runpodOptions.ip_adapter_image = options.referenceImageUrl;
    }

    return runpodOptions;
  }
  
  /** Validate user's membership tier and daily quota */
  private async validateUserLimits(userId: string, surface: string): Promise<void> {
    const membership = await this.quota.getMembership(userId);
    const dailyLimit = IMAGE_QUOTA_BY_TIER[membership];
    if (dailyLimit === Number.POSITIVE_INFINITY) return;

    const dailyCount = await this.quota.getDailyUsage(userId, 'image_generation');
    const remaining = dailyLimit - dailyCount;
    
    if (remaining <= 0) {
      throw new Error(`Image quota exceeded for surface '${surface}'. Please upgrade your plan.`);
    }
  }
}

// Export singleton instance
const imageService = ImageService.getInstance();

export async function generateImage(
  options: Omit<GenerateOptions, 'userId'>
): Promise<GenerateResult> {
  return imageService.generate(options);
}

export async function generateImageWithUser(
  userId: string,
  options: Omit<GenerateOptions, 'userId'>
): Promise<GenerateResult> {
  return imageService.generate({ ...options, userId });
}
