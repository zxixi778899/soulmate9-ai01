/**
 * 生成结果缓存层（GPU 成本 -60%）
 *
 * 工作原理：
 * 1. 调用 RunPod 之前算 `prompt_hash + params_hash`
 * 2. 查 `generation_cache` 表：命中 → 直接返回 OSS key
 * 3. 未命中 → 调 RunPod → 上传 OSS → 写缓存 → 返回
 *
 * TTL：
 * - 图片 24h（同一 prompt 复用常见）
 * - 视频 7d（生成成本高，缓存更久）
 *
 * 注意：
 * - 这是 **服务端 API 路由** 才用得到的层
 * - 调用方必须已认证 + 已限流
 * - 不暴露给客户端
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
 * 计算缓存 key（SHA256 of canonical params）
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
 * 查缓存（命中即返回 oss_key；否则返回 null）
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

    // 命中：异步更新 hit_count（不阻塞主流程）
    void incrementHit(key);

    return data.oss_key;
  } catch (e) {
    logger.warn('[generation-cache] lookup failed, falling back to fresh gen', { err: e });
    return null;
  }
}

/**
 * 写入缓存（生成成功后调用）
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
    // RPC 可能没建；忽略
  }
}

/**
 * 清理过期缓存（cron 调用，建议每天一次）
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