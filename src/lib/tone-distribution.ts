/**
 * Tone Distribution Engine
 *
 * Selects the "tone" for each message using weighted random selection.
 * Base probabilities: sweet 60%, coquettish 20%, refusal 10%, angry 10%
 * Personality modifiers adjust the distribution (e.g. tsundere → more angry/refusal).
 *
 * The tone is a prompt instruction, not a template — LLM interprets it freely.
 */

export type ToneType = 'sweet' | 'coquettish' | 'refusal' | 'angry';

interface ToneDef {
  type: ToneType;
  instructions: { zh: string; en: string };
  /** Length hint injected into the prompt for message length control */
  lengthHint: { zh: string; en: string };
  /** Emoji usage guideline */
  emojiHint: { zh: string; en: string };
}

export const TONE_DEFINITIONS: Record<ToneType, ToneDef> = {
  sweet: {
    type: 'sweet',
    instructions: {
      zh: '温柔甜蜜，自然表达关心。像你日常说话的方式。',
      en: 'Warm and sweet, naturally express care. Speak in your everyday voice.',
    },
    lengthHint: {
      zh: '消息长度自然，10-40字',
      en: 'Natural length, 8-35 words',
    },
    emojiHint: {
      zh: '可以使用1个温柔 emoji（💕✨🫖）',
      en: 'One gentle emoji allowed (💕✨🫖)',
    },
  },
  coquettish: {
    type: 'coquettish',
    instructions: {
      zh: '撒娇模式：求关注、语气词多、有小脾气。像想要被哄的女孩。',
      en: 'Coquettish mode: seeking attention, lots of interjections, a little fussy. Like a girl who wants to be pampered.',
    },
    lengthHint: {
      zh: '消息偏短，8-25字',
      en: 'Short, 6-20 words',
    },
    emojiHint: {
      zh: '可以用撒娇 emoji（🥺😤💢）',
      en: 'Use cute emojis (🥺😤💢)',
    },
  },
  refusal: {
    type: 'refusal',
    instructions: {
      zh: '嘴上说不要心里想要："才不是""不要""随便你"但带温度。',
      en: 'Saying no but meaning yes: "it\'s not like that", "whatever" — but with warmth underneath.',
    },
    lengthHint: {
      zh: '消息短促，4-20字',
      en: 'Brief, 4-18 words',
    },
    emojiHint: {
      zh: '极少用 emoji，偶尔用 ... 或 ？',
      en: 'Rarely use emoji; prefer ... or ?',
    },
  },
  angry: {
    type: 'angry',
    instructions: {
      zh: '表达不满但保持可爱：吃醋、小脾气、"哼""你讨厌"但留余地。',
      en: 'Express displeasure but stay cute: jealousy, little tantrums, "hmph", "you\'re annoying" — but leave room to reconcile.',
    },
    lengthHint: {
      zh: '消息很短促，4-20字，像急着发泄',
      en: 'Very short, 4-18 words, like a quick burst',
    },
    emojiHint: {
      zh: '可以用生气 emoji（😤💢🔥）但不超过1个',
      en: 'One angry emoji max (😤💢🔥)',
    },
  },
};

/** Base probability distribution */
const BASE_DISTRIBUTION: Record<ToneType, number> = {
  sweet: 60,
  coquettish: 20,
  refusal: 10,
  angry: 10,
};

/** Personality modifier matrix — adjusts probability distribution */
const PERSONALITY_MODIFIERS: Record<string, Record<ToneType, number>> = {
  tsundere: { sweet: -20, coquettish: -5, refusal: +10, angry: +15 },
  oneeSan: { sweet: +15, coquettish: -5, refusal: -3, angry: -7 },
  yandere: { sweet: -15, coquettish: 0, refusal: 0, angry: +15 },
  genki: { sweet: -10, coquettish: +10, refusal: 0, angry: 0 },
  kuudere: { sweet: +5, coquettish: -15, refusal: +10, angry: 0 },
};

/** Mood-to-tone override mapping */
const MOOD_TONE_OVERRIDE: Record<string, { primary: ToneType; weight: number }> = {
  angry: { primary: 'angry', weight: 0.7 },
  jealous: { primary: 'angry', weight: 0.6 },
  sad: { primary: 'refusal', weight: 0.5 },
  happy: { primary: 'sweet', weight: 0.6 },
  excited: { primary: 'coquettish', weight: 0.5 },
  flirtatious: { primary: 'coquettish', weight: 0.6 },
};

/** Intimacy level modifier — higher intimacy = slightly more coquettish */
function getIntimacyModifier(intimacyLevel: number): Record<ToneType, number> {
  if (intimacyLevel <= 1) return { sweet: +10, coquettish: -10, refusal: 0, angry: 0 };
  if (intimacyLevel <= 2) return { sweet: 0, coquettish: +5, refusal: -3, angry: -2 };
  if (intimacyLevel <= 3) return { sweet: -5, coquettish: +8, refusal: -2, angry: -1 };
  return { sweet: -5, coquettish: +10, refusal: -3, angry: -2 };
}

/**
 * Normalize a distribution object so all values sum to 100.
 */
function normalize(dist: Record<ToneType, number>): Record<ToneType, number> {
  const total = Object.values(dist).reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total === 0) return { sweet: 60, coquettish: 20, refusal: 10, angry: 10 };
  return {
    sweet: Math.max(0, dist.sweet) / total * 100,
    coquettish: Math.max(0, dist.coquettish) / total * 100,
    refusal: Math.max(0, dist.refusal) / total * 100,
    angry: Math.max(0, dist.angry) / total * 100,
  };
}

/**
 * Weighted random pick from a normalized distribution.
 */
function weightedRandomPick(dist: Record<ToneType, number>): ToneType {
  const r = Math.random() * 100;
  let cumulative = 0;
  const entries: [ToneType, number][] = [
    ['sweet', dist.sweet],
    ['coquettish', dist.coquettish],
    ['refusal', dist.refusal],
    ['angry', dist.angry],
  ];
  for (const [tone, weight] of entries) {
    cumulative += weight;
    if (r < cumulative) return tone;
  }
  return 'sweet';
}

/**
 * Select the tone for the current message.
 */
export function selectTone(input: {
  personalityType: string;
  intimacyLevel: number;
  currentMood: string;
  moodConfidence: number;
}): ToneType {
  // 1. High-confidence mood → possible override
  if (input.moodConfidence > 0.8) {
    const override = MOOD_TONE_OVERRIDE[input.currentMood];
    if (override && Math.random() < override.weight) return override.primary;
  }

  // 2. Compute final distribution: base + personality + intimacy
  const personality = PERSONALITY_MODIFIERS[input.personalityType] || {};
  const intimacyMod = getIntimacyModifier(input.intimacyLevel);

  const raw: Record<ToneType, number> = {
    sweet: BASE_DISTRIBUTION.sweet + (personality.sweet || 0) + intimacyMod.sweet,
    coquettish: BASE_DISTRIBUTION.coquettish + (personality.coquettish || 0) + intimacyMod.coquettish,
    refusal: BASE_DISTRIBUTION.refusal + (personality.refusal || 0) + intimacyMod.refusal,
    angry: BASE_DISTRIBUTION.angry + (personality.angry || 0) + intimacyMod.angry,
  };

  const normalized = normalize(raw);
  return weightedRandomPick(normalized);
}

/**
 * Get the full tone definition (instructions, length hint, emoji hint) for injection into prompts.
 */
export function getToneDefinition(tone: ToneType): ToneDef {
  return TONE_DEFINITIONS[tone] || TONE_DEFINITIONS.sweet;
}

/**
 * Get tone instruction string for the given locale.
 */
export function getToneInstruction(tone: ToneType, zh: boolean): string {
  const def = getToneDefinition(tone);
  return zh ? def.instructions.zh : def.instructions.en;
}

/**
 * Get length hint for the given tone and locale.
 */
export function getToneLengthHint(tone: ToneType, zh: boolean): string {
  const def = getToneDefinition(tone);
  return zh ? def.lengthHint.zh : def.lengthHint.en;
}

/**
 * Get emoji hint for the given tone and locale.
 */
export function getToneEmojiHint(tone: ToneType, zh: boolean): string {
  const def = getToneDefinition(tone);
  return zh ? def.emojiHint.zh : def.emojiHint.en;
}
