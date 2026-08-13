import { describe, expect, it } from 'vitest';
import { stripActionBeats } from '../chat-reply-sanitize';
import {
  buildIdentitySheet,
  resolveImagePromptChannel,
  sanitizeLlmPrompt,
} from '../image-prompt-llm';
import { getIntimacyGenerationPolicy } from '../intimacy-policy';
import { normalizeCompanionCategory } from '../companion-category';

describe('stripActionBeats (dialogue mode)', () => {
  it('removes asterisk action beats while keeping the spoken words', () => {
    expect(stripActionBeats('*smiles* Mmm, come here baby.')).toBe('Mmm, come here baby.');
    expect(stripActionBeats('I missed you *brushes hair behind ear* so much.')).toBe(
      'I missed you so much.',
    );
  });

  it('keeps pure dialogue intact', () => {
    expect(
      stripActionBeats('"Mmm… your voice is rough today. Missed me?"'),
    ).toBe('"Mmm… your voice is rough today. Missed me?"');
  });
});

describe('resolveImagePromptChannel', () => {
  it('keeps SFW when intimacy is low', () => {
    const policy = getIntimacyGenerationPolicy(50);
    const r = resolveImagePromptChannel({ intimacyPolicy: policy, userRequest: 'send me a photo' });
    expect(r.channel).toBe('sfw');
  });

  it('maps intimacy level directly to NSFW intensity', () => {
    const low = getIntimacyGenerationPolicy(50); // intimacy level 1
    expect(resolveImagePromptChannel({ intimacyPolicy: low, userRequest: 'send me a photo' }).channel).toBe('sfw');

    const unlocked = getIntimacyGenerationPolicy(500); // intimacy level 3
    expect(resolveImagePromptChannel({ intimacyPolicy: unlocked, userRequest: 'send me a beach photo' }).channel).toBe('nsfw');
    expect(resolveImagePromptChannel({ intimacyPolicy: unlocked, userRequest: 'send me a beach photo' }).nsfwIntensity).toBe(3);

    const max = getIntimacyGenerationPolicy(1200); // intimacy level 5
    expect(resolveImagePromptChannel({ intimacyPolicy: max, userRequest: 'send me a photo' }).channel).toBe('nsfw');
    expect(resolveImagePromptChannel({ intimacyPolicy: max, userRequest: 'send me a photo' }).nsfwIntensity).toBe(5);
  });
});

describe('sanitizeLlmPrompt', () => {
  it('strips fences and leading labels', () => {
    const out = sanitizeLlmPrompt('```\nHere is your prompt: A cozy beach scene, golden light\n```');
    expect(out).toBe('A cozy beach scene, golden light');
  });
});

describe('buildIdentitySheet', () => {
  it('collects identity fields for character consistency', () => {
    const gf = {
      name: 'Luna',
      age: 22,
      appearance_hair: 'long silver hair',
      appearance_eyes: 'blue eyes',
      appearance_body: 'slim',
    };
    const category = normalizeCompanionCategory({ gender: 'female', style: '', tags: [] });
    const sheet = buildIdentitySheet(gf, category, 'realistic');
    expect(sheet).toContain('Name: Luna');
    expect(sheet).toContain('Hair: long silver hair');
    expect(sheet).toContain('Eyes: blue eyes');
  });
});
