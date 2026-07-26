import { describe, expect, it } from 'vitest';
import {
  CHARACTER_ID_PACK,
  CHARACTER_PRODUCTION_PRESETS,
  getCharacterProductionPreset,
  normalizeCharacterAssetRole,
  styleProductionHint,
} from './character-asset-production';

describe('character asset production', () => {
  it('defines a complete identity pack ending in character art', () => {
    expect(CHARACTER_ID_PACK).toEqual([
      'identity-front',
      'identity-profile',
      'identity-half',
      'identity-full',
      'character-art',
    ]);
    expect(CHARACTER_ID_PACK.every((role) =>
      CHARACTER_PRODUCTION_PRESETS.some((preset) => preset.role === role),
    )).toBe(true);
  });

  it('uses identity consistency after the initial front reference', () => {
    expect(getCharacterProductionPreset('identity-front').consistency).toBe(false);
    expect(getCharacterProductionPreset('identity-profile').consistency).toBe(true);
    expect(getCharacterProductionPreset('character-art').consistency).toBe(true);
  });

  it('keeps render styles mutually exclusive', () => {
    expect(styleProductionHint('realistic')).toContain('real camera photograph');
    expect(styleProductionHint('2d')).toContain('only as coherent 2D');
    expect(styleProductionHint('3d')).toContain('only as coherent 3D');
  });

  it('normalizes unknown asset roles to scene', () => {
    expect(normalizeCharacterAssetRole('identity-full')).toBe('identity-full');
    expect(normalizeCharacterAssetRole('unknown')).toBe('scene');
  });
});
