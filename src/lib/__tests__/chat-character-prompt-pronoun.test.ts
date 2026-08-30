import { describe, expect, it } from 'vitest';
import { resolveSoulPronouns, buildCharacterPrompt } from '../chat-character-prompt';

describe('resolveSoulPronouns', () => {
  it('detects female companions and uses 她 pronouns (zh) + she (en)', () => {
    const p = resolveSoulPronouns('Female');
    expect(p.subject).toBe('她');
    expect(p.possessive).toBe('她的');
    expect(p.enSubject).toBe('she');
    expect(p.enPossessive).toBe('her');
  });

  it('detects male companions and uses 他 pronouns (zh) + he (en)', () => {
    const p = resolveSoulPronouns('Male');
    expect(p.subject).toBe('他');
    expect(p.possessive).toBe('他的');
    expect(p.enSubject).toBe('he');
    expect(p.enPossessive).toBe('his');
  });

  it('detects transgender female-to-male companions as 他', () => {
    const p = resolveSoulPronouns('Transgender F2M');
    expect(p.subject).toBe('他');
    expect(p.enSubject).toBe('he');
  });

  it('falls back to neutral for non-binary / unknown gender', () => {
    const p = resolveSoulPronouns('NonBinary');
    expect(p.subject).toBe('它');
    expect(p.enSubject).toBe('they');
  });

  it('handles Chinese tokens like 女 / 男 correctly', () => {
    expect(resolveSoulPronouns('女').subject).toBe('她');
    expect(resolveSoulPronouns('男').subject).toBe('他');
  });

  it('prefers male when gender string mixes ambiguous tokens with male markers', () => {
    expect(resolveSoulPronouns('femboy').subject).toBe('他');
  });
});

describe('buildCharacterPrompt — gender neutrality', () => {
  const baseGf: Record<string, unknown> = {
    name: 'Test',
    gender: 'Female',
    personality: '温柔',
    backstory: 'A test character',
    character_card: {
      soul: {
        scenario: { zh: '一个奇幻场景', en: 'A fantasy scene' },
        examples: [{ user: { zh: '你好', en: 'hi' }, reply: { zh: '嗨', en: 'hey' } }],
      },
    },
  };

  it('uses 她 pronouns for female companion', () => {
    const prompt = buildCharacterPrompt({
      gf: baseGf,
      intimacyLevel: 4,
      detectedEmotion: 'neutral',
      locale: 'zh',
    });
    expect(prompt).toContain('她的世界');
    expect(prompt).toContain('她：嗨');
    expect(prompt).toContain('他的人');
  });

  it('uses 他 pronouns for male companion — no leftover 她', () => {
    const prompt = buildCharacterPrompt({
      gf: { ...baseGf, gender: 'Male', personality: '沉稳' },
      intimacyLevel: 4,
      detectedEmotion: 'neutral',
      locale: 'zh',
    });
    expect(prompt).toContain('他的世界');
    expect(prompt).toContain('他：嗨');
    expect(prompt).not.toContain('她的世界');
    expect(prompt).not.toContain('她：嗨');
    expect(prompt).toContain('他的人');
  });

  it('uses He/His in English for male companion — no leftover Her', () => {
    const prompt = buildCharacterPrompt({
      gf: { ...baseGf, gender: 'Male', personality: 'calm', backstory: 'A test' },
      intimacyLevel: 4,
      detectedEmotion: 'neutral',
      locale: 'en',
    });
    expect(prompt).toContain('His world');
    expect(prompt).not.toContain('Her world');
    expect(prompt).not.toContain('Her:');
  });

  it('dialogue mode respects gender (他说出口 vs 她说出口)', () => {
    const femalePrompt = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 4, detectedEmotion: 'neutral', locale: 'zh', replyMode: 'dialogue',
    });
    const malePrompt = buildCharacterPrompt({
      gf: { ...baseGf, gender: 'Male', personality: '沉稳' },
      intimacyLevel: 4, detectedEmotion: 'neutral', locale: 'zh', replyMode: 'dialogue',
    });
    expect(femalePrompt).toContain('她说出');
    expect(malePrompt).toContain('他说出');
  });
});

describe('buildCharacterPrompt — NSFW gradient by intimacy level', () => {
  const baseGf: Record<string, unknown> = {
    name: 'Test',
    gender: 'Female',
    personality: '温柔',
    backstory: 'A test character',
  };

  it('L1 SFW — locks NSFW even when allowNsfw=true', () => {
    const prompt = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 1, intimacyScore: 30, detectedEmotion: 'neutral',
      locale: 'zh', allowNsfw: true,
    });
    expect(prompt).toContain('培养期');
    expect(prompt).toContain('培养期');
    expect(prompt).not.toContain('【温度 L5/5');
    expect(prompt).not.toContain('成人已解锁');
  });

  it('L2 SFW — flirting, no NSFW unlock yet', () => {
    const prompt = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 2, intimacyScore: 150, detectedEmotion: 'neutral',
      locale: 'zh', allowNsfw: true,
    });
    expect(prompt).toContain('暧昧期');
    expect(prompt).toContain('擦边');
    expect(prompt).not.toContain('【温度 L3/5');
  });

  it('L3 unlocks NSFW with romantic pacing cue', () => {
    const prompt = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 3, intimacyScore: 320, detectedEmotion: 'neutral',
      locale: 'zh', allowNsfw: true,
    });
    expect(prompt).toContain('热恋期');
    expect(prompt).toContain('【温度 L3/5');
    expect(prompt).toContain('刚解锁');
  });

  it('L4 NSFW escalates to proactive guidance', () => {
    const prompt = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 4, intimacyScore: 600, detectedEmotion: 'neutral',
      locale: 'zh', allowNsfw: true, nsfwChannel: true,
    });
    expect(prompt).toContain('极品伴侣');
    expect(prompt).toContain('【温度 L4/5');
    expect(prompt).toContain('主动');
  });

  it('L5 highest intimacy — different copy than L4 even though both allow NSFW', () => {
    const l4 = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 4, intimacyScore: 500, detectedEmotion: 'neutral',
      locale: 'zh', allowNsfw: true, nsfwChannel: true,
    });
    const l5 = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 5, intimacyScore: 800, detectedEmotion: 'neutral',
      locale: 'zh', allowNsfw: true, nsfwChannel: true,
    });
    expect(l4).toContain('【温度 L4/5');
    expect(l5).toContain('【温度 L5/5');
    expect(l5).not.toEqual(l4);
  });

  it('does NOT bypass the NSFW lock when allowNsfw=false, even at L4', () => {
    const prompt = buildCharacterPrompt({
      gf: baseGf, intimacyLevel: 4, intimacyScore: 500, detectedEmotion: 'neutral',
      locale: 'zh', allowNsfw: false,
    });
    expect(prompt).toContain('培养期');
    expect(prompt).not.toContain('【温度 L4/5');
  });
});
