import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CREATOR_PRESETS,
  buildCompanionCharacterCard,
  normalizeCreatorPreset,
} from '@/lib/creator-presets';

describe('creator presets', () => {
  it('ships complete adult quick-start presets', () => {
    expect(DEFAULT_CREATOR_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(DEFAULT_CREATOR_PRESETS.map((preset) => preset.id)).size)
      .toBe(DEFAULT_CREATOR_PRESETS.length);
    for (const preset of DEFAULT_CREATOR_PRESETS) {
      expect(preset.personality_tags.length).toBeGreaterThanOrEqual(3);
      expect(preset.backstory.length).toBeGreaterThan(30);
      expect(preset.short_description.length).toBeGreaterThan(20);
    }
  });

  it('normalizes database rows without trusting malformed values', () => {
    expect(normalizeCreatorPreset({ id: 'x', name: 'Test', gender: 'unknown' })).toMatchObject({
      id: 'x',
      gender: 'Female',
      visual_style: 'realistic',
    });
    expect(normalizeCreatorPreset({ name: 'Missing id' })).toBeNull();
  });

  it('builds a focused role prompt with continuity and safety boundaries', () => {
    const card = buildCompanionCharacterCard({
      name: 'Luna',
      age: 25,
      gender: 'Female',
      relationship: 'girlfriend',
      personality: 'warm, witty, loyal',
      backstory: 'She met the user at a quiet record store.',
      occupation: 'Designer',
      hobbies: ['music', 'travel'],
      voice: 'soft',
    });
    expect(card.system_prompt).toContain('never describe yourself as an AI');
    expect(card.system_prompt).toContain('emotional continuity');
    expect(card.system_prompt).toContain('consenting adults');
    expect(card.first_mes).not.toContain('How can I help');
  });
});
