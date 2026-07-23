import { describe, expect, it } from 'vitest';
import { normalizeCompanionCategory, STUDIO_PROMPTS } from '../companion-category';

describe('companion categories', () => {
  it('prefers anime style over gender', () => {
    expect(normalizeCompanionCategory({ gender: 'Male', style: 'anime' })).toBe('anime');
  });

  it('detects transgender and male rows', () => {
    expect(normalizeCompanionCategory({ gender: 'Transgender' })).toBe('transgender');
    expect(normalizeCompanionCategory({ gender: 'Male' })).toBe('male');
  });

  it('keeps every studio preset adult-only', () => {
    for (const preset of Object.values(STUDIO_PROMPTS)) {
      expect(preset.prompt).toMatch(/adult/i);
      expect(preset.negative).toMatch(/underage|child/i);
    }
  });
});
