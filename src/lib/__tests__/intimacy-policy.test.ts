import { describe, expect, it } from 'vitest';
import {
  INTIMACY_MAX_SCORE,
  getIntimacyLevel,
  getIntimacyProgress,
} from '@/lib/constants';
import {
  getIntimacyGenerationPolicy,
  getIntimacyUnlockPayload,
} from '@/lib/intimacy-policy';

describe('intimacy levels', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [299, 2],
    [300, 3],
    [599, 3],
    [600, 4],
    [999, 4],
    [1000, 5],
    [1500, 5],
    [9999, 5],
  ])('maps score %s to level %s', (score, level) => {
    expect(getIntimacyLevel(score)).toBe(level);
  });

  it('reports progress to the next exact threshold', () => {
    expect(getIntimacyProgress(250)).toMatchObject({
      level: 2,
      remaining: 50,
      percent: 75,
    });
    expect(getIntimacyProgress(1500)).toMatchObject({
      score: INTIMACY_MAX_SCORE,
      level: 5,
      remaining: 0,
      percent: 100,
      isMax: true,
    });
  });
});

describe('intimacy generation policy', () => {
  it('unlocks adult generation at exactly 300', () => {
    expect(getIntimacyGenerationPolicy(299).adultAllowed).toBe(false);
    expect(getIntimacyGenerationPolicy(300).adultAllowed).toBe(true);
  });

  it('increases LoRA intensity as intimacy grows', () => {
    expect(getIntimacyGenerationPolicy(1000).loraStrengthMultiplier)
      .toBeGreaterThan(getIntimacyGenerationPolicy(300).loraStrengthMultiplier);
  });

  it('returns actionable unlock progress', () => {
    expect(getIntimacyUnlockPayload(225)).toEqual({
      current_score: 225,
      current_level: 2,
      required_score: 300,
      remaining: 75,
      unlock: 'adult_chat_and_image_generation',
    });
  });
});
