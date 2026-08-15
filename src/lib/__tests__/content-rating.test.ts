/**
 * Unit tests for the unified SFW/NSFW content rating layer.
 *
 * Covers the detection matrix (level 0-5 text samples, EN + ZH) and the
 * gating rules: intimacy policy, global kill switch, companion opt-out.
 */

import { describe, expect, it } from 'vitest';
import {
  detectAdultMention,
  detectRequestedNsfwLevel,
  resolveContentRating,
} from '../content-rating';
import { getIntimacyGenerationPolicy } from '../intimacy-policy';
import type { IntimacyGenerationPolicy } from '../intimacy-policy';

const sfwPolicy: IntimacyGenerationPolicy = {
  level: 1,
  adultAllowed: false,
  nsfwIntensity: 2,
  sceneDirection: '',
  loraStrengthMultiplier: 0.78,
};

const nsfwPolicy: IntimacyGenerationPolicy = {
  level: 5,
  adultAllowed: true,
  nsfwIntensity: 5,
  sceneDirection: '',
  loraStrengthMultiplier: 1.15,
};

const midNsfwPolicy: IntimacyGenerationPolicy = {
  level: 3,
  adultAllowed: true,
  nsfwIntensity: 3,
  sceneDirection: '',
  loraStrengthMultiplier: 1,
};

describe('detectRequestedNsfwLevel', () => {
  it('returns 0 for everyday text and empty input', () => {
    expect(detectRequestedNsfwLevel('a cozy dinner at the beach')).toBe(0);
    expect(detectRequestedNsfwLevel('')).toBe(0);
  });

  it('detects level 1 flirty signals', () => {
    expect(detectRequestedNsfwLevel('a sexy look in her eyes')).toBe(1);
    expect(detectRequestedNsfwLevel('暧昧的眼神')).toBe(1);
  });

  it('detects level 2 suggestive clothing', () => {
    expect(detectRequestedNsfwLevel('wearing a bikini on the beach')).toBe(2);
    expect(detectRequestedNsfwLevel('比基尼泳装写真')).toBe(2);
  });

  it('detects level 3 lingerie / seduction', () => {
    expect(detectRequestedNsfwLevel('wearing lace lingerie')).toBe(3);
    expect(detectRequestedNsfwLevel('情趣内衣写真')).toBe(3);
  });

  it('detects level 4 nudity', () => {
    expect(detectRequestedNsfwLevel('artistic nude portrait')).toBe(4);
    expect(detectRequestedNsfwLevel('裸体艺术照')).toBe(4);
  });

  it('detects level 5 explicit sexual content', () => {
    expect(detectRequestedNsfwLevel('explicit sex scene')).toBe(5);
    expect(detectRequestedNsfwLevel('做爱场景')).toBe(5);
  });

  it('returns the highest level when several match', () => {
    expect(detectRequestedNsfwLevel('naked and having sex')).toBe(5);
    expect(detectRequestedNsfwLevel('lingerie photoshoot, nude style')).toBe(4);
  });

  it('does not false-positive on innocent words', () => {
    expect(detectRequestedNsfwLevel('classic seaside painting')).toBe(0);
    expect(detectRequestedNsfwLevel('she is helpful and kind')).toBe(0);
  });
});

describe('detectAdultMention', () => {
  it('flags broad adult vocabulary even below level words', () => {
    expect(detectAdultMention('something nsfw please')).toBe(true);
    expect(detectAdultMention('nice garden photo')).toBe(false);
  });
});

describe('resolveContentRating', () => {
  it('forces SFW users to channel sfw with level capped at 2', () => {
    const result = resolveContentRating({
      userRequest: 'explicit sex scene',
      intimacyPolicy: sfwPolicy,
    });
    expect(result.channel).toBe('sfw');
    expect(result.requestedLevel).toBe(5);
    expect(result.level).toBeLessThanOrEqual(2);
    expect(result.adultMention).toBe(true);
    expect(result.downgraded).toBe(true);
  });

  it('never downgrades innocent SFW requests', () => {
    const result = resolveContentRating({
      userRequest: 'a picnic in the park',
      intimacyPolicy: sfwPolicy,
    });
    expect(result.channel).toBe('sfw');
    expect(result.level).toBe(0);
    expect(result.downgraded).toBe(false);
  });

  it('unlocks the nsfw channel when intimacy allows', () => {
    const result = resolveContentRating({
      userRequest: 'artistic nude portrait',
      intimacyPolicy: nsfwPolicy,
    });
    expect(result.channel).toBe('nsfw');
    expect(result.level).toBe(4);
    expect(result.downgraded).toBe(false);
  });

  it('caps nsfw level at the intimacy intensity', () => {
    const result = resolveContentRating({
      userRequest: 'explicit sex scene',
      intimacyPolicy: midNsfwPolicy, // nsfwIntensity 3
    });
    expect(result.channel).toBe('nsfw');
    expect(result.level).toBe(3);
    expect(result.maxIntensity).toBe(3);
  });

  it('global kill switch re-locks an otherwise unlocked companion', () => {
    const result = resolveContentRating({
      userRequest: 'artistic nude portrait',
      intimacyPolicy: nsfwPolicy,
      nsfwGloballyEnabled: false,
    });
    expect(result.channel).toBe('sfw');
    expect(result.level).toBeLessThanOrEqual(2);
    expect(result.downgraded).toBe(true);
  });

  it('companion opt-out re-locks NSFW too', () => {
    const result = resolveContentRating({
      userRequest: 'wearing lace lingerie',
      intimacyPolicy: nsfwPolicy,
      companionNsfwDisabled: true,
    });
    expect(result.channel).toBe('sfw');
    expect(result.level).toBe(2); // lingerie stays within the SFW band
    expect(result.downgraded).toBe(true);
  });

  it('scans chat context lines for intent as well', () => {
    const result = resolveContentRating({
      userRequest: 'take a photo of yourself',
      chatContext: [{ role: 'user', content: 'in that lingerie I mentioned' }],
      intimacyPolicy: nsfwPolicy,
    });
    expect(result.requestedLevel).toBe(3);
    expect(result.level).toBe(3);
  });

  it('matches the intimacy policy end-to-end', () => {
    const fresh = resolveContentRating({
      userRequest: 'explicit sex scene',
      intimacyPolicy: getIntimacyGenerationPolicy(0),
    });
    expect(fresh.channel).toBe('sfw');
    expect(fresh.downgraded).toBe(true);

    const intimate = resolveContentRating({
      userRequest: 'explicit sex scene',
      intimacyPolicy: getIntimacyGenerationPolicy(500),
    });
    expect(intimate.channel).toBe('nsfw');
    expect(intimate.level).toBeGreaterThanOrEqual(3);
  });
});
