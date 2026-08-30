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
  it('defines the avatar as the single identity anchor pack', () => {
    expect(CHARACTER_ID_PACK).toEqual(['avatar-closeup']);
    expect(CHARACTER_ID_PACK.every((role) =>
      CHARACTER_PRODUCTION_PRESETS.some((preset) => preset.role === role),
    )).toBe(true);
    const avatar = getCharacterProductionPreset('avatar-closeup');
    expect(avatar.scene).toContain('waist-up studio portrait');
    expect(avatar.scene).toContain('upper torso fully in frame');
    expect(avatar.scene).not.toContain('headshot');
    expect(avatar.width).toBe(832);
    expect(avatar.height).toBe(1216);
  });

  it('uses identity consistency after the initial avatar reference', () => {
    expect(getCharacterProductionPreset('avatar-closeup').consistency).toBe(false);
    expect(getCharacterProductionPreset('identity-front').consistency).toBe(true);
    expect(getCharacterProductionPreset('identity-profile').consistency).toBe(true);
    expect(getCharacterProductionPreset('identity-back').consistency).toBe(true);
    expect(getCharacterProductionPreset('character-art').consistency).toBe(true);
  });

  it('anchors every downstream asset to the identity anchor', () => {
    // Final products and legacy sheets all resolve the identity-anchor first
    // (best-of-4 avatar selection), with avatar-closeup as the fallback.
    expect(identityReferenceRolePriority('character-art')[0]).toBe('identity-anchor');
    expect(identityReferenceRolePriority('album')[0]).toBe('identity-anchor');
    expect(identityReferenceRolePriority('scene')[0]).toBe('identity-anchor');
    expect(identityReferenceRolePriority('identity-turnaround')[0]).toBe('identity-anchor');
    // Legacy identity sheets chain through the identity-anchor for existing DB assets.
    expect(identityReferenceRolePriority('identity-front')).toEqual(['identity-anchor', 'avatar-closeup']);
    expect(identityReferenceRolePriority('identity-profile')).toEqual(['identity-anchor', 'identity-front', 'avatar-closeup']);
    expect(identityReferenceRolePriority('identity-back')).toEqual(['identity-anchor', 'identity-profile', 'identity-front', 'avatar-closeup']);
  });

  it('allows enough composition change for final products', () => {
    expect(identityTurnaroundDenoise('identity-turnaround', 0.35)).toBe(0.72);
    expect(identityTurnaroundDenoise('identity-front', 0.35)).toBe(0.72);
    expect(identityTurnaroundDenoise('identity-profile', 0.35)).toBe(0.68);
    expect(identityTurnaroundDenoise('identity-back', 0.35)).toBe(0.76);
    expect(identityTurnaroundDenoise('character-art', 0.35)).toBe(0.9);
    expect(identityTurnaroundDenoise('album', 0.35)).toBe(0.88);
    expect(getCharacterProductionPreset('identity-front').scene).toContain('Full-body front-facing catalog photograph');
    expect(getCharacterProductionPreset('identity-profile').scene).toContain('side-profile catalog photograph');
    expect(getCharacterProductionPreset('identity-profile').scene).toContain('left side facing camera');
    expect(getCharacterProductionPreset('identity-back').scene).toContain('rear-view catalog photograph');
    expect(getCharacterProductionPreset('identity-back').scene).toContain('back facing camera');
  });

  it('keeps render styles mutually exclusive', () => {
    expect(styleProductionHint('realistic')).toContain('real camera photograph');
    expect(styleProductionHint('realistic')).toContain('neutral white balance');
    expect(styleProductionHint('realistic')).toContain('relaxed asymmetrical posture');
    expect(styleProductionHint('2d')).toContain('only as coherent 2D');
  });

  it('normalizes unknown asset roles to scene', () => {
    expect(normalizeCharacterAssetRole('identity-full')).toBe('identity-full');
    expect(normalizeCharacterAssetRole('album')).toBe('album');
    expect(normalizeCharacterAssetRole('unknown')).toBe('scene');
  });
});
