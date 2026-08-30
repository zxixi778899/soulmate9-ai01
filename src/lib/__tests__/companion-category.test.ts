import { describe, expect, it } from 'vitest';
import { companionDisplayCategory, normalizeCompanionCategory, normalizeCompanionRenderStyle, STUDIO_PROMPTS } from '../companion-category';

describe('companion categories', () => {
  it('never lets render style override gender', () => {
    expect(normalizeCompanionCategory({ gender: 'Male', style: 'anime', tags: ['female', '2d'] })).toBe('male');
    expect(normalizeCompanionCategory({ gender: 'Transgender', style: 'realistic', tags: ['male'] })).toBe('transgender');
  });

  it('normalizes render style independently with strict values', () => {
    expect(normalizeCompanionRenderStyle({ appearanceStyle: 'anime' })).toBe('2d');
    expect(normalizeCompanionRenderStyle({ animeRenderStyle: '3D' })).toBe('realistic');
    expect(normalizeCompanionRenderStyle({ appearanceStyle: 'latex maid outfit' })).toBe('realistic');
    expect(normalizeCompanionRenderStyle({ renderStyle: 'realistic', appearanceStyle: 'anime' })).toBe('realistic');
  });

  it('falls back to tag-based anime detection when no explicit style is set', () => {
    expect(normalizeCompanionRenderStyle({ tags: ['anime', 'female'] })).toBe('2d');
    expect(normalizeCompanionRenderStyle({ tags: ['2d'] })).toBe('2d');
    expect(normalizeCompanionRenderStyle({ tags: ['manga'] })).toBe('2d');
    expect(normalizeCompanionRenderStyle({ tags: ['realistic', 'photoreal'] })).toBe('realistic');
    expect(normalizeCompanionRenderStyle({ tags: ['female'] })).toBe('realistic');
    // Explicit style wins over tags
    expect(normalizeCompanionRenderStyle({ renderStyle: 'realistic', tags: ['anime'] })).toBe('realistic');
    expect(normalizeCompanionRenderStyle({ animeRenderStyle: '3d', tags: ['anime'] })).toBe('realistic');
  });

  it('detects transgender and male rows', () => {
    expect(normalizeCompanionCategory({ gender: 'Transgender' })).toBe('transgender');
    expect(normalizeCompanionCategory({ gender: 'Male' })).toBe('male');
  });

  it('groups 2D companions under the anime tab for display only', () => {
    expect(companionDisplayCategory({ gender: 'Female', style: 'anime' })).toBe('anime');
    expect(companionDisplayCategory({ gender: 'Male', tags: ['2d'] })).toBe('anime');
    expect(companionDisplayCategory({ gender: 'Male', style: 'realistic' })).toBe('male');
    expect(companionDisplayCategory({ gender: 'Transgender', style: 'photorealistic' })).toBe('transgender');
  });

  it('keeps every studio preset adult-only', () => {
    for (const preset of Object.values(STUDIO_PROMPTS)) {
      expect(preset.prompt).toMatch(/adult/i);
      expect(preset.negative).toMatch(/underage|child/i);
    }
  });
});
