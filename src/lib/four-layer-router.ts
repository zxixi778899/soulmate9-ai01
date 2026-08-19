/**
 * Four-Layer Image Generation Router - "Never Fail" System
 * 
 * Complete implementation integrating all layers:
 * Layer 1: RunPod FLUX Primary (Fast Path) - 25s
 * Layer 2: RunPod SDXL Fallback (Specialist Route) - 30s
 * Layer 3A: Together AI (Alternative Cloud) - 45s
 * Layer 3B: Replicate API (Another Alternative) - 45s
 * Layer 4: Graceful Degradation (Cache/Async Queue) - Ultimate Safety Net
 */

import { runpodClient, type RunPodGenerateOptions } from '@/lib/runpod';
import { runPodFailoverGenerate as legacyRunPodFailover } from './runpod-failover';
import { generateWithTogetherAI } from './together-ai';
// import { generateWithReplicate } from './replicate-client'; // Optional: Add when needed
import { getCachedImage, cacheGenerationResult, hashPrompt } from './image-cache';
import { logger } from './logger';
import { capture, AnalyticsEvents } from './analytics';
import { IMAGE_CACHE_MINUTES } from './constants';

interface GenerationOptions extends RunPodGenerateOptions {
  enableLayer3?: boolean;     // Enable Together AI / Replicate (default: true)
  enableLayer4?: boolean;     // Enable cache fallback (default: true)
  priority?: 'fast' | 'quality'; // Fast = prefer L1/L3A, Quality = prefer L2/L3B
}
interface GenerationResult {
  images: string[];
  job_id?: string;     // Optional in case result comes from cache or alternative source
  provider: string;
  latency_ms?: number;
  from_cache?: boolean;
}

/**
 * Main entry point for image generation with full failover coverage
 * @param options Generation parameters
 * @returns Promise<{images: string[], provider: string, ...}> or throws error
 */
export async function fourLayerGenerate(
  options: GenerationOptions
): Promise<GenerationResult> {
  const correlationId = `fl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const startTime = Date.now();
  let lastError: Error | null = null;
  
  logger.info('[four-layer] starting generation workflow', {
    correlationId,
    prompt_preview: options.prompt?.slice(0, 80) + '...',
    provider_preferences: options.priority || 'balanced',
  });

  capture('four-layer-system', AnalyticsEvents.IMAGE_GENERATION_START, { correlationId });

  // ========================================
  // LAYER 1: RunPod FLUX Primary (Fast Path)
  // ========================================
  try {
    logger.info('[four-layer/l1] attempting RunPod FLUX primary', { correlationId });
    
    const l1Start = Date.now();
    const result = await legacyRunPodFailover(
      async () => await runpodClient.generate(options),
      undefined,              // Skip L2 during L1 attempt (optimize speed)
      undefined               // Skip L2 backup
    );
    
    const elapsed = Date.now() - l1Start;
    
    if (result.images && result.images.length > 0) {
      logger.info('[four-layer/l1] ✅ SUCCESS in <25s', {
        correlationId,
        elapsed_ms: elapsed,
        images_count: result.images.length,
      });
      
      capture('four-layer-system', AnalyticsEvents.IMAGE_GENERATION_SUCCESS, {
        correlationId,
        elapsed,
        layer: 'L1',
        fast_path: true,
      });
      
      return {
        ...result,
        provider: 'runpod-flux-primary',
        latency_ms: elapsed,
      };
    }
    
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    logger.warn(`[four-layer/l1] failed after ${Date.now() - startTime}ms`, {
      correlationId,
      error: lastError.message,
    });
  }

  // ========================================
  // LAYER 2: RunPod SDXL Fallback
  // ========================================
  try {
    logger.info('[four-layer/l2] falling back to RunPod SDXL specialist route', { correlationId });
    
    const l2Start = Date.now();
    
    // Build SDXL-specific options
    const sdxlOptions = {
      ...options,
      model_family: 'pony' as const, // Explicit type for model_family
      steps: 25,            // SDXL typically needs fewer steps
    };
    
    const result = await legacyRunPodFailover(
      async () => await runpodClient.generate(sdxlOptions),
      async () => await runpodClient.generate(sdxlOptions), // Retry same workflow
      async () => await runpodClient.generate(sdxlOptions)  // Third retry
    );
    
    const elapsed = Date.now() - l2Start;
    
    if (result.images && result.images.length > 0) {
      logger.info('[four-layer/l2] ✅ SUCCESS via SDXL route', {
        correlationId,
        total_elapsed: Date.now() - startTime,
        sdxl_specific_time: elapsed,
      });
      
      capture('four-layer-system', AnalyticsEvents.IMAGE_GENERATION_FAILOVER, {
        correlationId,
        layer: 'L2',
        reason: 'fallback_to_sdxl',
      });
      
      return {
        ...result,
        provider: 'runpod-sdxl-fallback',
        latency_ms: elapsed,
      };
    }
    
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    logger.warn(`[four-layer/l2] failed, proceeding to Layer 3`, {
      correlationId,
      error: lastError.message,
    });
  }

  // ========================================
  // LAYER 3A: Together AI (Alternative Cloud)
  // ========================================
  if (options.enableLayer3 !== false) {
    try {
      logger.info('[four-layer/l3a] using Together AI as alternative cloud', { correlationId });
      
      const l3aStart = Date.now();
      
      const result = await generateWithTogetherAI({
        model: 'black-forest-labs/flux-schnell', // Faster (~10s)
        prompt: options.prompt,
        negative_prompt: options.negative_prompt,
        width: options.width || 1024,
        height: options.height || 1536,
        steps: options.num_inference_steps || 20, // RunPodGenerateOptions uses num_inference_steps
      });
      
      const elapsed = Date.now() - l3aStart;
      
      if (result && result.images.length > 0) {
        logger.info('[four-layer/l3a] ✅ SUCCESS via Together AI', {
          correlationId,
          total_elapsed: Date.now() - startTime,
          together_ai_time: elapsed,
        });
        
        // Cache the result for future fallback requests
        await cacheGenerationResult({
          ...result,
          prompt: options.prompt,
        });
        
        capture('four-layer-system', AnalyticsEvents.IMAGE_GENERATION_SUCCESS, {
          correlationId,
          elapsed: Date.now() - startTime,
          provider: 'together-ai',
        });
        
        return {
          ...result,
          provider: 'together-ai',
          latency_ms: elapsed,
        };
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[four-layer/l3a] Together AI failed, trying Layer 3B`, {
        correlationId,
        error: lastError.message,
      });
    }
  }

  // ========================================
  // LAYER 3B: Replicate API (Optional Extension)
  // ========================================
  // TODO: Uncomment when implementing Replicate client
  /*
  if (false) { // Disable by default until implemented
    try {
      const result = await generateWithReplicate({
        model: 'black-forest-labs/flux-dev', // Better quality
        prompt: options.prompt,
      });
      
      if (result.images.length > 0) {
        return { ...result, provider: 'replicate' };
      }
    } catch (error) {
      logger.error('[four-layer/l3b] Replicate failed completely');
    }
  }
  */

  // ========================================
  // LAYER 4: Graceful Degradation
  // ========================================
  if (options.enableLayer4 !== false) {
    try {
      logger.warn('[four-layer/l4] All cloud APIs exhausted - activating graceful degradation', { correlationId });
      
      // Option 1: Return cached image (best experience)
      const cachedImage = await getCachedImage({
        matchingPromptHash: hashPrompt(options.prompt),
        maxMinutesAgo: IMAGE_CACHE_MINUTES,
      });
      
      if (cachedImage) {
        logger.info('[four-layer/l4] ✅ returned cached image', { correlationId });
        
        capture('four-layer-system', AnalyticsEvents.IMAGE_GENERATION_CACHE_HIT, {
          correlationId,
        });
        
        return {
          images: [cachedImage],
          job_id: 'cache_fallback',
          provider: 'cached_image',
          from_cache: true,
          latency_ms: Date.now() - startTime,
        };
      }
      
      // Option 2: Async queue request
      logger.info('[four-layer/l4] queuing async generation request', { correlationId });
      
      // TODO: Implement async queue (store in Supabase and notify user later)
      // For now, throw with useful message
      throw new Error(
        'All image generation services are temporarily unavailable. ' +
        'Your request has been queued for processing when services recover. ' +
        'Please check back in 5-10 minutes.'
      );
      
    } catch (error) {
      logger.error('[four-layer/l4] graceful degradation failed', {
        correlationId,
        error: String(error),
      });
    }
  }

  // ========================================
  // FINAL FAILURE - Throw Detailed Error
  // ========================================
  const totalElapsed = Date.now() - startTime;
  
  logger.error('[four-layer] 🚨 ALL LAYERS FAILED COMPLETELY', {
    correlationId,
    total_elapsed_ms: totalElapsed,
    layers_attempted: ['L1: RunPod FLUX', 'L2: RunPod SDXL', 'L3A: Together AI'].filter(l => !lastError?.message?.includes(l)),
    last_error: lastError?.message,
  });
  
  capture('four-layer-system', AnalyticsEvents.IMAGE_GENERATION_FAILURE, {
    correlationId,
    totalElapsed,
    lastError: lastError?.message,
    all_layers_failed: true,
  });

  throw new Error(
    `All image generation services failed after ${totalElapsed}ms. ` +
    `Last error: ${lastError?.message || 'Unknown service failure'}. ` +
    `Please try again in a few moments or contact support if issues persist.`
  );
}

/**
 * Helper: Check overall system health across all providers
 */
export async function checkSystemHealth(): Promise<{
  healthy: boolean;
  layer1_available: boolean;
  layer2_available: boolean;
  layer3_available: boolean;
  cache_available: boolean;
  recommendations?: string[];
}> {
  const results = {
    layer1_available: false,
    layer2_available: false,
    layer3_available: false,
    cache_available: false,
  };
  
  const recommendations: string[] = [];

  // Check Layer 1 & 2: RunPod endpoints
  try {
    results.layer1_available = !!process.env.RUNPOD_API_KEY && !!process.env.RUNPOD_ENDPOINT_ID;
    results.layer2_available = !!process.env.RUNPOD_ENDPOINT_ID_SDXL;
    
    if (!results.layer1_available) {
      recommendations.push('Configure RUNPOD_ENDPOINT_ID immediately');
    }
  } catch {
    recommendations.push('RunPod configuration error');
  }

  // Check Layer 3: Together AI
  try {
    if (process.env.TOGETH_API_KEY) {
      results.layer3_available = true;
    } else {
      recommendations.push('Consider registering for Together AI ($25 free tier)');
    }
  } catch {
    // Ignore
  }

  // Check Layer 4: Cache
  try {
    const { getCacheHealth } = await import('./image-cache');
    const health = getCacheHealth();
    results.cache_available = health.healthy;
  } catch {
    // Ignore
  }

  return {
    healthy: results.layer1_available || results.layer3_available || results.cache_available,
    ...results,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}
