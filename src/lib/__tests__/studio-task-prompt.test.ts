import { describe, expect, it } from 'vitest';
import { buildStudioSceneDraft, buildStudioTaskPrompt } from '@/lib/comfy-console/studio-task-prompt';

describe('buildStudioTaskPrompt', () => {
  it('includes companion identity only for the canonical identity task', () => {
    const companion = { name: 'Elena', appearance_hair_color: 'silver hair', appearance_eyes: 'brown eyes' };
    const identity = buildStudioTaskPrompt({ task: 'identity', modelFamily: 'flux', companion, scene: '', category: 'female', renderStyle: 'realistic' });
    const portrait = buildStudioTaskPrompt({ task: 'portrait', modelFamily: 'flux', companion, scene: 'walking in a hotel lobby', category: 'female', renderStyle: 'realistic', hasIdentityReference: true });
    expect(identity).toContain('Elena');
    expect(identity).toContain('silver hair');
    expect(portrait).not.toContain('silver hair');
    expect(portrait).toContain('ID reference');
  });

  it('uses model-family-specific quality language', () => {
    const flux = buildStudioTaskPrompt({ task: 'portrait', modelFamily: 'flux', scene: 'standing by a window', category: 'female', renderStyle: 'realistic' });
    const pony = buildStudioTaskPrompt({ task: 'portrait', modelFamily: 'pony', scene: 'standing by a window', category: 'female', renderStyle: 'realistic' });
    expect(flux).toContain('real-camera photograph');
    expect(flux).not.toContain('score_9');
    expect(pony).toContain('score_9');
    expect(pony).not.toContain('real-camera photograph');
    expect(flux).toContain('face and full body clearly illuminated');
    expect(pony).toContain('no crushed shadows');
  });

  it('keeps strong framing and camera angle requirements in the final prompt', () => {
    const result = buildStudioTaskPrompt({
      task: 'portrait',
      modelFamily: 'flux',
      scene: 'standing in a studio',
      framing: 'CAMERA COMPOSITION REQUIREMENT: full-body shot from head to feet, LOW-ANGLE CAMERA REQUIREMENT: camera placed below eye level',
      category: 'female',
      renderStyle: 'realistic',
      hasIdentityReference: true,
    });
    expect(result).toContain('full-body shot from head to feet');
    expect(result).toContain('LOW-ANGLE CAMERA REQUIREMENT');
  });

  it('creates an NSFW-level and model-aware portrait scene when the prompt is empty', () => {
    const result = buildStudioSceneDraft({
      task: 'portrait',
      modelFamily: 'pony',
      currentPrompt: '',
      intensity: 4,
      renderStyle: 'realistic',
    });
    expect(result).toContain('complete editorial character portrait');
    expect(result).toContain('explicit solo scene');
    expect(result).toContain('Pony-readable');
    expect(result).toContain('no crushed shadows');
  });

  it('preserves an existing scene while adding the selected level contract', () => {
    const result = buildStudioSceneDraft({
      task: 'portrait',
      modelFamily: 'flux',
      currentPrompt: 'standing beside a bright hotel window',
      intensity: 2,
      renderStyle: 'realistic',
    });
    expect(result).toContain('standing beside a bright hotel window');
    expect(result).toContain('adult lingerie');
    expect(result).toContain('FLUX-ready');
  });
});
