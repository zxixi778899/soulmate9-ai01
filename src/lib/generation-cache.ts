/**
 * GPU  -60%
 *
 * 
 * 1.  RunPod  `prompt_hash + params_hash`
 * 2.  `generation_cache`    OSS key
 * 3.    RunPod   OSS    
 *
 * TTL
 * -  24h prompt 
 * -  7d
 *
 * 
 * -  ** API ** 
 * -  + 
 * - 
 */

import crypto from 'node:crypto';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export type CacheKind = 'image' | 'video';

export interface CacheLookupResult {
  hit: boolean;
  ossKey: string | null;
}

export interface CacheRecordParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  model: string;          // 'flux-dev' | 'cogvideox-5b' | ...
  kind: CacheKind;
}

const DEFAULT_TTL_HOURS: Record<CacheKind, number> = {
  image: 24,
  video: 24 * 7,
};

/**
 *  keySHA256 of canonical params
 */
export function computeCacheKey(params: CacheRecordParams): string {
  const canonical = JSON.stringify({
    p: params.prompt.trim().toLowerCase(),
    np: (params.negativePrompt || '').trim().toLowerCase(),
    w: params.width ?? null,
    h: params.height ?? null,
    s: params.steps ?? null,
    g: params.guidance ?? null,
    m: params.model,
    k: params.kind,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 *  oss_key null
 */
export async function lookupCache(key: string, kind: CacheKind): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('generation_cache')
      .select('oss_key, expires_at')
      .eq('cache_key', key)
      .eq('kind', kind)
      .single();

    if (error || !data) return null;
    if (new Date(data.expires_at) < new Date()) return null;

    //  hit_count
    void incrementHit(key);

    return data.oss_key;
  } catch (e) {
    logger.warn('[generation-cache] lookup failed, falling back to fresh gen', { err: e });
    return null;
  }
}

/**
 * 
 */
export async function writeCache(
  key: string,
  kind: CacheKind,
  ossKey: string,
): Promise<void> {
  const ttlHours = DEFAULT_TTL_HOURS[kind];
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  try {
    await getSupabaseClient().from('generation_cache').upsert(
      {
        cache_key: key,
        kind,
        oss_key: ossKey,
        hit_count: 0,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key,kind' },
    );
  } catch (e) {
    logger.warn('[generation-cache] write failed (non-fatal)', { err: e });
  }
}

async function incrementHit(key: string): Promise<void> {
  try {
    await getSupabaseClient().rpc('increment_cache_hit', { p_key: key });
  } catch {
    // RPC 
  }
}

/**
 * cron 
 */
export async function pruneExpiredCache(): Promise<number> {
  try {
    const { count } = await getSupabaseClient()
      .from('generation_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());
    return count ?? 0;
  } catch (e) {
    logger.error('[generation-cache] prune failed', { err: e });
    return 0;
  }
}