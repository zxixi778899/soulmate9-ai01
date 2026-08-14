/**
 * Visual Memory Recall System
 * 
 * Enables "generate another like yesterday's" functionality via
 * CLIP embeddings stored in pgvector. Supports semantic similarity
 * search and recency-based recall.
 * 
 * @priority P1
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export interface VisualMemory {
  id: string;
  image_url: string;
  prompt: string;
  similarity?: number;
  created_at: string;
  rating?: number;
}

export interface SaveMemoryParams {
  userId: string;
  girlfriendId?: string;
  prompt: string;
  negativePrompt?: string;
  imageUrl: string;
  embedding: number[]; // 768-dim CLIP embedding
  checkpoint?: string;
  loras?: Record<string, unknown>;
  denoise?: number;
  ipAdapterUsed?: boolean;
  seed?: number;
}

/**
 * Save a generation to visual memory database
 */
export async function saveVisualMemory(params: SaveMemoryParams): Promise<string | null> {
  const sb = getSupabaseClient();

  try {
    const { data, error } = await sb.rpc('save_to_generation_memory', {
      p_user_id: params.userId,
      p_girlfriend_id: params.girlfriendId || null,
      p_prompt: params.prompt.slice(0, 1000),
      p_negative_prompt: params.negativePrompt?.slice(0, 500) || null,
      p_image_url: params.imageUrl,
      p_embedding: params.embedding,
      p_checkpoint: params.checkpoint || null,
      p_loras: params.loras ? JSON.stringify(params.loras) : null,
      p_denoise: params.denoise || null,
      p_ip_adapter_used: params.ipAdapterUsed || false,
      p_seed: params.seed || null,
    });

    if (error) {
      logger.error('[VisualMemory] save failed', {
        userId: params.userId,
        error: error.message,
      });
      return null;
    }

    const memoryId = data as string;
    logger.info('[VisualMemory] Saved', {
      memoryId,
      userId: params.userId,
      girlfriendId: params.girlfriendId,
    });

    return memoryId;
  } catch (err) {
    logger.error('[VisualMemory] saveVisualMemory exception', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Search for similar images by text prompt (converted to CLIP embedding)
 * 
 * Workflow:
 * 1. Convert user prompt to CLIP embedding via external API
 * 2. Query pgvector for similar memories
 * 3. Return top-K matches
 */
export async function searchSimilarMemories(
  userId: string,
  queryEmbedding: number[],
  girlfriendId?: string,
  limit: number = 5,
  threshold: number = 0.75
): Promise<VisualMemory[]> {
  const sb = getSupabaseClient();

  try {
    const { data, error } = await sb.rpc('search_similar_memories', {
      p_user_id: userId,
      p_query_embedding: queryEmbedding,
      p_girlfriend_id: girlfriendId || null,
      p_limit: limit,
      p_threshold: threshold,
    });

    if (error) {
      logger.error('[VisualMemory] search failed', {
        userId,
        error: error.message,
      });
      return [];
    }

    const memories = (data || []) as Array<{
      id: string;
      image_url: string;
      prompt: string;
      similarity: number;
      created_at: string;
      rating: number | null;
    }>;

    logger.info('[VisualMemory] Found matches', {
      userId,
      count: memories.length,
      girlfriendId,
    });

    return memories.map((m) => ({
      id: m.id,
      image_url: m.image_url,
      prompt: m.prompt,
      similarity: m.similarity,
      created_at: m.created_at,
      rating: m.rating || undefined,
    }));
  } catch (err) {
    logger.error('[VisualMemory] searchSimilarMemories exception', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Mark a memory as recently accessed (for LRU-based cleanup)
 */
export async function markMemoryAccessed(memoryId: string): Promise<void> {
  const sb = getSupabaseClient();

  try {
    await sb.rpc('mark_memory_accessed', {
      p_memory_id: memoryId,
    });
  } catch (err) {
    logger.warn('[VisualMemory] markMemoryAccessed failed', {
      memoryId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get recent memories (without semantic search)
 */
export async function getRecentMemories(
  userId: string,
  girlfriendId?: string,
  limit: number = 10
): Promise<VisualMemory[]> {
  const sb = getSupabaseClient();

  let query = sb
    .from('generation_memory')
    .select('id, image_url, prompt, created_at, rating')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (girlfriendId) {
    query = query.eq('girlfriend_id', girlfriendId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('[VisualMemory] getRecentMemories failed', {
      userId,
      error: error.message,
    });
    return [];
  }

  return (data || []).map((m) => ({
    id: m.id,
    image_url: m.image_url,
    prompt: m.prompt,
    created_at: m.created_at,
    rating: m.rating || undefined,
  }));
}

/**
 * Update user feedback on a memory (rating/like)
 */
export async function updateMemoryFeedback(
  memoryId: string,
  userId: string,
  updates: {
    rating?: number;
    user_liked?: boolean;
    tags?: string[];
  }
): Promise<boolean> {
  const sb = getSupabaseClient();

  const { error } = await sb
    .from('generation_memory')
    .update({
      rating: updates.rating,
      user_liked: updates.user_liked,
      tags: updates.tags,
    })
    .eq('id', memoryId)
    .eq('user_id', userId);

  if (error) {
    logger.error('[VisualMemory] updateMemoryFeedback failed', {
      memoryId,
      error: error.message,
    });
    return false;
  }

  logger.info('[VisualMemory] Feedback updated', {
    memoryId,
    rating: updates.rating,
    liked: updates.user_liked,
  });

  return true;
}

/**
 * Cleanup old memories (keep last N per girlfriend)
 * Call from monthly cron job
 */
export async function cleanupOldMemories(
  userId: string,
  keepPerGirlfriend: number = 50
): Promise<number> {
  const sb = getSupabaseClient();

  // Get all girlfriends with memories
  const { data: gfStats } = await sb
    .from('generation_memory')
    .select('girlfriend_id')
    .eq('user_id', userId)
    .not('girlfriend_id', 'is', null);

  const girlfriendIds = new Set(gfStats?.map((g) => g.girlfriend_id) || []);

  let deletedCount = 0;

  for (const gfId of girlfriendIds) {
    // Get memories older than keepPerGirlfriend-th most recent
    const { data: oldMemories } = await sb
      .from('generation_memory')
      .select('id')
      .eq('user_id', userId)
      .eq('girlfriend_id', gfId)
      .order('created_at', { ascending: false })
      .range(keepPerGirlfriend, keepPerGirlfriend + 100);

    if (oldMemories?.length) {
      const idsToDelete = oldMemories.map((m) => m.id);
      const { error } = await sb
        .from('generation_memory')
        .delete()
        .in('id', idsToDelete);

      if (!error) {
        deletedCount += idsToDelete.length;
      }
    }
  }

  logger.info('[VisualMemory] Cleanup complete', {
    userId,
    deletedCount,
  });

  return deletedCount;
}
