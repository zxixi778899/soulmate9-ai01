import { describe, expect, it } from 'vitest';
import {
  buildCompanionGenerationPrompt,
  buildCompanionIdentitySpecification,
} from '@/lib/companion-generation';
import { resolveCompanionProfile } from '@/lib/companion-profile';

describe('companion profiles', () => {
  it.each([
    ['Female', 'realistic', 'female', 'she', 'girlfriend'],
    ['Male', 'realistic', 'male', 'he', 'boyfriend'],
    ['Transgender', 'realistic', 'transgender', 'they', 'partner'],
    ['Female', 'anime', 'female', 'she', 'girlfriend'],
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
    ['Female', 'anime', 'female'],
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
    expect(result.baseInfo).toContain('28');
    expect(result.identitySpecification).toContain('28-year-old');
    expect(result.positive).toContain('black hair color');
    expect(result.positive).toContain('long hairstyle');
    expect(result.positive).toContain('green eyes');
    expect(result.positive).toContain('athletic body build');
    expect(result.action).toContain('intimate bedroom');
    expect(result.positive).toContain('Render this as');
    expect(result.negative).toContain('child');
    expect(result.negative).toContain('underage');
  });

  it('uses every saved appearance field and stable distinctive facial cues', () => {
    const row = {
      id: 'companion-unique-42',
      name: 'Maya',
      age: 31,
      gender: 'Transgender',
      appearance_hair_color: 'auburn',
      appearance_hair: 'shoulder-length wavy bob',
      appearance_eyes: 'amber',
      appearance_body: 'tall pear-shaped',
      appearance_race: 'Brazilian',
      personality: 'elegant, commanding and warm',
      appearance_style: 'luxury minimalist',
      appearance_face: 'slightly asymmetric smile',
      distinguishing_features: 'fine scar through the left eyebrow',
    };
    const first = buildCompanionIdentitySpecification(row);
    const second = buildCompanionIdentitySpecification(row);

    expect(first).toBe(second);
    expect(first).toContain('31-year-old adult transgender woman');
    expect(first).toContain('Brazilian ethnicity');
    expect(first).toContain('auburn hair color');
    expect(first).toContain('shoulder-length wavy bob hairstyle');
    expect(first).toContain('amber eyes');
    expect(first).toContain('tall pear-shaped body');
    expect(first).toContain('elegant, commanding and warm temperament');
    expect(first).toContain('luxury minimalist visual');
    expect(first).toContain('slightly asymmetric smile');
    expect(first).toContain('fine scar through the left eyebrow');
    expect(first).toContain('do not replace them with a generic beauty face');
  });

  it('keeps identity-pack prompts non-explicit when adult mode is disabled', () => {
    const result = buildCompanionGenerationPrompt({
      id: 'identity-safe',
      name: 'Nora',
      age: 27,
      gender: 'Female',
      appearance_hair_color: 'silver',
      appearance_hair: 'long braided',
      appearance_eyes: 'blue',
      appearance_body: 'petite athletic',
      appearance_race: 'Nordic',
      personality: 'calm ethereal',
      appearance_style: 'modern fantasy',
    }, {
      action: 'neutral front-facing identity portrait',
      adult: false,
    });
    expect(result.positive).toContain('27-year-old adult woman');
    expect(result.positive).not.toContain('Explicit sexual content');
    expect(result.negative).toContain('generic face');
  });
});
