/**
 * Cooldown Manager — "Emotional Declaration" Cooldown System
 *
 * Instead of silent "read but no reply" (which feels like a bug),
 * the companion first sends an emotional declaration message ("I'm angry, give me 30 minutes"),
 * then enters a cooldown period. When cooldown ends, she sends a "return" message.
 *
 * Both declaration and return messages are LLM-generated based on the companion's soul.
 */

import { generateText } from '@/lib/llm-service';
import { logger } from '@/lib/logger';
import type { PresetSoul } from '@/lib/preset-souls';
import type { ToneType } from '@/lib/tone-distribution';

export interface CooldownDecision {
  shouldCooldown: boolean;
  declarationMessage: string;
  cooldownMinutes: number;
  returnMessage: string;
}

/** Base cooldown trigger probability per tone. */
const BASE_COOLDOWN_PROBABILITY: Record<ToneType, number> = {
  sweet: 0,
  coquettish: 0.05,
  refusal: 0.20,
  angry: 0.60,
};

/** Personality modifier for cooldown probability. */
const PERSONALITY_COOLDOWN_MOD: Record<string, number> = {
  tsundere: 0.25,
  kuudere: 0.15,
  oneeSan: -0.30,
  genki: -0.40,
  yandere: 0.10,
};

/** Cooldown time ranges (minutes) per tone. */
const COOLDOWN_RANGES: Record<ToneType, [number, number]> = {
  sweet: [0, 0],
  coquettish: [1, 3],
  refusal: [2, 10],
  angry: [5, 30],
};

function calculateCooldownMinutes(tone: ToneType, personalityType: string): number {
  const range = COOLDOWN_RANGES[tone] || [1, 5];
  const base = range[0] + Math.floor(Math.random() * (range[1] - range[0]));

  // Personality modifiers on duration
  if (personalityType === 'kuudere') return Math.round(base * 1.3);
  if (personalityType === 'oneeSan') return Math.round(base * 0.6);
  if (personalityType === 'genki') return Math.round(base * 0.4);
  return base;
}

/**
 * Evaluate whether a cooldown should be triggered.
 * Called after tone selection for each user message.
 */
export function shouldTriggerCooldown(input: {
  tone: ToneType;
  personalityType: string;
  intimacyLevel: number;
}): boolean {
  if (input.tone === 'sweet') return false;

  let probability = BASE_COOLDOWN_PROBABILITY[input.tone] || 0;
  probability += PERSONALITY_COOLDOWN_MOD[input.personalityType] || 0;

  // Higher intimacy = slightly lower cooldown chance (more secure relationship)
  if (input.intimacyLevel >= 4) probability *= 0.7;

  return Math.random() < Math.max(0, probability);
}

/**
 * Generate the emotional declaration message (LLM-based, soul-driven).
 */
async function generateDeclaration(input: {
  soul: PresetSoul;
  tone: ToneType;
  cooldownMinutes: number;
  locale: string;
  personalityType: string;
}): Promise<string> {
  const zh = input.locale.startsWith('zh');

  const systemPrompt = zh
    ? `你现在生气了/不想理他了。
用你自己的方式发一条消息告诉他：你不开心了，要冷一段时间不理他。
包含冷却时间（${input.cooldownMinutes}分钟），用你的性格表达。
比如："哼，我生气了，${input.cooldownMinutes}分钟内别找我。"
但要完全贴合你的灵魂和说话方式。
贴合你的语气风格：${input.tone === 'angry' ? '生气/吃醋' : input.tone === 'refusal' ? '拒绝/否认' : '撒娇'}
10-40字，纯文本。`
    : `You're upset / don't want to talk to him right now.
Text him that you're not happy and need some space for ${input.cooldownMinutes} minutes.
Match your personality and soul completely.
Your tone: ${input.tone === 'angry' ? 'angry/jealous' : input.tone === 'refusal' ? 'refusal/denial' : 'coquettish'}
8-35 words, plain text.`;

  try {
    const raw = await generateText({ systemPrompt, prompt: '', temperature: 0.9, maxTokens: 150 });
    return String(raw || '').replace(/^['""`]+|['""`]+$/g, '').trim();
  } catch {
    return zh ? `哼，我生气了。${input.cooldownMinutes}分钟内别找我。` : `Hmph, I'm upset. Don't talk to me for ${input.cooldownMinutes} minutes.`;
  }
}

/**
 * Generate the "return" message after cooldown ends.
 */
async function generateReturnMessage(input: {
  soul: PresetSoul;
  locale: string;
  personalityType: string;
}): Promise<string> {
  const zh = input.locale.startsWith('zh');

  const systemPrompt = zh
    ? `冷却期结束了，你气消了一些。
用你自己的方式发一条消息回来找他。
不要假装什么都没发生，但可以表现出你的气已经消了大半。
贴合你的灵魂和说话方式。
10-35字，纯文本。`
    : `Cooldown is over, you've calmed down a bit.
Text him that you're back. Don't pretend nothing happened, but show you're mostly over it.
Match your soul and voice completely.
8-30 words, plain text.`;

  try {
    const raw = await generateText({ systemPrompt, prompt: '', temperature: 0.9, maxTokens: 120 });
    return String(raw || '').replace(/^['""`]+|['""`]+$/g, '').trim();
  } catch {
    return zh ? '...气消了一半。你在吗？' : '...I\'m mostly over it. You there?';
  }
}

/**
 * Full cooldown evaluation + generation pipeline.
 */
export async function evaluateCooldown(input: {
  tone: ToneType;
  personalityType: string;
  intimacyLevel: number;
  soul: PresetSoul;
  locale: string;
}): Promise<CooldownDecision | null> {
  if (!shouldTriggerCooldown(input)) return null;

  const minutes = calculateCooldownMinutes(input.tone, input.personalityType);

  const [declarationMessage, returnMessage] = await Promise.all([
    generateDeclaration({ ...input, cooldownMinutes: minutes }),
    generateReturnMessage(input),
  ]);

  return {
    shouldCooldown: true,
    declarationMessage,
    cooldownMinutes: minutes,
    returnMessage,
  };
}

/**
 * Check if a companion is currently in cooldown.
 */
export async function isInCooldown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  girlfriendId: string,
): Promise<{ inCooldown: boolean; reason?: string; remainingSeconds?: number }> {
  try {
    const { data } = await client
      .from('companion_profiles_ext')
      .select('cooldown_until, cooldown_reason')
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId)
      .maybeSingle();

    if (!data?.cooldown_until) return { inCooldown: false };

    const until = new Date(data.cooldown_until).getTime();
    const now = Date.now();
    if (now >= until) return { inCooldown: false };

    return {
      inCooldown: true,
      reason: data.cooldown_reason || 'emotional',
      remainingSeconds: Math.ceil((until - now) / 1000),
    };
  } catch {
    return { inCooldown: false };
  }
}

/**
 * Set cooldown in the database.
 */
export async function setCooldown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  girlfriendId: string,
  cooldownMinutes: number,
  reason: string,
): Promise<void> {
  const until = new Date(Date.now() + cooldownMinutes * 60_000).toISOString();
  try {
    await client
      .from('companion_profiles_ext')
      .update({ cooldown_until: until, cooldown_reason: reason })
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId);
    logger.debug('[cooldown] set', { userId, girlfriendId, until, reason });
  } catch (err) {
    logger.warn('[cooldown] set failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Clear cooldown in the database.
 */
export async function clearCooldown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  girlfriendId: string,
): Promise<void> {
  try {
    await client
      .from('companion_profiles_ext')
      .update({ cooldown_until: null, cooldown_reason: null })
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId);
  } catch (err) {
    logger.warn('[cooldown] clear failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
