/**
 * Together AI Client for Image Generation
 * 
 * Alternative cloud provider when RunPod endpoints are unavailable.
 * Free tier available: $25 credits (~500 images)
 * URL: https://www.together.ai/
 * 
 * Recommended FLUX Models on Together AI:
 * - black-forest-labs/flux-schnell (Fast, cost-effective, ~10s per image)
 * - black-forest-labs/flux-dev (Higher quality, recommended for portraits)
 */

import { logger } from './logger';

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
const TOGETHER_GENERATIONS_URL = 'https://api.together.xyz/v1/images/generations';

interface TogetherAIOptions {
  model?: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
}

/**
 * Generate image using Together AI's FLUX models
 * @param options Generation parameters
 * @returns Promise<{images: string[], job_id: string, provider: 'together-ai'} | null>
 */
export async function generateWithTogetherAI(options: TogetherAIOptions): Promise<{
  images: string[];
  job_id: string;
  provider: 'together-ai';
} | null> {
  if (!TOGETHER_API_KEY) {
    logger.warn('[together-ai] TOGETHER_API_KEY not configured - skipping Layer 3A');
    return null;
  }

  const model = options.model || 'black-forest-labs/flux-schnell'; // Faster but slightly lower quality
  // Alternative: 'black-forest-labs/flux-dev' (slower but better quality)
  
  const startTime = Date.now();
  let attemptCount = 0;
  
  while (attemptCount < 3) {
    try {
      logger.info('[together-ai] submitting generation request', {
        model,
        prompt: options.prompt.slice(0, 100) + '...',
        attempt: attemptCount + 1,
      });

      const response = await fetch(TOGETHER_GENERATIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOGETHER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          ...(options.negative_prompt && { negative: options.negative_prompt }),
          ...(options.width && options.height && { width: options.width, height: options.height }),
          steps: options.steps || 20,
          sampler_name: 'euler',
          seed: Math.floor(Math.random() * 2 ** 31),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Check for quota exceeded
        if (response.status === 429) {
          logger.error('[together-ai] quota exceeded - proceeding to next Layer 3 provider');
          throw new Error('QUOTA_EXCEEDED');
        }
        
        throw new Error(`Together AI HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      logger.info('[together-ai] ✅ successful generation', {
        duration_ms: Date.now() - startTime,
        images_count: result.data?.length || 0,
        model,
      });

      // Extract image URLs or base64 data
      const images = result.data?.map((item: { url?: string; b64_data?: string }) => item.url || item.b64_data).filter(Boolean) || [];
      
      if (images.length > 0) {
        return {
          images,
          job_id: `together_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          provider: 'together-ai',
        };
      } else {
        logger.error('[together-ai] empty output from API');
        throw new Error('Empty generation output');
      }
      
    } catch (error) {
      attemptCount++;
      const err = error as Error;
      
      if (err.message === 'QUOTA_EXCEEDED') {
        // Don't retry quota errors - immediately go to next provider
        break;
      }
      
      if (attemptCount >= 3) {
        logger.error('[together-ai] ❌ all retries failed', { error: err.message });
        throw error;
      }
      
      logger.warn(`[together-ai] attempt ${attemptCount} failed, retrying...`, { error: err.message });
      
      // Exponential backoff
      await new Promise(r => setTimeout(r, 1000 * attemptCount));
    }
  }

  return null;
}

/**
 * Validate Together AI connectivity and quota
 */
export async function checkTogetherAIHealth(): Promise<{
  ok: boolean;
  message?: string;
  model?: string;
}> {
  if (!TOGETHER_API_KEY) {
    return { ok: false, message: 'TOGETHER_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.together.xyz/models', {
      headers: { Authorization: `Bearer ${TOGETHER_API_KEY}` },
    });

    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}` };
    }

    const models = await response.json();
    const fluxModel = models.find((m: { id?: string }) => m.id?.includes('flux'));
    
    return {
      ok: true,
      model: fluxModel?.id,
      message: `${models.filter((m: { id?: string }) => m.id?.includes('flux')).length} FLUX models available`,
    };
    
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}
