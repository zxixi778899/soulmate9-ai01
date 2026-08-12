import { describe, expect, it } from 'vitest';
import { getFluxPromptPresets, randomFluxPrompt } from '@/lib/comfy-console/flux-prompt-presets';

describe('FLUX short prompt presets', () => {
  it.each(['female', 'male', 'transgender', 'anime'] as const)('provides 30 prompts for %s at every NSFW level', (category) => {
    for (const intensity of [1, 2, 3, 4, 5] as const) {
      const prompts = getFluxPromptPresets({ category, style: 'realistic', intensity });
      expect(prompts).toHaveLength(30);
      expect(new Set(prompts.map((item) => item.id)).size).toBe(30);
      expect(prompts.every((item) => item.prompt.length < 300)).toBe(true);
    }
  });
  it('includes the selected framing as an explicit camera clause', () => {
    const prompt = randomFluxPrompt({ category: 'female', style: 'realistic', intensity: 1, framing: 'full-body shot from head to toe', random: () => 0 });
    expect(prompt.startsWith('Camera framing: full-body shot from head to toe.')).toBe(true);
    expect(prompt).toContain('adult woman');
  });
});
