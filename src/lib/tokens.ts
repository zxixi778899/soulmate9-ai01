/**
 * Token System Management
 * 
 * Handles token consumption for image/video generation,
 * provides real-time balance tracking and audit logging.
 * 
 * @priority P0
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export const GENERATION_COSTS = {
  portrait: 100,          // 头像生成
  selfie: 50,             // 自拍/生活照
  outfit_change: 75,      // 换装
  video_5s: 200,          // 5 秒视频
  video_10s: 350,         // 10 秒视频
  nsfw_adult: 150,        // NSFW (Level 4-5)
  ip_adapter: 25,         // IP-Adapter face lock premium
  high_quality: 50,       // Steps > 30
  low_denoise: 30,        // img2img with denoise < 0.4
};

export type GenerationAction = keyof typeof GENERATION_COSTS;

export interface TokenConsumeResult {
  allowed: boolean;
  newBalance: number;
  error?: string;
}

export interface TokenBalance {
  remaining: number;
  purchased: number;
  consumed: number;
  tier: string;
}

/**
 * Consume tokens atomically for generation action
 * Returns new balance on success, throws on failure
 */
export async function consumeTokens(
  userId: string,
  action: GenerationAction,
  girlfriendId?: string,
  jobId?: string,
  provider?: string,
  imageUrl?: string,
  prompt?: string,
): Promise<TokenConsumeResult> {
  const tokens = GENERATION_COSTS[action];
  if (!tokens) {
    throw new Error(`Unknown action: ${action}`);
  }

  const sb = getSupabaseClient();

  try {
    // Use database function for atomic check + consume
    const { data, error } = await sb.rpc('consume_tokens', {
      p_user_id: userId,
      p_tokens: tokens,
      p_action: action,
      p_girlfriend_id: girlfriendId || null,
      p_provider: provider || 'runpod',
      p_job_id: jobId || null,
    });

    if (error) throw error;

    const result = data as Array<{ allowed: boolean; new_balance: number; error?: string }>;
    if (!result?.length) {
      throw new Error('No result from consume_tokens RPC');
    }

    const [response] = result;
    if (!response.allowed) {
      logger.warn('[tokens] Insufficient balance', {
        userId,
        action,
        requested: tokens,
        balance: response.new_balance,
      });
      return {
        allowed: false,
        newBalance: response.new_balance,
        error: response.error || 'Insufficient tokens',
      };
    }

    // Log image_url and prompt if provided (separate update)
    if (imageUrl || prompt) {
      await sb
        .from('generation_ledger')
        .update({ 
          image_url: imageUrl || undefined,
          prompt: prompt?.slice(0, 500) || undefined
        })
        .eq('user_id', userId)
        .eq('action', action)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    logger.info('[tokens] Consumed', {
      userId,
      action,
      tokens,
      newBalance: response.new_balance,
      provider,
    });

    return {
      allowed: true,
      newBalance: response.new_balance,
    };
  } catch (err) {
    logger.error('[tokens] consumeTokens failed', {
      userId,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Check token balance before showing UI confirmation
 */
export async function getTokenBalance(userId: string): Promise<TokenBalance> {
  const sb = getSupabaseClient();

  const { data: profile, error } = await sb
    .from('profiles')
    .select('tokens_remaining, tokens_purchased, tokens_consumed, tier')
    .eq('user_id', userId)
    .single();

  if (error) {
    logger.error('[tokens] getTokenBalance failed', {
      userId,
      error: error.message,
    });
    throw new Error('Failed to load token balance');
  }

  return {
    remaining: profile.tokens_remaining || 0,
    purchased: profile.tokens_purchased || 0,
    consumed: profile.tokens_consumed || 0,
    tier: profile.tier || 'free',
  };
}

/**
 * Grant tokens (for subscription rewards, promotions, admin adjustment)
 */
export async function grantTokens(
  userId: string,
  amount: number,
  reason: string = 'promotion',
): Promise<boolean> {
  const sb = getSupabaseClient();

  const { error } = await sb.rpc('grant_tokens', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    logger.error('[tokens] grantTokens failed', {
      userId,
      amount,
      reason,
      error: error.message,
    });
    return false;
  }

  logger.info('[tokens] Granted', { userId, amount, reason });
  return true;
}

/**
 * Get recent generation history for audit trail
 */
export async function getGenerationHistory(
  userId: string,
  limit: number = 20,
): Promise<Array<{
  action: string;
  tokens_consumed: number;
  created_at: string;
  image_url?: string;
  girlfriend_id?: string;
}>> {
  const sb = getSupabaseClient();

  const { data, error } = await sb
    .from('generation_ledger')
    .select('action, tokens_consumed, created_at, image_url, girlfriend_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[tokens] getGenerationHistory failed', {
      userId,
      error: error.message,
    });
    return [];
  }

  return data || [];
}

/**
 * Calculate total cost for batch generation
 */
export function calculateBatchCost(
  actions: GenerationAction[],
): number {
  return actions.reduce((sum, action) => sum + (GENERATION_COSTS[action] || 0), 0);
}

/**
 * Check if user can afford an action without consuming
 */
export async function canAffordAction(
  userId: string,
  action: GenerationAction,
): Promise<{ affordable: boolean; balance: number; cost: number }> {
  const balance = await getTokenBalance(userId);
  const cost = GENERATION_COSTS[action] || 0;
  
  return {
    affordable: balance.remaining >= cost,
    balance: balance.remaining,
    cost,
  };
}

/**
 * Monthly reset scheduler (call from cron job)
 */
export async function resetMonthlyTokens(): Promise<number> {
  const sb = getSupabaseClient();

  const { data, error } = await sb.rpc('reset_monthly_tokens');

  if (error) {
    logger.error('[tokens] resetMonthlyTokens failed', {
      error: error.message,
    });
    throw error;
  }

  const count = data as number;
  logger.info('[tokens] Monthly reset complete', { updatedUsers: count });
  return count;
}
