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

  it('uses FLUX-style quality language consistently', () => {
    // Spec: 全站统一 FLUX，不再区分 Pony/Illustrious
    const flux = buildStudioTaskPrompt({ task: 'portrait', modelFamily: 'flux', scene: 'standing by a window', category: 'female', renderStyle: 'realistic' });
    expect(flux).toContain('real-camera photograph');
    expect(flux).not.toContain('score_9');
    expect(flux).toContain('face and full body clearly illuminated');
    expect(flux).toContain('no crushed shadows');
  });

  it('keeps the user scene as the single source of truth on the FLUX path', () => {
    // 实现约定：用户 scene 是唯一指令来源，不再注入硬编码构图/机位模板；
    // FLUX 路径仅附加质量词与 ID 参考说明。
    const result = buildStudioTaskPrompt({
      task: 'portrait',
      modelFamily: 'flux',
      scene: 'standing in a studio',
      framing: 'CAMERA COMPOSITION REQUIREMENT: full-body shot from head to feet',
      category: 'female',
      renderStyle: 'realistic',
      hasIdentityReference: true,
    });
    expect(result).toContain('standing in a studio');
    expect(result).toContain('use the ID reference for identity only');
  });

  it('passes framing through tagified on the SDXL pony path', () => {
    // SDXL 族：framing 经 tagify 进入族原生 tag 协议，质量 tag 前缀自动追加
    const result = buildStudioTaskPrompt({
      task: 'portrait',
      modelFamily: 'pony',
      scene: 'standing in a studio',
      framing: 'full-body shot',
      category: 'female',
      renderStyle: 'realistic',
      hasIdentityReference: true,
    });
    expect(result).toContain('score_9');
    expect(result).toContain('full-body_shot');
    expect(result).toContain('standing in a studio');
  });

  it('drafts a random FLUX scene only when the prompt is empty', () => {
    // 实现约定：仅在用户无输入时提供随机草稿，内容来自 flux-prompt-presets（随机）
    const result = buildStudioSceneDraft({
      task: 'portrait',
      modelFamily: 'flux',
      currentPrompt: '',
      intensity: 4,
      renderStyle: 'realistic',
    });
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it('returns the existing scene unchanged without injecting templates', () => {
    // 实现约定：用户输入是绝对真相源，不再叠加级别契约模板句
    const result = buildStudioSceneDraft({
      task: 'portrait',
      modelFamily: 'flux',
      currentPrompt: 'standing beside a bright hotel window',
      intensity: 2,
      renderStyle: 'realistic',
    });
    expect(result).toBe('standing beside a bright hotel window');
  });
});
