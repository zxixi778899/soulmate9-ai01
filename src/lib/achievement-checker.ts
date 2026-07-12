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

interface UserStats {
  messageCount: number;
  imageCount: number;
  giftPurchaseCount: number;
  outfitCount: number;
  maxIntimacyLevel: number;
  nsfwMessageCount: number;
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

    const imageCountPromise = safeCount(supabase, 'generation_tasks', (q) =>
      q.eq('user_id', userId).eq('task_type', 'image_generation'),
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
      achievementResult,
    ] = await Promise.all([
      msgCountPromise,
      maxIntPromise,
      imageCountPromise,
      giftCountPromise,
      outfitCountPromise,
      heatMsgPromise,
      achievementsPromise,
    ]);

    const stats: UserStats = {
      messageCount,
      imageCount,
      giftPurchaseCount,
      outfitCount,
      maxIntimacyLevel,
      nsfwMessageCount,
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
        default:
          currentProgress = 0;
      }

      const unlocked = currentProgress >= ach.condition_value;

      if (!isSynthetic) {
        await supabase.from('user_achievements').upsert(
          {
            user_id: userId,
            achievement_id: ach.id,
            progress_value: currentProgress,
            unlocked,
            unlocked_at: unlocked ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
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
            await supabase.rpc('add_user_tokens', {
              p_user_id: userId,
              p_amount: ach.reward_tokens,
            });
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
