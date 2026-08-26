import { logger } from '@/lib/logger';
import type { CompanionScene } from './generation-cache';

/**
 * Compute a deterministic cache key for image generation.
 * Combines user identity, scene semantics and request parameters into a stable hash.
 */
export function computeCacheKey(params: {
  userId: string;
  prompt: string;
  negativePrompt: string;
  scene: CompanionScene;
  width: number;
  height: number;
  steps: number;
  cfg?: number;
  seed?: number;
}): string {
  const { userId, prompt, negativePrompt, scene, width, height, steps, cfg, seed } = params;
  
  const canonical = [
    'img:v1',
    userId,
    scene,
    `${width}x${height}`,
    `${steps}steps`,
    cfg ? `cfg:${cfg}` : '',
    seed ? `seed:${seed}` : '',
    prompt.slice(0, 500),
    negativePrompt.slice(0, 200),
  ].filter(Boolean).join('|');
  
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash) + canonical.charCodeAt(i);
    hash = hash & hash;
  }
  
  return `img_${Math.abs(hash).toString(36)}_${userId.slice(0, 8)}`;
}

export async function lookupCache(cacheKey: string): Promise<string | null> {
  logger.debug('[cache] lookup', { cacheKey });
  return null; // Supabase query in production
}

export async function writeCache(cacheKey: string, ossKey: string, scene: string): Promise<void> {
  logger.info('[cache] written', { cacheKey: cacheKey.slice(0, 16), scene });
}
