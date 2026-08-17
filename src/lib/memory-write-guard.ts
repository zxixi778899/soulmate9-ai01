/**
 * Memory Write Guard — Identity Confusion Prevention
 *
 * Prevents companion information from being incorrectly stored as user memories.
 * Example: "I love singing" said by the AI companion should NOT be stored as
 * "user loves singing" in the user's memory profile.
 *
 * Every memory extracted from chat is filtered through this guard before persistence.
 */

import { logger } from '@/lib/logger';

export interface MemoryGuardResult {
  allowed: boolean;
  reason: string;
  correctedContent?: string;
}

/** Keywords that signal the speaker is the companion (not the user). */
const COMPANION_SELF_MARKERS = [
  // Chinese
  '我是你的', '我是你女', '我是你伴', '我是你的女', '作为你的',
  '人家', '本小姐', '本姑娘', '姐姐我', '我这个人',
  // English
  'as your girlfriend', 'as your companion', 'i am your',
  "i'm your", "i'm here for you", 'your girl',
];

/** Patterns that indicate the memory is about the companion, not the user. */
const COMPANION_SUBJECT_PATTERNS = [
  // "She/I likes..." patterns from assistant messages
  /^(?:she|i|我|她|人家|本小姐)\s*(?:likes?|loves?|enjoys?|hates?|dislikes?|prefers?|wants?|needs?|feels?|thinks?|believes?|likes? to)/i,
  /^(?:she|i|我|她)\s*(?:am|is|are|was|were|will be|have been|有|是|在)/i,
  // Chinese companion self-reference patterns
  /^(?:我|人家|姐姐|本姑娘)\s*(?:喜欢|爱|讨厌|觉得|想|要|会|能|可以|经常|总是|一般|平时)/,
];

/** Patterns that indicate the memory IS about the user (safe to store). */
const USER_SUBJECT_PATTERNS = [
  /^(?:you|he|user|你|他|用户)\s*(?:likes?|loves?|enjoys?|hates?|dislikes?|prefers?|wants?|works?|lives?|studies?|plays?)/i,
  /^(?:you|he|his|your|你|他|你的|他的)\s*(?:name|age|job|city|hobby|favorite|名字|年龄|工作|城市|爱好|喜欢|讨厌)/i,
  // "User said/mentioned..." framing
  /(?:user|he|你|他)\s*(?:said|mentioned|told|asked|wants|likes|said that)/i,
  // Chinese user-subject patterns
  /^(?:你|他)\s*(?:喜欢|爱|讨厌|做|在|是|有|叫|住|工作)/,
  /^(?:用户|他|你)\s*(?:的名字|的年龄|的工作|的城市|喜欢|讨厌)/,
];

/**
 * Check whether an extracted memory is about the user (allowed) or about
 * the companion (blocked).
 *
 * @param memoryContent - The memory text to validate
 * @param sourceRole - The role of the message the memory was extracted from ('user' or 'assistant')
 * @param companionName - The companion's name for additional filtering
 */
export function validateMemoryOwnership(input: {
  memoryContent: string;
  sourceRole: 'user' | 'assistant';
  companionName: string;
}): MemoryGuardResult {
  const { memoryContent, sourceRole, companionName } = input;
  const content = memoryContent.trim();

  if (!content || content.length < 3) {
    return { allowed: false, reason: 'empty_content' };
  }

  // Rule 1: Memories extracted from USER messages are almost always about the user
  if (sourceRole === 'user') {
    // Exception: user quoting the companion ("she said she likes cats")
    const quotesCompanion = new RegExp(
      `(?:she|${escapeRegex(companionName)}|你的女友|你的伴侣)\\s*(?:said|says|told|likes?|loves?|wants?)`,
      'i',
    );
    if (quotesCompanion.test(content)) {
      return { allowed: false, reason: 'user_quoting_companion' };
    }
    return { allowed: true, reason: 'user_message_origin' };
  }

  // Rule 2: Memories from ASSISTANT messages need careful checking
  // (assistant talking about themselves vs. describing the user)

  // Check: does it look like companion self-description?
  for (const pattern of COMPANION_SUBJECT_PATTERNS) {
    if (pattern.test(content)) {
      return { allowed: false, reason: 'companion_self_reference' };
    }
  }

  // Check: companion self markers
  const lowerContent = content.toLowerCase();
  for (const marker of COMPANION_SELF_MARKERS) {
    if (lowerContent.includes(marker.toLowerCase())) {
      return { allowed: false, reason: 'companion_identity_marker' };
    }
  }

  // Check: companion name as subject
  if (companionName && content.startsWith(companionName)) {
    return { allowed: false, reason: 'companion_name_subject' };
  }

  // Check: explicitly about the user?
  for (const pattern of USER_SUBJECT_PATTERNS) {
    if (pattern.test(content)) {
      return { allowed: true, reason: 'user_subject_confirmed' };
    }
  }

  // Default: memories from assistant messages that don't clearly reference the user
  // are treated as companion self-descriptions → block
  return { allowed: false, reason: 'ambiguous_assistant_origin' };
}

/**
 * Batch-filter an array of extracted memories, removing any that belong to the companion.
 */
export function filterMemoriesByOwnership(input: {
  memories: Array<{ content: string; type: string; category: string }>;
  sourceRole: 'user' | 'assistant';
  companionName: string;
}): Array<{ content: string; type: string; category: string }> {
  const { memories, sourceRole, companionName } = input;

  const allowed = memories.filter((mem) => {
    const result = validateMemoryOwnership({
      memoryContent: mem.content,
      sourceRole,
      companionName,
    });

    if (!result.allowed) {
      logger.debug('[memory-guard] blocked', {
        content: mem.content.slice(0, 60),
        reason: result.reason,
      });
    }

    return result.allowed;
  });

  const blocked = memories.length - allowed.length;
  if (blocked > 0) {
    logger.info('[memory-guard] filtered', { total: memories.length, allowed: allowed.length, blocked });
  }

  return allowed;
}

/**
 * Upgrade the memory extraction prompt to explicitly instruct the LLM
 * to only extract USER information, not companion information.
 * Returns the V2 extract prompt string.
 */
export function getMemoryExtractPromptV2(companionName: string): string {
  return `Extract memorable facts, preferences, and context from this chat between ${companionName} (AI companion) and her user.

CRITICAL RULES:
- Extract ONLY information about the USER (the human), NEVER about ${companionName}
- If ${companionName} says "I love singing", do NOT extract "loves singing" — that's about her, not him
- If the user says "I work as a developer", extract "works as a developer" — that's about him
- Ignore all statements where ${companionName} is the subject

Return ONLY a JSON array. Each item: { "content": "<one sentence about the USER>", "type": "<type>", "category": "<category>" }

Types: interest, event, fact, emotion, preference, intent, physical, social
Categories: interest, daily, career, social, emotional, future, health, work, family

Only extract things that:
- Are about the USER (his job, hobbies, family, preferences, plans, health)
- Would be useful to remember in future conversations
- Are stated as facts, not transient chat

Return [] if nothing memorable about the USER.

Messages:
"""%s"""`;
}

/** Escape special regex characters. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
