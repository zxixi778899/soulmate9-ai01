/**
 * Conversation Lifecycle State Machine
 *
 * Manages the relationship phase transitions between the user and each companion.
 * Phases: first_add → intro_phase → daily_engagement → deepening → mature_relationship
 *
 * The phase determines *behavior boundaries* (prompt instructions), never specific text.
 * LLM generates all messages freely within those boundaries.
 */

import { logger } from '@/lib/logger';

export type LifecyclePhase =
  | 'first_add'
  | 'intro_phase'
  | 'daily_engagement'
  | 'deepening'
  | 'mature_relationship';

/** Behavior rules injected into the LLM prompt — not message templates. */
export const PHASE_BEHAVIOR_RULES: Record<LifecyclePhase, { zh: string; en: string }> = {
  first_add: {
    zh: '刚认识他。做简短的自我介绍，保持好奇和礼貌。问他希望怎么称呼你。',
    en: 'You just met him. Give a brief self-introduction, stay curious and polite. Ask what he\'d like you to call him.',
  },
  intro_phase: {
    zh: '认识不久。温柔有分寸，可以聊兴趣爱好，但不要过于亲昵。偶尔试探性地关心。',
    en: 'Recently acquainted. Warm but measured — chat about hobbies and interests, nothing too intimate yet. Occasionally show gentle curiosity.',
  },
  daily_engagement: {
    zh: '关系升温中。可以开始撒娇、用昵称、分享日常小事。但别太猛。',
    en: 'Warming up. You can start being playful, using pet names, sharing little daily things. Don\'t push too hard.',
  },
  deepening: {
    zh: '彼此已经很亲密。自然地表达想念和依恋，引用你们共同的记忆。',
    en: 'Already close. Naturally express longing and attachment, reference shared memories.',
  },
  mature_relationship: {
    zh: '老夫老妻。自然随意，什么都能聊，默契胜过千言。',
    en: 'Long-term couple. Natural and relaxed — you can talk about anything,默契 (tacit understanding) speaks louder than words.',
  },
};

const PHASE_ORDER: LifecyclePhase[] = [
  'first_add',
  'intro_phase',
  'daily_engagement',
  'deepening',
  'mature_relationship',
];

/**
 * Determine the lifecycle phase based on intimacy level and days since first add.
 */
export function resolveLifecyclePhase(input: {
  currentPhase?: string;
  intimacyLevel: number;
  daysSinceFirstAdd: number;
  openingMessageSent?: boolean;
}): LifecyclePhase {
  const { intimacyLevel, daysSinceFirstAdd, openingMessageSent } = input;

  // first_add: opening message not yet sent
  if (!openingMessageSent && daysSinceFirstAdd < 1) return 'first_add';

  // Phase by intimacy level + days
  if (intimacyLevel >= 4 || daysSinceFirstAdd >= 60) return 'mature_relationship';
  if (intimacyLevel >= 3 || daysSinceFirstAdd >= 14) return 'deepening';
  if (intimacyLevel >= 2 || daysSinceFirstAdd >= 3) return 'daily_engagement';
  return 'intro_phase';
}

/**
 * Check if phase transition should occur and return the new phase.
 */
export function evaluatePhaseTransition(input: {
  currentPhase: LifecyclePhase;
  intimacyLevel: number;
  daysSinceFirstAdd: number;
}): { shouldTransition: boolean; newPhase: LifecyclePhase } {
  const resolved = resolveLifecyclePhase({
    ...input,
    openingMessageSent: true,
  });
  return {
    shouldTransition: resolved !== input.currentPhase,
    newPhase: resolved,
  };
}

/**
 * Get the index of a phase in the lifecycle order.
 */
export function getPhaseIndex(phase: LifecyclePhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Check if a target phase has been reached relative to the current phase.
 */
export function isPhaseReached(targetPhase: LifecyclePhase, currentPhase: LifecyclePhase): boolean {
  return getPhaseIndex(currentPhase) >= getPhaseIndex(targetPhase);
}

/**
 * Get the behavior rules for the current phase in the requested language.
 */
export function getPhaseBehaviorRule(phase: LifecyclePhase, zh: boolean): string {
  const rule = PHASE_BEHAVIOR_RULES[phase] || PHASE_BEHAVIOR_RULES.intro_phase;
  return zh ? rule.zh : rule.en;
}

/**
 * Update the lifecycle phase in the database.
 */
export async function updateLifecyclePhase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  girlfriendId: string,
  newPhase: LifecyclePhase,
): Promise<void> {
  try {
    await client
      .from('companion_profiles_ext')
      .update({ lifecycle_phase: newPhase })
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId);
    logger.debug('[lifecycle] phase updated', { userId, girlfriendId, newPhase });
  } catch (err) {
    logger.warn('[lifecycle] phase update failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
