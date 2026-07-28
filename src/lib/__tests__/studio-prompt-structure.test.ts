import { describe, expect, it } from 'vitest';
import {
  buildStudioPromptSections,
  type NsfwIntensity,
} from '@/lib/comfy-console/studio-profile';
import type { CompanionCategory } from '@/lib/companion-category';

describe('studio prompt structure', () => {
  const categories: CompanionCategory[] = ['female', 'male', 'transgender'];
  const intensities: NsfwIntensity[] = [1, 2, 3, 4, 5];

  it.each(categories.flatMap((category) =>
    intensities.map((intensity) => [category, intensity] as const),
  ))('builds complete sections for %s intensity %s', (category, intensity) => {
    const sections = buildStudioPromptSections({
      category,
      intensity,
      animeStyle: 'realistic',
      identity: 'black hair, green eyes, small cheek mole',
      scene: 'a private modern bedroom with warm side light',
    });
    expect(sections.identity).toContain('consenting adult');
    expect(sections.identity).toContain('black hair');
    expect(sections.scene).toContain('private modern bedroom');
    expect(sections.exposureAndAction.length).toBeGreaterThan(40);
    expect(sections.composition.length).toBeGreaterThan(40);
    expect(sections.quality).toContain('real camera');
  });

  it('reserves level five for consensual adult intercourse', () => {
    for (const category of categories) {
      const sections = buildStudioPromptSections({
        category,
        intensity: 5,
      });
      expect(sections.exposureAndAction).toContain('consensual intercourse');
      expect(sections.exposureAndAction).toContain('adult partner');
    }
  });

  it('keeps levels one through three free from intercourse instructions', () => {
    for (const category of categories) {
      for (const intensity of [1, 2, 3] as const) {
        expect(buildStudioPromptSections({ category, intensity }).exposureAndAction)
          .not.toContain('intercourse');
      }
    }
  });
});
