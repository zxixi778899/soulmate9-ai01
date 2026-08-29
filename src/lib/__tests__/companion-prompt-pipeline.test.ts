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

  it('bust-up anchors on neck/shoulders/collarbone (chest-up framing)', () => {
    const text = buildIdReferencePrompt('bust-up');
    expect(text).toMatch(/bust-up/i);
    expect(text).toMatch(/chest-up/i);
    // bust-up explicitly shows neck/shoulder/collarbone — the character
    // signal that the bust-up framing was chosen for.
    expect(text).toMatch(/collarbone|shoulder|neck/i);
    // bust-up is not waist-up
    expect(text).not.toMatch(/waist-up/i);
  });
});