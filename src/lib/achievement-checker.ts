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
  videoCount: number;
  giftPurchaseCount: number;
  outfitCount: number;
  maxIntimacyLevel: number;
  nsfwMessageCount: number;
  creditsPurchased: number;
  creditsSpent: number;
  totalCheckins: number;
  distinctChatPartners: number;
  ssrCompanions: number;
  companionsIntimacy5: number;
  companionsIntimacy6: number;
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

    const videoCountPromise = safeCount(supabase, 'chat_media', (q) =>
      q.eq('user_id', userId).eq('media_type', 'video'),
    );

    const creditsSpentPromise = (async (): Promise<number> => {
      try {
        const { data } = await supabase
          .from('user_credits_ledger')
          .select('delta')
          .eq('user_id', userId)
          .lt('delta', 0)
          .limit(2000);
        return ((data || []) as Array<{ delta: number }>).reduce(
          (sum, r) => sum + Math.abs(Number(r.delta || 0)),
          0,
        );
      } catch {
        return 0;
      }
    })();

    const totalCheckinsPromise = safeCount(supabase, 'user_credits_ledger', (q) =>
      q.eq('user_id', userId).eq('reason', 'daily_checkin'),
    );

    const distinctChatPartnersPromise = (async (): Promise<number> => {
      try {
        const { data } = await supabase
          .from('chat_messages')
          .select('girlfriend_id')
          .eq('user_id', userId)
          .eq('role', 'user')
          .limit(3000);
        const ids = new Set(
          ((data || []) as Array<{ girlfriend_id?: string }>)
            .map((r) => r.girlfriend_id)
            .filter(Boolean),
        );
        return ids.size;
      } catch {
        return 0;
      }
    })();

    // SSR companions: owned companions whose (desire+development+kink)/3 ≥ 90,
    // mirroring src/lib/rarity.ts scoring.
    const ssrCompanionsPromise = (async (): Promise<number> => {
      try {
        const { data: friends } = await supabase
          .from('user_friends')
          .select('girlfriend_id')
          .eq('user_id', userId);
        const ids = ((friends || []) as Array<{ girlfriend_id?: string }>)
          .map((r) => r.girlfriend_id)
          .filter(Boolean) as string[];
        if (ids.length === 0) return 0;
        const { data: girls } = await supabase
          .from('girlfriends')
          .select('base_desire, base_development, base_kink')
          .in('id', ids);
        return ((girls || []) as Array<{ base_desire?: number; base_development?: number; base_kink?: number }>)
          .filter((g) => {
            const score = Math.round(
              (Number(g.base_desire || 0) + Number(g.base_development || 0) + Number(g.base_kink || 0)) / 3,
            );
            return score >= 90;
          }).length;
      } catch {
        return 0;
      }
    })();

    const companionsIntimacy5Promise = safeCount(supabase, 'intimacy_scores', (q) =>
      q.eq('user_id', userId).gte('level', 5),
    );

    const companionsIntimacy6Promise = safeCount(supabase, 'intimacy_scores', (q) =>
      q.eq('user_id', userId).gte('level', 6),
    );

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
      videoCount,
      creditsSpent,
      totalCheckins,
      distinctChatPartners,
      ssrCompanions,
      companionsIntimacy5,
      companionsIntimacy6,
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
      videoCountPromise,
      creditsSpentPromise,
      totalCheckinsPromise,
      distinctChatPartnersPromise,
      ssrCompanionsPromise,
      companionsIntimacy5Promise,
      companionsIntimacy6Promise,
      achievementsPromise,
    ]);

    const rawTier = String(profileRow?.membership_tier || 'free').toLowerCase();
    const subscriptionTier = rawTier === 'unlimited' ? 2 : rawTier === 'free' ? 0 : 1;

    const stats: UserStats = {
      messageCount,
      imageCount,
      videoCount,
      giftPurchaseCount,
      outfitCount,
      maxIntimacyLevel,
      nsfwMessageCount,
      creditsPurchased,
      creditsSpent,
      totalCheckins,
      distinctChatPartners,
      ssrCompanions,
      companionsIntimacy5,
      companionsIntimacy6,
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
      if (ach.is_hidden) continue;
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
        case 'video_count':
          currentProgress = stats.videoCount;
          break;
        case 'credits_spent':
          currentProgress = stats.creditsSpent;
          break;
        case 'total_checkins':
          currentProgress = stats.totalCheckins;
          break;
        case 'distinct_chat_partners':
          currentProgress = stats.distinctChatPartners;
          break;
        case 'ssr_companions':
          currentProgress = stats.ssrCompanions;
          break;
        case 'companions_intimacy_5':
          currentProgress = stats.companionsIntimacy5;
          break;
        case 'companions_intimacy_6':
          currentProgress = stats.companionsIntimacy6;
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
