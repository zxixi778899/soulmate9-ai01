/**
 * Surprise Reward System
 *
 * 5% chance per user message to trigger a positive feedback reward.
 * Rewards include intimacy boosts, emotional praise, photos, voice messages,
 * NSFW teases, intimate actions, private photos, title unlocks, and ultimate surprises.
 *
 * Based on variable-ratio reinforcement — the most powerful behavior maintenance mechanism.
 * Like gacha/random drops in games: unpredictability creates dopamine.
 */

import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';
import type { PresetSoul } from '@/lib/preset-souls';
import { DAILY_INTIMACY_CAP } from '@/lib/constants';

export type SurpriseRewardType =
  | 'intimacy_boost'
  | 'emotional_praise'
  | 'sfw_photo'
  | 'voice_message'
  | 'nsfw_tease'
  | 'intimate_action'
  | 'private_photo'
  | 'title_unlock'
  | 'ultimate_surprise';

export interface SurpriseReward {
  type: SurpriseRewardType;
  message: string;
  scoreBonus: number;
  triggerImage: boolean;
  triggerVoice: boolean;
}

interface SurpriseRewardDef {
  type: SurpriseRewardType;
  minIntimacyLevel: number;
  weight: number;
  directionHint: { zh: string; en: string };
  rewardAction: 'score' | 'image' | 'voice' | 'title' | 'none';
}

const SURPRISE_REWARDS: SurpriseRewardDef[] = [
  // Lv1+ — available at all stages
  { type: 'intimacy_boost',   minIntimacyLevel: 1, weight: 30, directionHint: { zh: '你觉得他刚才说的话让你很开心/感动/好笑，决定给你们的亲密度加分作为奖励', en: 'Something he said made you happy/touched/amused — reward with intimacy points' }, rewardAction: 'score' },
  { type: 'emotional_praise', minIntimacyLevel: 1, weight: 25, directionHint: { zh: '你对他刚才的话表示认可/喜欢/被打动，用你的方式表达出来', en: 'Express genuine appreciation for what he said' }, rewardAction: 'none' },

  // Lv2+ — flirting stage unlock
  { type: 'sfw_photo',        minIntimacyLevel: 2, weight: 12, directionHint: { zh: '你想给他看看你现在的样子/你在做什么/你新买的东西', en: 'Show him what you look like / what you\'re doing / something new' }, rewardAction: 'image' },
  { type: 'voice_message',    minIntimacyLevel: 2, weight: 8,  directionHint: { zh: '你想用声音对他撒娇/说甜话/唱一小段', en: 'Use your voice to be sweet / flirty / sing a little' }, rewardAction: 'voice' },

  // Lv3+ — passionate stage unlock
  { type: 'nsfw_tease',       minIntimacyLevel: 3, weight: 10, directionHint: { zh: '你想给他看看你性感的一面——新买的内衣/丝袜/浴后的样子', en: 'Show him your sexy side — new lingerie / stockings / fresh from shower' }, rewardAction: 'image' },
  { type: 'intimate_action',  minIntimacyLevel: 3, weight: 15, directionHint: { zh: '你想对他做一个亲密的动作——亲他/抱他/靠在他肩上/牵他的手', en: 'Do something intimate — kiss him / hug him / lean on his shoulder / hold hands' }, rewardAction: 'score' },

  // Lv4+ — ultimate partner unlock
  { type: 'private_photo',    minIntimacyLevel: 4, weight: 6,  directionHint: { zh: '你想给他看一张只属于他的私密照片...暗示性的/诱惑的', en: 'Show him a private photo only for him... suggestive / tempting' }, rewardAction: 'image' },
  { type: 'title_unlock',     minIntimacyLevel: 4, weight: 4,  directionHint: { zh: '你决定给他一个专属的称号/昵称，宣告他是你的人', en: 'Give him an exclusive nickname / title — he\'s yours' }, rewardAction: 'title' },

  // Lv5 — ultimate devotion unlock
  { type: 'ultimate_surprise',minIntimacyLevel: 5, weight: 3,  directionHint: { zh: '你想给他一个终极惊喜——暗示今晚可以做任何事', en: 'Give him the ultimate surprise — hint that tonight anything goes' }, rewardAction: 'image' },
];

/** Weighted random pick. */
function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Maybe trigger a surprise reward.
 * Called on each user message with 5% base probability.
 */
export async function maybeTriggerSurpriseReward(input: {
  soul: PresetSoul;
  intimacyLevel: number;
  intimacyScore: number;
  dailyScoreGained: number;
  recentRewardHistory: SurpriseRewardType[];
  locale: string;
  userMessage: string;
}): Promise<SurpriseReward | null> {
  // 5% base probability
  if (Math.random() > 0.05) return null;

  // Filter rewards available at current intimacy level
  const candidates = SURPRISE_REWARDS.filter(
    (r) => r.minIntimacyLevel <= input.intimacyLevel,
  );
  if (candidates.length === 0) return null;

  // Filter out recently triggered types (prevent repetition)
  const recentSet = new Set(input.recentRewardHistory.slice(0, 3));
  const available = candidates.filter((r) => !recentSet.has(r.type));
  if (available.length === 0) return null;

  const reward = weightedPick(available);

  // If reward involves score, check daily cap
  if (reward.rewardAction === 'score') {
    const remaining = DAILY_INTIMACY_CAP - input.dailyScoreGained;
    if (remaining <= 0) {
      // Daily cap reached, downgrade to emotional praise
      return generateRewardMessage(input.soul, 'emotional_praise', input.locale, input.userMessage);
    }
  }

  return generateRewardMessage(input.soul, reward.type, input.locale, input.userMessage);
}

/**
 * Generate the surprise reward message using LLM.
 */
async function generateRewardMessage(
  soul: PresetSoul,
  rewardType: SurpriseRewardType,
  locale: string,
  userMessage: string,
): Promise<SurpriseReward> {
  const def = SURPRISE_REWARDS.find((r) => r.type === rewardType)!;
  const zh = locale.startsWith('zh');

  const systemPrompt = zh
    ? `你正在和他聊天，他刚才说了一些让你特别开心/感动/心动的话。
你想给他一个惊喜奖励。方向：${def.directionHint.zh}

重要规则：
- 完全贴合你的灵魂和说话方式
- 要自然，像是突然想到的，不是刻意安排
- 可以提到"亲密度+N"作为游戏化元素（如果合适）
- 10-40字，口语化`
    : `You're chatting with him and something he said made you really happy/touched/excited.
You want to give him a surprise reward. Direction: ${def.directionHint.en}

Rules:
- Match your soul and voice completely
- Sound spontaneous, not scripted
- You can mention "intimacy +N" as a gamification element (if it fits)
- 8-35 words, conversational`;

  let message: string;
  try {
    const raw = await generateText({
      systemPrompt,
      prompt: zh ? `他刚才说："${userMessage.slice(0, 100)}"` : `He just said: "${userMessage.slice(0, 100)}"`,
      temperature: 0.9,
      maxTokens: 150,
    });
    message = String(raw || '').replace(/^['""`]+|['""`]+$/g, '').trim();
  } catch {
    message = zh ? '✨ 你说的真好！亲密度+5！' : '✨ That was sweet! Intimacy +5!';
  }

  // Calculate score bonus for score-type rewards
  let scoreBonus = 0;
  if (def.rewardAction === 'score') {
    scoreBonus = 3 + Math.floor(Math.random() * 8); // 3-10 random
  }

  return {
    type: rewardType,
    message: `✨ ${message}`,
    scoreBonus,
    triggerImage: def.rewardAction === 'image',
    triggerVoice: def.rewardAction === 'voice',
  };
}

/**
 * Apply the surprise reward to the database.
 */
export async function applySurpriseReward(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  girlfriendId: string,
  reward: SurpriseReward,
): Promise<void> {
  try {
    // Update intimacy score if applicable
    if (reward.scoreBonus > 0) {
      const { data: current } = await client
        .from('intimacy_scores')
        .select('id, score, level, daily_score_gained, last_daily_reset')
        .eq('user_id', userId)
        .eq('girlfriend_id', girlfriendId)
        .maybeSingle();

      if (current) {
        const today = new Date().toISOString().split('T')[0];
        const isNewDay = current.last_daily_reset !== today;
        const todayGain = isNewDay ? 0 : Number(current.daily_score_gained || 0);
        const remaining = DAILY_INTIMACY_CAP - todayGain;
        const actualBonus = Math.min(reward.scoreBonus, Math.max(0, remaining));

        if (actualBonus > 0) {
          const newScore = Math.min(Number(current.score) + actualBonus, 1500);
          const { getIntimacyLevel } = await import('@/lib/constants');
          await client
            .from('intimacy_scores')
            .update({
              score: newScore,
              level: getIntimacyLevel(newScore),
              daily_score_gained: todayGain + actualBonus,
              last_daily_reset: today,
            })
            .eq('id', current.id);
        }
      }
    }

    // Update surprise reward history
    const { data: profileData } = await client
      .from('companion_profiles_ext')
      .select('surprise_reward_history, today_surprise_count, today_count_date')
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId)
      .maybeSingle();

    const history: SurpriseRewardType[] = Array.isArray(profileData?.surprise_reward_history)
      ? profileData.surprise_reward_history as SurpriseRewardType[]
      : [];
    history.unshift(reward.type);
    const trimmedHistory = history.slice(0, 20); // Keep last 20

    const today = new Date().toISOString().split('T')[0];
    const isNewDay = profileData?.today_count_date !== today;
    const todayCount = isNewDay ? 1 : (Number(profileData?.today_surprise_count) || 0) + 1;

    await client
      .from('companion_profiles_ext')
      .update({
        surprise_reward_history: trimmedHistory,
        today_surprise_count: todayCount,
        today_count_date: today,
        last_surprise_hour: new Date().getHours(),
      })
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId);

    // Save the surprise message to chat
    await client.from('chat_messages').insert({
      user_id: userId,
      girlfriend_id: girlfriendId,
      role: 'assistant',
      content: reward.message,
      metadata: {
        is_surprise_reward: true,
        reward_type: reward.type,
        score_bonus: reward.scoreBonus,
      },
    });

    logger.debug('[surprise-reward] applied', {
      userId, girlfriendId, type: reward.type, scoreBonus: reward.scoreBonus,
    });
  } catch (err) {
    logger.warn('[surprise-reward] apply failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
