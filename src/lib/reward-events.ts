/**
 * Reward event bus — global plumbing for quest / achievement celebrations.
 *
 * Any part of the app can:
 *   - fireRewardEffect(...)  → show the celebration overlay directly
 *   - syncRewards()          → ask the server what just completed and
 *                              celebrate newly claimed quests + newly
 *                              unlocked achievements automatically
 */

import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { getTranslation } from '@/lib/i18n/translations';

export type RewardEffectKind = 'quest' | 'achievement' | 'checkin' | 'bonus';

export interface RewardEffectDetail {
  kind: RewardEffectKind;
  title: string;
  subtitle?: string;
  reward?: number;
}

export const REWARD_EFFECT_EVENT = 'soulmate:reward-effect';

export function fireRewardEffect(detail: RewardEffectDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RewardEffectDetail>(REWARD_EFFECT_EVENT, { detail }));
}

function currentLocale(): string {
  if (typeof window === 'undefined') return 'en';
  try {
    return localStorage.getItem('soulmate_locale') || 'en';
  } catch {
    return 'en';
  }
}

/** Translate with a hard fallback — getTranslation echoes the key when missing. */
export function rewardTr(key: string, fallback: string): string {
  try {
    const v = getTranslation(key, currentLocale());
    return v && v !== key ? v : fallback;
  } catch {
    return fallback;
  }
}

const QUEST_NAME_KEYS: Record<string, { key: string; fallback: string }> = {
  checkin: { key: 'quest.daily.checkin', fallback: '每日签到' },
  first_message: { key: 'quest.daily.firstMessage', fallback: '调戏一下伴侣' },
  first_photo: { key: 'quest.daily.firstPhoto', fallback: '美美的照片' },
  three_companions: { key: 'quest.daily.threeCompanions', fallback: '海王日常' },
  three_photos: { key: 'quest.daily.threePhotos', fallback: '老司机' },
  all_bonus: { key: 'quest.daily.allBonus', fallback: '全勤奖励' },
};

export function questDisplayName(code: string): string {
  const def = QUEST_NAME_KEYS[code];
  return def ? rewardTr(def.key, def.fallback) : code;
}

interface SyncResponse {
  newly_claimed?: Array<{ code: string; reward: number }>;
  achievements_unlocked?: Array<{ code: string; name: string; reward: number }>;
}

let inFlight: Promise<void> | null = null;
let lastSyncAt = 0;
const MIN_SYNC_INTERVAL_MS = 2500;

/**
 * Ask the server what just completed and celebrate it. Safe to call often —
 * requests are debounced and de-duplicated. The server auto-claims completed
 * quests, so this both grants rewards and surfaces the effects.
 */
export function syncRewards(opts?: { force?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const now = Date.now();
  if (!opts?.force && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) return Promise.resolve();
  if (inFlight) return inFlight;
  lastSyncAt = now;

  inFlight = (async () => {
    try {
      const res = await authedFetch('/api/daily-quests');
      if (!res.ok) return;
      const data = (await readResponseJson(res).catch(() => ({}))) as SyncResponse;

      let celebrated = false;
      for (const q of data.newly_claimed || []) {
        // The check-in itself celebrates separately; its quest row carries no extra reward.
        if (q.code === 'checkin' && q.reward <= 0) continue;
        const isBonus = q.code === 'all_bonus';
        fireRewardEffect({
          kind: isBonus ? 'bonus' : 'quest',
          title: questDisplayName(q.code),
          subtitle: rewardTr(
            isBonus ? 'quest.daily.allBonusDesc' : 'quest.daily.completed',
            isBonus ? 'All daily quests complete!' : 'Daily quest complete',
          ),
          reward: q.reward,
        });
        celebrated = true;
      }
      for (const a of data.achievements_unlocked || []) {
        fireRewardEffect({
          kind: 'achievement',
          title: rewardTr(`ach.${a.code}.name`, a.name),
          subtitle: rewardTr('quest.achievementUnlocked', 'Achievement unlocked'),
          reward: a.reward,
        });
        celebrated = true;
      }
      if (celebrated) {
        window.dispatchEvent(new Event('soulmate:credits-updated'));
      }
    } catch {
      /* silent — celebration is best-effort */
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
