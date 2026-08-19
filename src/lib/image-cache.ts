/**
 * Image Cache System - Layer 4 Graceful Degradation
 * 
 * When all cloud generation services fail, return cached images as fallback.
 * Ensures user experience continuity even when all APIs are down.
 */

import { logger } from './logger';
import { IMAGE_CACHE_MINUTES } from './constants';

interface CachedImageMetadata {
  id: string;
  prompt_hash: string;
  image_url: string;
  created_at: number;
  expires_at: number;
  width?: number;
  height?: number;
  provider?: string;
  tags?: string[];
}

/**
 * Store cached images in memory (temporary) + localStorage (persistent)
 * Production: Use Supabase storage for cross-session persistence
 */
class ImageCacheStore {
  private cacheKey = 'image_generation_cache_v1';
  private memoryCache: Map<string, CachedImageMetadata> = new Map();
  
  constructor() {
    this.loadFromStorage();
    
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /** Load cache from localStorage on init */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.cacheKey);
      if (stored) {
        const entries = JSON.parse(stored);
        Object.entries(entries).forEach(([id, entry]) => {
          if ((entry as CachedImageMetadata).expires_at > Date.now()) {
            this.memoryCache.set(id, entry as CachedImageMetadata);
          }
        });
        logger.info('[image-cache] loaded', { count: this.memoryCache.size });
      }
    } catch (error) {
      logger.warn('[image-cache] failed to load from localStorage', { error });
    }
  }

  /** Save cache to localStorage */
  private saveToStorage(): void {
    try {
      const entries: Record<string, CachedImageMetadata> = {};
      this.memoryCache.forEach((value, key) => {
        entries[key] = value;
      });
      localStorage.setItem(this.cacheKey, JSON.stringify(entries));
    } catch (error) {
      logger.warn('[image-cache] failed to save to localStorage', { error });
    }
  }

  /** Add or update cached image */
  add(imageUrl: string, metadata: Pick<CachedImageMetadata, 'prompt_hash' | 'provider' | 'tags'> & { ttl_minutes?: number }): CachedImageMetadata {
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const ttlMinutes = metadata.ttl_minutes || 10; // Default 10 min TTL
    const expiresAt = now + (ttlMinutes * 60 * 1000);
    
    const entry: CachedImageMetadata = {
      id,
      prompt_hash: metadata.prompt_hash,
      image_url: imageUrl,
      created_at: now,
      expires_at: expiresAt,
      provider: metadata.provider,
      tags: metadata.tags,
    };
    
    this.memoryCache.set(id, entry);
    this.saveToStorage();
    
    logger.debug('[image-cache] added', { id, duration_min: Math.round((expiresAt - now) / 60000) });
    return entry;
  }

  /** Retrieve image by prompt hash */
  getByPromptHash(promptHash: string, maxMinutesAgo?: number): CachedImageMetadata | null {
    const candidates = Array.from(this.memoryCache.values()).filter(entry => 
      entry.prompt_hash === promptHash && entry.expires_at > Date.now()
    );

    if (!candidates.length) return null;
    
    // Sort by creation time (most recent first)
    candidates.sort((a, b) => b.created_at - a.created_at);
    
    // Filter by age if specified
    const filtered = maxMinutesAgo
      ? candidates.filter(entry => entry.created_at > Date.now() - maxMinutesAgo * 60 * 1000)
      : [candidates[0]];
    
    return filtered[0] || null;
  }

  /** Find similar image (fuzzy match on first 50 chars of prompt) */
  findSimilar(originalPrompt: string): CachedImageMetadata | null {
    const partialHash = originalPrompt.slice(0, 50).toLowerCase().replace(/\s+/g, '');
    const candidates = Array.from(this.memoryCache.values()).filter(entry => 
      entry.prompt_hash.includes(partialHash.slice(-20)) && entry.expires_at > Date.now()
    );
    
    return candidates.length > 0 ? candidates[0] : null;
  }

  /** Remove expired entries */
  cleanup(): void {
    let removed = 0;
    const now = Date.now();
    
    for (const [id, entry] of this.memoryCache) {
      if (entry.expires_at <= now) {
        this.memoryCache.delete(id);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.saveToStorage();
      logger.info('[image-cache] cleaned up', { removed, remaining: this.memoryCache.size });
    }
  }

  /** Get cache statistics */
  getStats() {
    const now = Date.now();
    const validSize = Array.from(this.memoryCache.values()).filter(e => e.expires_at > now).length;
    
    return {
      total: this.memoryCache.size,
      valid: validSize,
      expired: this.memoryCache.size - validSize,
    };
  }
}

// Singleton instance
export const imageCacheStore = new ImageCacheStore();

/**
 * Hash prompt string for lookup
 */
export function hashPrompt(prompt: string): string {
  const normalized = prompt.toLowerCase().trim().replace(/\s+/g, '');
  // Create simple hash (first 32 chars)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36) + '_' + normalized.slice(0, 32);
}

/**
 * Cache successful generation result
 */
export async function cacheGenerationResult(result: {
  images: string[];
  job_id: string;
  provider: string;
  prompt: string;
}): Promise<void> {
  for (const imageUrl of result.images) {
    imageCacheStore.add(imageUrl, {
      prompt_hash: hashPrompt(result.prompt),
      provider: result.provider,
      ttl_minutes: IMAGE_CACHE_MINUTES,
    });
  }
  
  logger.info('[image-cache] cached generation result', {
    images_count: result.images.length,
    provider: result.provider,
  });
}

/**
 * Retrieve cached image for graceful degradation
 */
export async function getCachedImage({
  matchingPromptHash,
  maxMinutesAgo = IMAGE_CACHE_MINUTES,
}: {
  matchingPromptHash?: string;
  maxMinutesAgo?: number;
}): Promise<string | null> {
  let entry: CachedImageMetadata | null = null;
  
  if (matchingPromptHash) {
    entry = imageCacheStore.getByPromptHash(matchingPromptHash, maxMinutesAgo);
  } else {
    // Fall back to any recent cache
    const now = Date.now();
    const validEntries = Array.from(imageCacheStore['memoryCache'].values()).filter(
      e => e.expires_at > now
    );
    
    if (validEntries.length > 0) {
      entry = validEntries.reduce((latest, current) => 
        current.created_at > latest.created_at ? current : latest
      );
    }
  }
  
  if (entry) {
    const now = Date.now();
    logger.info('[image-cache] found suitable cached image', {
      duration_minutes: Math.round((now - entry.created_at) / 60000),
    });
    return entry.image_url;
  }
  
  logger.debug('[image-cache] no suitable cached image found');
  return null;
}

/**
 * Check cache health and available fallback images
 */
export function getCacheHealth() {
  const stats = imageCacheStore.getStats();
  
  return {
    healthy: stats.valid > 0,
    available_count: stats.valid,
    last_entry_age_ms: stats.valid > 0 
      ? Math.min(...Array.from(imageCacheStore['memoryCache'].values()).map(e => e.expires_at - Date.now()))
      : 0,
    statistics: stats,
  };
}
