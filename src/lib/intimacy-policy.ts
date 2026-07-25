import { getIntimacyLevel, getIntimacyProgress, type IntimacyLevel } from '@/lib/constants';

export type IntimacyGenerationPolicy = {
  level: IntimacyLevel;
  adultAllowed: boolean;
  nsfwIntensity: IntimacyLevel;
  sceneDirection: string;
  loraStrengthMultiplier: number;
};

export function getIntimacyGenerationPolicy(score: number): IntimacyGenerationPolicy {
  const level = getIntimacyLevel(score);
  const policies: Record<IntimacyLevel, Omit<IntimacyGenerationPolicy, 'level'>> = {
    1: {
      adultAllowed: false,
      nsfwIntensity: 1,
      sceneDirection: 'Fully clothed and flirtatious, with no exposed breasts, nipples, or genitals.',
      loraStrengthMultiplier: 0.78,
    },
    2: {
      adultAllowed: false,
      nsfwIntensity: 2,
      sceneDirection: 'Lingerie or low underwear with partial nudity and body touching, while genitals remain covered.',
      loraStrengthMultiplier: 0.9,
    },
    3: {
      adultAllowed: true,
      nsfwIntensity: 3,
      sceneDirection: 'Full adult nudity with clearly visible anatomy and no sexual act.',
      loraStrengthMultiplier: 1,
    },
    4: {
      adultAllowed: true,
      nsfwIntensity: 4,
      sceneDirection: 'Explicit solo masturbation before climax, with no visible sexual fluids.',
      loraStrengthMultiplier: 1.08,
    },
    5: {
      adultAllowed: true,
      nsfwIntensity: 5,
      sceneDirection: 'Explicit solo masturbation to climax with anatomy-appropriate restrained sexual fluids.',
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
