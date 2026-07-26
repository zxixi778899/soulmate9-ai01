import { describe, expect, it } from 'vitest';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle, STUDIO_PROMPTS } from '../companion-category';

describe('companion categories', () => {
  it('never lets render style override gender', () => {
    expect(normalizeCompanionCategory({ gender: 'Male', style: 'anime', tags: ['female', '2d'] })).toBe('male');
    expect(normalizeCompanionCategory({ gender: 'Transgender', style: 'realistic', tags: ['male'] })).toBe('transgender');
  });

  it('normalizes render style independently with strict values', () => {
    expect(normalizeCompanionRenderStyle({ appearanceStyle: 'anime' })).toBe('2d');
    expect(normalizeCompanionRenderStyle({ animeRenderStyle: '3D' })).toBe('3d');
    expect(normalizeCompanionRenderStyle({ appearanceStyle: 'latex maid outfit' })).toBe('realistic');
    expect(normalizeCompanionRenderStyle({ renderStyle: 'realistic', appearanceStyle: 'anime' })).toBe('realistic');
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
