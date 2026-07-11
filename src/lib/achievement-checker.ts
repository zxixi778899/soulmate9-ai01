/**
 * Achievement Checker — triggered after key user actions
 *
 * Called from:
 *   - chat/stream/route.ts (after each message)
 *   - shop purchase routes (after buying gifts/outfits)
 *   - any place that increments user stats
 *
 * How it works:
 *   1. Fetch the user's current stats (message count, image count, intimacy level...)
 *   2. Compare against all achievement conditions
 *   3. Unlock + reward any newly completed achievements
 */

import { logger } from '@/lib/logger';

interface UserStats {
  messageCount: number;
  imageCount: number;
  giftPurchaseCount: number;
  outfitCount: number;
  maxIntimacyLevel: number;
  nsfwMessageCount: number;
}

/**
 * Check and unlock achievements for a user.
 * Returns list of newly unlocked achievement codes (so the frontend can show a toast).
 */
export async function checkAchievements(
  supabase: any,
  userId: string,
): Promise<string[]> {
  try {
    // 1. Gather user stats
    const [msgResult, intResult, achievementResult] = await Promise.all([
      supabase.from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('role', 'user'),
      supabase.from('intimacy_scores')
        .select('level')
        .eq('user_id', userId)
        .order('level', { ascending: false })
        .limit(1),
      supabase.from('achievements')
        .select('*')
        .order('sort_order', { ascending: true }),
    ]);

    const stats: UserStats = {
      messageCount: msgResult.count || 0,
      imageCount: 0, // TODO: count from image_gen_logs
      giftPurchaseCount: 0, // TODO: count from purchase_history
      outfitCount: 0, // TODO: count from wardrobe
      maxIntimacyLevel: intResult.data?.[0]?.level || 1,
      nsfwMessageCount: 0,
    };

    const allAchievements = achievementResult.data || [];
    const newlyUnlocked: string[] = [];

    // 2. Check each achievement
    for (const ach of allAchievements) {
      // Skip already unlocked
      const { data: existing } = await supabase
        .from('user_achievements')
        .select('unlocked')
        .eq('user_id', userId)
        .eq('achievement_id', ach.id)
        .single();

      if (existing?.unlocked) continue;

      let currentProgress = 0;
      switch (ach.condition_type) {
        case 'message_count': currentProgress = stats.messageCount; break;
        case 'image_count': currentProgress = stats.imageCount; break;
        case 'gift_purchases': currentProgress = stats.giftPurchaseCount; break;
        case 'outfit_count': currentProgress = stats.outfitCount; break;
        case 'intimacy_level': currentProgress = stats.maxIntimacyLevel; break;
        case 'nsfw_message_count': currentProgress = stats.nsfwMessageCount; break;
      }

      // Upsert user achievement progress
      await supabase.from('user_achievements').upsert({
        user_id: userId,
        achievement_id: ach.id,
        progress_value: currentProgress,
        unlocked: currentProgress >= ach.condition_value,
        unlocked_at: currentProgress >= ach.condition_value ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,achievement_id' });

      // If just unlocked, grant reward
      if (currentProgress >= ach.condition_value && !existing) {
        newlyUnlocked.push(ach.code);

        // Grant token reward (fire and forget)
        if (ach.reward_tokens > 0) {
          supabase.from('token_transactions').insert({
            user_id: userId,
            transaction_type: 'earn',
            amount_tokens: ach.reward_tokens,
            reason: `Achievement: ${ach.name}`,
            related_entity_type: 'achievement',
            related_entity_id: ach.id,
            balance_after: 0, // Will be updated by token service
            metadata: { achievement_code: ach.code },
          }).catch(() => {});

          // Update user tokens balance
          supabase.rpc('add_user_tokens', {
            p_user_id: userId,
            p_amount: ach.reward_tokens,
          }).catch(() => {});
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