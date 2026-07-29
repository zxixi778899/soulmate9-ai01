import { describe, expect, it } from 'vitest';
import {
  CHARACTER_ID_PACK,
  CHARACTER_PRODUCTION_PRESETS,
  getCharacterProductionPreset,
  identityReferenceRolePriority,
  identityTurnaroundDenoise,
  normalizeCharacterAssetRole,
  styleProductionHint,
} from './character-asset-production';

describe('character asset production', () => {
  it('defines the avatar and three-view identity pack', () => {
    expect(CHARACTER_ID_PACK).toEqual([
      'avatar-closeup',
      'identity-front',
      'identity-profile',
      'identity-back',
    ]);
    expect(CHARACTER_ID_PACK.every((role) =>
      CHARACTER_PRODUCTION_PRESETS.some((preset) => preset.role === role),
    )).toBe(true);
    const avatar = getCharacterProductionPreset('avatar-closeup');
    expect(avatar.scene).toContain('waist-up portrait');
    expect(avatar.scene).not.toContain('close-up');
    expect(avatar.scene).not.toContain('headshot');
  });

  it('uses identity consistency after the initial front reference', () => {
    expect(getCharacterProductionPreset('avatar-closeup').consistency).toBe(false);
    expect(getCharacterProductionPreset('identity-front').consistency).toBe(true);
    expect(getCharacterProductionPreset('identity-profile').consistency).toBe(true);
    expect(getCharacterProductionPreset('identity-back').consistency).toBe(true);
    expect(getCharacterProductionPreset('character-art').consistency).toBe(true);
  });

  it('chains turnaround references and allows enough composition change', () => {
    expect(identityReferenceRolePriority('identity-front')).toEqual(['avatar-closeup']);
    expect(identityReferenceRolePriority('identity-profile')).toEqual(['identity-front', 'avatar-closeup']);
    expect(identityReferenceRolePriority('identity-back')).toEqual(['identity-profile', 'identity-front', 'avatar-closeup']);
    expect(identityReferenceRolePriority('character-art')).toEqual(['identity-front', 'identity-profile', 'identity-back']);
    expect(identityTurnaroundDenoise('identity-front', 0.35)).toBe(0.72);
    expect(identityTurnaroundDenoise('identity-profile', 0.35)).toBe(0.68);
    expect(identityTurnaroundDenoise('identity-back', 0.35)).toBe(0.76);
    expect(identityTurnaroundDenoise('character-art', 0.35)).toBe(0.58);
    expect(identityTurnaroundDenoise('album', 0.35)).toBe(0.62);
    expect(getCharacterProductionPreset('identity-front').scene).toContain('Full-body front-facing catalog photograph');
    expect(getCharacterProductionPreset('identity-profile').scene).toContain('side-profile catalog photograph');
    expect(getCharacterProductionPreset('identity-profile').scene).toContain('left side facing camera');
    expect(getCharacterProductionPreset('identity-back').scene).toContain('rear-view catalog photograph');
    expect(getCharacterProductionPreset('identity-back').scene).toContain('back facing camera');
  });
  it('keeps render styles mutually exclusive', () => {
    expect(styleProductionHint('realistic')).toContain('real camera photograph');
    expect(styleProductionHint('2d')).toContain('only as coherent 2D');
    expect(styleProductionHint('3d')).toContain('only as coherent 3D');
  });

  it('normalizes unknown asset roles to scene', () => {
    expect(normalizeCharacterAssetRole('identity-full')).toBe('identity-full');
    expect(normalizeCharacterAssetRole('album')).toBe('album');
    expect(normalizeCharacterAssetRole('unknown')).toBe('scene');
  });
});
