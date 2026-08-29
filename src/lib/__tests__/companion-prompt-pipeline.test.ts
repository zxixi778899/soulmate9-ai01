import { describe, expect, it } from 'vitest';
import { buildIdReferencePrompt } from '@/lib/companion-prompt-pipeline';

/**
 * These tests pin the portrait-prompt contracts the rest of the system
 * depends on. If `buildIdReferencePrompt` ever changes the bust-up cue
 * wording, callers like /api/creator/generate-prompt and
 * /api/girlfriends/generate-portrait lose their anchor — fail fast.
 */
describe('buildIdReferencePrompt', () => {
  it('close-up anchors on face only, no upper body', () => {
    const text = buildIdReferencePrompt('close-up');
    expect(text).toMatch(/close-up/i);
    expect(text).toMatch(/face/i);
    expect(text).not.toMatch(/waist-up/i);
    expect(text).not.toMatch(/bust-up/i);
  });

  it('waist-up anchors on face + upper body, no chest-up', () => {
    const text = buildIdReferencePrompt('waist-up');
    expect(text).toMatch(/waist-up/i);
    expect(text).not.toMatch(/bust-up/i);
  });

  it('bust-up anchors on chest-up framing with explicit composition ratios', () => {
    const text = buildIdReferencePrompt('bust-up');
    // v2 wording — composition ratios replace the v1 short cue
    expect(text).toMatch(/chest-up/i);
    expect(text).toMatch(/collarbone|shoulder|neck/i);
    // explicit composition guidance prevents FLUX from collapsing to headshot
    expect(text).toMatch(/top third of frame/i);
    expect(text).toMatch(/middle third/i);
    expect(text).toMatch(/waist area cut off/i);
    // explicit anti-close-up language so FLUX doesn't drift back into a face crop
    expect(text).toMatch(/no headshot/i);
    expect(text).toMatch(/no extreme close-up/i);
    expect(text).toMatch(/no face-only crop/i);
    // bust-up is not waist-up
    expect(text).not.toMatch(/waist-up/i);
  });
});