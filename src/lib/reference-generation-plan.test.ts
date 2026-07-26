import { describe, expect, it } from 'vitest';
import {
  buildReferenceGenerationPlan,
  type ReferenceAsset,
} from './reference-generation-plan';

const assets: ReferenceAsset[] = [
  {
    id: 'same-character',
    url: 'https://example.com/same.webp',
    role: 'identity',
    companionId: 'companion-1',
    category: 'transgender',
    renderStyle: 'realistic',
    modelFamily: 'pony',
  },
  {
    id: 'other-character',
    url: 'https://example.com/other.webp',
    role: 'identity',
    companionId: 'companion-2',
    category: 'transgender',
    renderStyle: 'realistic',
    modelFamily: 'pony',
  },
  {
    id: 'matching-pose',
    url: 'https://example.com/pose.webp',
    role: 'pose',
    category: 'transgender',
    renderStyle: 'realistic',
    modelFamily: 'pony',
    promptHint: 'relaxed seated posture',
  },
  {
    id: 'wrong-style',
    url: 'https://example.com/anime.webp',
    role: 'style',
    category: 'transgender',
    renderStyle: '2d',
    modelFamily: 'illustrious',
  },
  {
    id: 'wrong-category',
    url: 'https://example.com/male.webp',
    role: 'composition',
    category: 'male',
    renderStyle: 'realistic',
    modelFamily: 'pony',
  },
];

describe('buildReferenceGenerationPlan', () => {
  it('keeps identity references scoped to the current companion', () => {
    const plan = buildReferenceGenerationPlan({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      modelFamily: 'pony',
      companionId: 'companion-1',
      nsfwLevel: 3,
      assets,
    });

    expect(plan.primaryIdentity?.id).toBe('same-character');
    expect(plan.selected.map((asset) => asset.id)).not.toContain('other-character');
    expect(plan.trace.excludedCrossCharacterIdentity).toBe(1);
  });

  it('strictly isolates category, render style and model family', () => {
    const plan = buildReferenceGenerationPlan({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      modelFamily: 'pony',
      companionId: 'companion-1',
      nsfwLevel: 3,
      assets,
    });

    expect(plan.selected.map((asset) => asset.id)).toEqual([
      'same-character',
      'matching-pose',
    ]);
    expect(plan.promptHints).toEqual(['relaxed seated posture']);
  });

  it('does not borrow a public identity for a new character', () => {
    const plan = buildReferenceGenerationPlan({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      modelFamily: 'pony',
      nsfwLevel: 1,
      allowIdentity: false,
      assets,
    });

    expect(plan.primaryIdentity).toBeNull();
    expect(plan.selected.every((asset) => asset.role !== 'identity')).toBe(true);
  });
});
