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

  it('upgrades to NSFW only when intimacy unlocks AND the turn asks for it', () => {
    const policy = getIntimacyGenerationPolicy(500); // intimacy level 3
    const nsfw = resolveImagePromptChannel({
      intimacyPolicy: policy,
      userRequest: 'send me a nude photo',
    });
    expect(nsfw.channel).toBe('nsfw');

    const sfw = resolveImagePromptChannel({
      intimacyPolicy: policy,
      userRequest: 'send me a beach photo',
    });
    expect(sfw.channel).toBe('sfw');
    expect(sfw.nsfwIntensity).toBeLessThanOrEqual(2);
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
