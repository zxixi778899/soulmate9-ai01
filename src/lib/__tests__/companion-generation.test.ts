import { describe, expect, it } from 'vitest';
import { buildCompanionGenerationPrompt } from '@/lib/companion-generation';
import { resolveCompanionProfile } from '@/lib/companion-profile';

describe('companion profiles', () => {
  it.each([
    ['Female', 'realistic', 'female', 'she', 'girlfriend'],
    ['Male', 'realistic', 'male', 'he', 'boyfriend'],
    ['Transgender', 'realistic', 'transgender', 'they', 'partner'],
    ['Female', 'anime', 'anime', 'they', 'partner'],
  ])('resolves %s/%s consistently', (gender, style, category, pronoun, relationship) => {
    const profile = resolveCompanionProfile({ gender, appearance_style: style });
    expect(profile.category).toBe(category);
    expect(profile.pronouns.subject).toBe(pronoun);
    expect(profile.relationship).toBe(relationship);
  });
});

describe('companion generation prompt', () => {
  it.each([
    ['Female', 'realistic', 'female'],
    ['Male', 'realistic', 'male'],
    ['Transgender', 'realistic', 'transgender'],
    ['Female', 'anime', 'anime'],
  ])('combines companion-specific prompt sections for %s/%s', (gender, style, category) => {
    const result = buildCompanionGenerationPrompt({
      name: 'Alex',
      age: 28,
      gender,
      appearance_style: style,
      personality: 'confident and affectionate',
      appearance_hair: 'long',
      appearance_hair_color: 'black',
      appearance_eyes: 'green',
      appearance_body: 'athletic',
    }, {
      action: 'posing in an intimate bedroom with direct eye contact',
      adult: true,
      random: 0,
    });

    expect(result.category).toBe(category);
    expect(result.baseInfo).toContain('Alex');
    expect(result.action).toContain('intimate bedroom');
    expect(result.positive).toContain('high-resolution');
    expect(result.negative).toContain('child');
    expect(result.negative).toContain('underage');
  });
});
