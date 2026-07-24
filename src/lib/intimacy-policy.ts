import { getIntimacyLevel, getIntimacyProgress, type IntimacyLevel } from '@/lib/constants';

export type IntimacyGenerationPolicy = {
  level: IntimacyLevel;
  adultAllowed: boolean;
  sceneDirection: string;
  loraStrengthMultiplier: number;
};

export function getIntimacyGenerationPolicy(score: number): IntimacyGenerationPolicy {
  const level = getIntimacyLevel(score);
  const policies: Record<IntimacyLevel, Omit<IntimacyGenerationPolicy, 'level'>> = {
    1: {
      adultAllowed: false,
      sceneDirection: 'Keep the scene warm, fully clothed, non-sexual, and focused on trust-building eye contact.',
      loraStrengthMultiplier: 0.78,
    },
    2: {
      adultAllowed: false,
      sceneDirection: 'Use playful romantic tension and fashionable clothing; keep anatomy covered and the scene non-explicit.',
      loraStrengthMultiplier: 0.9,
    },
    3: {
      adultAllowed: true,
      sceneDirection: 'Adult intimacy is unlocked; follow the requested consensual scene with a romantic, mutually engaged tone.',
      loraStrengthMultiplier: 1,
    },
    4: {
      adultAllowed: true,
      sceneDirection: 'Use confident, proactive adult posing and stronger scene-specific outfit and pose styling.',
      loraStrengthMultiplier: 1.08,
    },
    5: {
      adultAllowed: true,
      sceneDirection: 'Use the highest requested consensual adult intensity, direct posing, and precise scene details.',
      loraStrengthMultiplier: 1.15,
    },
  };
  return { level, ...policies[level] };
}

export function getIntimacyUnlockPayload(score: number) {
  const progress = getIntimacyProgress(score);
  return {
    current_score: progress.score,
    current_level: progress.level,
    required_score: 300,
    remaining: Math.max(0, 300 - progress.score),
    unlock: 'adult_chat_and_image_generation',
  };
}
