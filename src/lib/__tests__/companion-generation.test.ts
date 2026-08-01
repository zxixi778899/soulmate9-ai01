import { describe, expect, it } from 'vitest';
import {
  buildCompanionAgeNegativePrompt,
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
  it('protects a young adult identity from premature aging artifacts', () => {
    const negative = buildCompanionAgeNegativePrompt({ age: 21 });
    expect(negative).toContain('middle-aged appearance');
    expect(negative).toContain('deep wrinkles');
    expect(negative).toContain('over-sharpened skin');
  });

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
    expect(result.positive).toContain('black long hair');
    expect(result.positive).toContain('green eyes');
    expect(result.positive).toContain('green eyes');
    expect(result.positive).toContain('athletic build');
    expect(result.action).toContain('intimate bedroom');
    if (style === 'realistic') {
      expect(result.positive).toContain('Natural candid photograph');
      expect(result.positive).toContain('neutral skin tone');
      expect(result.positive).toContain('supported spine');
      expect(result.positive.length).toBeLessThan(700);
    } else {
      expect(result.positive).toContain('high-resolution 2D anime frame');
    }
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

  it('uses structured identity once and ignores stale legacy image prompts', () => {
    const result = buildCompanionGenerationPrompt({
      id: 'dylan-live-data',
      name: 'Dylan',
      age: 21,
      gender: 'Male',
      appearance_race: 'Slavic',
      appearance_hair_color: 'Raven black',
      appearance_hair: 'Crew cut',
      appearance_eyes: 'Honey brown',
      appearance_body: 'Broad-shouldered',
      appearance_style: 'Casual masculine',
      image_prompt: '1boy, Dylan, 23 years old, sports bra and leggings',
    }, {
      action: 'a neutral full-body front view on a plain studio background',
      adult: false,
    });

    expect(result.positive).toContain('21-year-old man');
    expect(result.positive).toContain('Raven black Crew cut hair');
    expect(result.positive).toContain('a neutral full-body front view');
    expect(result.positive).not.toContain('23 years old');
    expect(result.positive).not.toContain('sports bra');
    expect(result.positive.match(/21-year-old/g)).toHaveLength(1);
    expect(result.positive.match(/Raven black/g)).toHaveLength(1);
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
    expect(result.positive).toContain('27-year-old woman');
    expect(result.positive).not.toContain('Explicit sexual content');
    expect(result.negative).toContain('different person');
  });
});

describe('companion scene realism', () => {
  const companion = {
    id: 'real-person-17',
    name: 'Elena',
    age: 29,
    gender: 'Female',
    appearance_race: 'Mediterranean',
    appearance_hair_color: 'dark brown',
    appearance_hair: 'wavy shoulder-length',
    appearance_eyes: 'hazel',
    appearance_body: 'athletic pear-shaped',
    personality: 'observant and playful',
  };

  it('adapts color, materials and physical interaction to the scene', () => {
    const water = buildCompanionGenerationPrompt(companion, {
      action: 'walking out of a swimming pool with wet hair',
      intensity: 2,
      adult: false,
    });
    const nightlife = buildCompanionGenerationPrompt(companion, {
      action: 'waiting outside a neon-lit city bar at night',
      intensity: 2,
      adult: false,
    });
    expect(water.positive).toContain('irregular droplets');
    expect(water.positive).toContain('damp fabric');
    expect(nightlife.positive).toContain('colored city lights confined to the background');
    expect(nightlife.positive).toContain('neutral light on skin');
  });

  it('uses materially different body language for levels 1 through 5', () => {
    const prompts = ([1, 2, 3, 4, 5] as const).map((intensity) =>
      buildCompanionGenerationPrompt(companion, {
        action: 'sitting on a lived-in sofa beside a window',
        intensity,
        adult: intensity >= 3,
      }).positive,
    );
    expect(new Set(prompts).size).toBe(5);
    expect(prompts[0]).toContain('unguarded pause');
    expect(prompts[1]).toContain('quiet flirtation');
    expect(prompts[2]).toContain('supported spine');
    expect(prompts[3]).toContain('clear preparation');
    expect(prompts[4]).toContain('stable centers of gravity');
  });

  it('keeps identity-reference prompts scene-only while retaining lived-in realism', () => {
    const result = buildCompanionGenerationPrompt(companion, {
      action: 'taking a casual bathroom mirror selfie with a phone',
      intensity: 1,
      adult: false,
      sceneOnly: true,
    });
    expect(result.positive).not.toContain('Identity specification for Elena');
    expect(result.positive).toContain('correct reflection geometry');
    expect(result.positive).toContain('casual camera angle');
    expect(result.negative).toContain('different person');
    expect(result.negative).toContain('rigid pose');
  });
});