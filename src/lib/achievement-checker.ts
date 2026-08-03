/**
 * Achievement Checker — triggered after key user actions
 *
 * Called from:
 *   - chat/stream/route.ts (after each message)
 *   - shop purchase routes (after buying gifts/outfits)
 *   - any place that increments user stats
 */

import { logger } from '@/lib/logger';
import { HEAT_ACHIEVEMENT_DEFS } from '@/lib/heat-achievements';
import { grantCredits } from '@/lib/credit-system';
import type { SupabaseClient } from '@supabase/supabase-js';

interface UserStats {
  messageCount: number;
  imageCount: number;
  giftPurchaseCount: number;
  outfitCount: number;
  maxIntimacyLevel: number;
  nsfwMessageCount: number;
  creditsPurchased: number;
  subscriptionTier: number;
  companionCount: number;
  createdCompanions: number;
  checkinStreak: number;
}

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => any;
};

async function safeCount(
  supabase: SupabaseLike,
  table: string,
  apply: (q: any) => any,
): Promise<number> {
  try {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    q = apply(q);
    const { count, error } = await q;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Check and unlock achievements for a user.
 * Returns list of newly unlocked achievement codes (so the frontend can show a toast).
 */
export async function checkAchievements(
  supabase: SupabaseLike,
  userId: string,
): Promise<string[]> {
  try {
    const msgCountPromise = safeCount(supabase, 'chat_messages', (q) =>
      q.eq('user_id', userId).eq('role', 'user'),
    );

    const maxIntPromise = (async (): Promise<number> => {
      try {
        const { data } = await supabase
          .from('intimacy_scores')
          .select('level')
          .eq('user_id', userId)
          .order('level', { ascending: false })
          .limit(1);
        return data?.[0]?.level || 1;
      } catch {
        return 1;
      }
    })();

    const imageCountPromise = safeCount(supabase, 'chat_media', (q) =>
      q.eq('user_id', userId).eq('media_type', 'image'),
    );

    const creditsPurchasedPromise = (async (): Promise<number> => {
      try {
        const { data } = await supabase
          .from('user_credits_ledger')
          .select('delta')
          .eq('user_id', userId)
          .eq('reason', 'token_purchase')
          .gt('delta', 0)
          .limit(1000);
        return ((data || []) as Array<{ delta: number }>).reduce(
          (sum, r) => sum + Number(r.delta || 0),
          0,
        );
      } catch {
        return 0;
      }
    })();

    const profilePromise = (async (): Promise<{ membership_tier?: string; checkin_streak?: number } | null> => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('membership_tier, checkin_streak')
          .eq('user_id', userId)
          .maybeSingle();
        return data || null;
      } catch {
        return null;
      }
    })();

    const companionCountPromise = safeCount(supabase, 'user_friends', (q) =>
      q.eq('user_id', userId),
    );

    const createdCompanionsPromise = safeCount(supabase, 'user_friends', (q) =>
      q.eq('user_id', userId).eq('source', 'created'),
    );

    const giftCountPromise = safeCount(supabase, 'purchase_history', (q) =>
      q.eq('user_id', userId),
    );

    const outfitCountPromise = safeCount(supabase, 'wardrobe', (q) =>
      q.eq('user_id', userId),
    );

    const heatMsgPromise = (async (): Promise<number> => {
      try {
        const { data: bonds } = await supabase
          .from('intimacy_scores')
          .select('girlfriend_id, level')
          .eq('user_id', userId)
          .gte('level', 3);
        const ids = (bonds || [])
          .map((b: { girlfriend_id?: string }) => b.girlfriend_id)
          .filter(Boolean) as string[];
        if (ids.length === 0) return 0;
        return safeCount(supabase, 'chat_messages', (q) =>
          q.eq('user_id', userId).eq('role', 'user').in('girlfriend_id', ids),
        );
      } catch {
        return 0;
      }
    })();

    const achievementsPromise = supabase
      .from('achievements')
      .select('*')
      .order('sort_order', { ascending: true });

    const [
      messageCount,
      maxIntimacyLevel,
      imageCount,
      giftPurchaseCount,
      outfitCount,
      nsfwMessageCount,
      creditsPurchased,
      profileRow,
      companionCount,
      createdCompanions,
      achievementResult,
    ] = await Promise.all([
      msgCountPromise,
      maxIntPromise,
      imageCountPromise,
      giftCountPromise,
      outfitCountPromise,
      heatMsgPromise,
      creditsPurchasedPromise,
      profilePromise,
      companionCountPromise,
      createdCompanionsPromise,
      achievementsPromise,
    ]);

    const rawTier = String(profileRow?.membership_tier || 'free').toLowerCase();
    const subscriptionTier = rawTier === 'unlimited' ? 2 : rawTier === 'free' ? 0 : 1;

    const stats: UserStats = {
      messageCount,
      imageCount,
      giftPurchaseCount,
      outfitCount,
      maxIntimacyLevel,
      nsfwMessageCount,
      creditsPurchased,
      subscriptionTier,
      companionCount,
      createdCompanions,
      checkinStreak: Number(profileRow?.checkin_streak || 0),
    };

    let allAchievements = achievementResult?.data || [];
    if (!allAchievements.length) {
      allAchievements = HEAT_ACHIEVEMENT_DEFS.map((d) => ({
        id: `seed-${d.code}`,
        code: d.code,
        name: d.name,
        condition_type: d.condition_type,
        condition_value: d.condition_value,
        reward_tokens: d.reward_tokens,
      }));
    }

    const newlyUnlocked: string[] = [];

    for (const ach of allAchievements) {
      const isSynthetic = String(ach.id).startsWith('seed-');

      let existing: { unlocked?: boolean } | null = null;
      if (!isSynthetic) {
        const { data } = await supabase
          .from('user_achievements')
          .select('unlocked')
          .eq('user_id', userId)
          .eq('achievement_id', ach.id)
          .maybeSingle();
        existing = data;
      }

      if (existing?.unlocked) continue;

      let currentProgress = 0;
      switch (ach.condition_type) {
        case 'message_count':
          currentProgress = stats.messageCount;
          break;
        case 'image_count':
          currentProgress = stats.imageCount;
          break;
        case 'gift_purchases':
          currentProgress = stats.giftPurchaseCount;
          break;
        case 'outfit_count':
          currentProgress = stats.outfitCount;
          break;
        case 'intimacy_level':
          currentProgress = stats.maxIntimacyLevel;
          break;
        case 'nsfw_message_count':
          currentProgress = stats.nsfwMessageCount;
          break;
        case 'credits_purchased':
          currentProgress = stats.creditsPurchased;
          break;
        case 'subscription_tier':
          currentProgress = stats.subscriptionTier;
          break;
        case 'companion_count':
          currentProgress = stats.companionCount;
          break;
        case 'created_companions':
          currentProgress = stats.createdCompanions;
          break;
        case 'checkin_streak':
          currentProgress = stats.checkinStreak;
          break;
        default:
          currentProgress = 0;
      }

      const unlocked = currentProgress >= ach.condition_value;

      if (!isSynthetic) {
        const isNewUnlock = unlocked && !existing?.unlocked;
        const payload: Record<string, unknown> = {
          user_id: userId,
          achievement_id: ach.id,
          progress_value: currentProgress,
          unlocked,
          updated_at: new Date().toISOString(),
        };
        if (unlocked) payload.unlocked_at = new Date().toISOString();
        if (isNewUnlock) payload.notified = false;
        await supabase.from('user_achievements').upsert(
          payload,
          { onConflict: 'user_id,achievement_id' },
        );
      }

      if (unlocked && !existing?.unlocked) {
        newlyUnlocked.push(ach.code);

        if (!isSynthetic && ach.reward_tokens > 0) {
          try {
            await supabase.from('token_transactions').insert({
              user_id: userId,
              transaction_type: 'earn',
              amount_tokens: ach.reward_tokens,
              reason: `Achievement: ${ach.name}`,
              related_entity_type: 'achievement',
              related_entity_id: ach.id,
              balance_after: 0,
              metadata: { achievement_code: ach.code },
            });
          } catch {
            /* ignore */
          }

          try {
            await grantCredits(supabase as unknown as SupabaseClient, userId, ach.reward_tokens, 'achievement', ach.id);
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (newlyUnlocked.length > 0) {
      logger.info('[achievements] unlocked', {
        data: { userId, count: newlyUnlocked.length, codes: newlyUnlocked },
      });
    }

    return newlyUnlocked;
  } catch (err) {
    logger.error('[achievements] check failed', { err: String(err).slice(0, 200) });
    return [];
  }
}
