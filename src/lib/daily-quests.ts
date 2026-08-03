/**
 * Daily Quests — five daily tasks with progress derived from REAL activity.
 *
 *   1. checkin          每日签到        — claim the daily check-in
 *   2. first_message    调戏一下伴侣     — send your first message of the day
 *   3. first_photo      美美的照片       — receive your first AI photo of the day
 *   4. three_companions 海王日常        — chat with 3 different companions in one day
 *   5. three_photos     老司机          — collect 3 AI photos in one day
 *
 * Rewards auto-grant the first time a quest completes on a given UTC day.
 * Idempotency comes from the daily_quest_claims primary key
 * (user_id, quest_code, quest_date): a racing request's INSERT fails and
 * its grant is skipped.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { grantCredits } from '@/lib/credit-system';
import { logger } from '@/lib/logger';

export interface DailyQuestDef {
  code: string;
  goal: number;
  /** Credits granted on completion. 0 → reward handled by the feature itself (check-in). */
  reward: number;
}

export const DAILY_QUESTS: DailyQuestDef[] = [
  { code: 'checkin', goal: 1, reward: 0 },
  { code: 'first_message', goal: 1, reward: 5 },
  { code: 'first_photo', goal: 1, reward: 5 },
  { code: 'three_companions', goal: 3, reward: 15 },
  { code: 'three_photos', goal: 3, reward: 15 },
];

export const ALL_BONUS_CODE = 'all_bonus';
export const DAILY_QUEST_ALL_BONUS = 20;

export interface DailyQuestState {
  code: string;
  progress: number;
  goal: number;
  reward: number;
  done: boolean;
  claimed: boolean;
}

export interface DailyQuestSyncResult {
  date: string;
  quests: DailyQuestState[];
  newly_claimed: Array<{ code: string; reward: number }>;
  all_complete: boolean;
  bonus_claimed: boolean;
}

/** Start of the current UTC day (matches check-in / membership accounting). */
function utcDayStartISO(): string {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return new Date(dayIndex * 86_400_000).toISOString();
}

/**
 * Compute today's quest progress, auto-claim any newly completed quests and
 * return the full state plus the list of quests claimed by THIS call (so the
 * client can celebrate exactly what just completed).
 */
export async function syncDailyQuests(
  client: SupabaseClient,
  userId: string,
): Promise<DailyQuestSyncResult> {
  const since = utcDayStartISO();
  const today = since.slice(0, 10);

  const [profileRes, msgCountRes, msgGirlsRes, photoCountRes, claimsRes] = await Promise.all([
    client
      .from('profiles')
      .select('last_checkin_at')
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', since),
    client
      .from('chat_messages')
      .select('girlfriend_id')
      .eq('user_id', userId)
      .eq('role', 'user')
      .gte('created_at', since)
      .limit(500),
    client
      .from('chat_media')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('media_type', 'image')
      .gte('created_at', since),
    client
      .from('daily_quest_claims')
      .select('quest_code')
      .eq('user_id', userId)
      .eq('quest_date', today),
  ]);

  const lastCheckin = profileRes.data?.last_checkin_at;
  const checkedIn = lastCheckin ? new Date(lastCheckin).toISOString().slice(0, 10) === today : false;
  const messagesToday = msgCountRes.count || 0;
  const distinctCompanions = new Set(
    ((msgGirlsRes.data || []) as Array<{ girlfriend_id: string | null }>)
      .map((r) => r.girlfriend_id)
      .filter(Boolean),
  ).size;
  const photosToday = photoCountRes.count || 0;
  const claimedCodes = new Set(
    ((claimsRes.data || []) as Array<{ quest_code: string }>).map((c) => c.quest_code),
  );

  const progressByCode: Record<string, number> = {
    checkin: checkedIn ? 1 : 0,
    first_message: Math.min(messagesToday, 1),
    first_photo: Math.min(photosToday, 1),
    three_companions: Math.min(distinctCompanions, 3),
    three_photos: Math.min(photosToday, 3),
  };

  const newly_claimed: Array<{ code: string; reward: number }> = [];

  for (const def of DAILY_QUESTS) {
    const progress = progressByCode[def.code] ?? 0;
    const done = progress >= def.goal;
    if (!done || claimedCodes.has(def.code)) continue;

    const { error } = await client.from('daily_quest_claims').insert({
      user_id: userId,
      quest_code: def.code,
      quest_date: today,
      reward_credits: def.reward,
    });
    if (error) continue; // lost the race → another request already claimed

    claimedCodes.add(def.code);
    if (def.reward > 0) {
      const grant = await grantCredits(client, userId, def.reward, 'daily_quest', `${today}:${def.code}`);
      if (!grant.ok) {
        logger.warn('[daily-quests] grant failed', { userId, code: def.code, err: grant.error });
      }
    }
    newly_claimed.push({ code: def.code, reward: def.reward });
  }

  const allComplete = DAILY_QUESTS.every((def) => (progressByCode[def.code] ?? 0) >= def.goal);
  let bonusClaimed = claimedCodes.has(ALL_BONUS_CODE);

  if (allComplete && !bonusClaimed) {
    const { error } = await client.from('daily_quest_claims').insert({
      user_id: userId,
      quest_code: ALL_BONUS_CODE,
      quest_date: today,
      reward_credits: DAILY_QUEST_ALL_BONUS,
    });
    if (!error) {
      bonusClaimed = true;
      const grant = await grantCredits(client, userId, DAILY_QUEST_ALL_BONUS, 'quest_bonus', `${today}:${ALL_BONUS_CODE}`);
      if (!grant.ok) {
        logger.warn('[daily-quests] bonus grant failed', { userId, err: grant.error });
      }
      newly_claimed.push({ code: ALL_BONUS_CODE, reward: DAILY_QUEST_ALL_BONUS });
    }
  }

  return {
    date: today,
    quests: DAILY_QUESTS.map((def) => ({
      code: def.code,
      progress: progressByCode[def.code] ?? 0,
      goal: def.goal,
      reward: def.reward,
      done: (progressByCode[def.code] ?? 0) >= def.goal,
      claimed: claimedCodes.has(def.code),
    })),
    newly_claimed,
    all_complete: allComplete,
    bonus_claimed: bonusClaimed,
  };
}

export interface AchievementNotification {
  code: string;
  name: string;
  reward: number;
}

/**
 * Pop pending achievement-unlock notifications (unlocked but not yet shown
 * to the user). Marks them notified so each unlock is celebrated exactly once,
 * no matter which device/page surfaces it.
 */
export async function takeAchievementNotifications(
  client: SupabaseClient,
  userId: string,
): Promise<AchievementNotification[]> {
  const { data: pending, error } = await client
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId)
    .eq('unlocked', true)
    .eq('notified', false)
    .limit(20);

  if (error || !pending || pending.length === 0) return [];

  const ids = pending.map((p) => p.achievement_id);
  const { data: catalog } = await client
    .from('achievements')
    .select('id, code, name, reward_tokens')
    .in('id', ids);

  // Mark notified BEFORE returning so a concurrent call cannot double-pop.
  await client
    .from('user_achievements')
    .update({ notified: true })
    .eq('user_id', userId)
    .eq('unlocked', true)
    .eq('notified', false);

  const byId = new Map(
    ((catalog || []) as Array<{ id: string; code: string; name: string; reward_tokens: number | null }>).map(
      (a) => [String(a.id), a],
    ),
  );

  return ids
    .map((id) => byId.get(String(id)))
    .filter((a): a is { id: string; code: string; name: string; reward_tokens: number | null } => Boolean(a))
    .map((a) => ({ code: a.code, name: a.name, reward: a.reward_tokens || 0 }));
}
