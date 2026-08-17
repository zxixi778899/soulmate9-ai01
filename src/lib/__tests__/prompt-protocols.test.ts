import { describe, expect, it } from 'vitest';
import {
  describeFamilyBasicPreset,
  encodeFamilyPrompt,
  familyNegativePrompt,
  familyQualityEnhancers,
  PROMPT_PROTOCOL_BY_FAMILY,
  resolveFamilySubjectPreset,
  resolvePromptSubject,
} from '@/lib/prompt/prompt-protocols';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { resolveModelPlan } from '@/lib/model-matrix';
import { buildStudioTaskPrompt } from '@/lib/comfy-console/studio-task-prompt';

// ─── 题材维度解析 ────────────────────────────────────────────

describe('resolvePromptSubject', () => {
  it('渲染风格优先于类别', () => {
    expect(resolvePromptSubject('female', '2d')).toBe('2d');
    expect(resolvePromptSubject('male', '3d')).toBe('3d');
  });
  it('写实风格按类别分化女/男/跨', () => {
    expect(resolvePromptSubject('male', 'realistic')).toBe('male');
    expect(resolvePromptSubject('transgender', 'realistic')).toBe('transgender');
    expect(resolvePromptSubject('female', 'realistic')).toBe('female');
    expect(resolvePromptSubject(undefined, undefined)).toBe('female');
  });
});

// ─── 家族协议映射 ────────────────────────────────────────────

describe('PROMPT_PROTOCOL_BY_FAMILY', () => {
  it('三家族协议互不相同', () => {
    expect(PROMPT_PROTOCOL_BY_FAMILY.flux).toBe('flux-natural');
    expect(PROMPT_PROTOCOL_BY_FAMILY.pony).toBe('pony-tags');
    expect(PROMPT_PROTOCOL_BY_FAMILY.illustrious).toBe('illustrious-tags');
    expect(new Set(Object.values(PROMPT_PROTOCOL_BY_FAMILY)).size).toBe(3);
  });
});

// ─── 正向提示词组装 ──────────────────────────────────────────

describe('encodeFamilyPrompt', () => {
  it('illustrious 2D：美学质量 tag 开头 + 身份 tag 化', () => {
    const prompt = encodeFamilyPrompt({
      family: 'illustrious',
      subject: '2d',
      identity: 'Long Silver Hair, Blue Eyes',
      scene: 'moonlit garden',
      framing: 'full body',
      loraTriggers: ['mikasa style'],
    });
    expect(prompt.startsWith('masterpiece, best quality, very aesthetic')).toBe(true);
    expect(prompt).toContain('long_silver_hair');
    expect(prompt).toContain('blue_eyes');
    expect(prompt).toContain('full_body');
    expect(prompt).toContain('mikasa style');
    expect(prompt.toLowerCase()).not.toContain('photorealistic');
  });

  it('pony：score 评分 tag 开头', () => {
    const prompt = encodeFamilyPrompt({
      family: 'pony',
      subject: 'female',
      scene: 'cozy bedroom',
    });
    expect(prompt.startsWith('score_9, score_8_up, score_7_up')).toBe(true);
    expect(prompt).toContain('1girl');
  });

  it('flux：自然语言拼接，不做 tag 下划线化', () => {
    const prompt = encodeFamilyPrompt({
      family: 'flux',
      subject: 'female',
      identity: 'elegant woman with long silver hair',
      scene: 'standing in a moonlit garden',
    });
    expect(prompt).toContain('elegant woman with long silver hair');
    expect(prompt).toContain('standing in a moonlit garden');
    expect(prompt).not.toContain('long_silver_hair');
    expect(prompt).toContain('sharp focus');
  });

  it('触发词去重且限量', () => {
    const prompt = encodeFamilyPrompt({
      family: 'illustrious',
      subject: '2d',
      loraTriggers: ['tag a', 'tag a', 'tag b'],
    });
    expect(prompt.match(/tag a/g)?.length).toBe(1);
  });

  it('输出长度受 520 字符限制', () => {
    const prompt = encodeFamilyPrompt({
      family: 'illustrious',
      subject: '2d',
      scene: Array(80).fill('very long scene fragment').join(', '),
    });
    expect(prompt.length).toBeLessThanOrEqual(520);
  });
});

// ─── 负向与质量增强 ──────────────────────────────────────────

describe('familyNegativePrompt / familyQualityEnhancers', () => {
  it('负向始终包含全局 BLOCKED 安全词', () => {
    for (const family of ['flux', 'pony', 'illustrious'] as const) {
      const negative = familyNegativePrompt(family, 'female');
      expect(negative).toContain('child, underage');
      expect(negative).toContain('non-consensual');
    }
  });

  it('NSFW 时 tag 族追加去打码负向，SFW 不追加', () => {
    const nsfw = familyNegativePrompt('illustrious', '2d', true);
    const sfw = familyNegativePrompt('illustrious', '2d', false);
    expect(nsfw).toContain('censored, mosaic');
    expect(sfw).not.toContain('mosaic');
  });

  it('2D 题材默认开启放大（去糊关键），FLUX 写实不开放大', () => {
    expect(familyQualityEnhancers('illustrious', '2d')).toEqual({ adetailer: true, upscale: true });
    expect(familyQualityEnhancers('flux', 'female')).toEqual({ adetailer: true, upscale: false });
  });

  it('中文标准说明非空', () => {
    expect(describeFamilyBasicPreset('illustrious', '2d').length).toBeGreaterThan(8);
    expect(resolveFamilySubjectPreset('pony', 'male').note).toContain('Pony');
  });
});

// ─── 路由原子性：checkpoint/sampler/协议 不得跨族混用 ─────────

describe('resolveImageGenerationRoute 原子性', () => {
  const sdxlEndpointId = 'test-sdxl-endpoint';

  it('矩阵开启 + 2D → illustrious：SDXL 全参数集原子绑定', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: '2d',
      nsfwIntensity: 1,
      matrixActive: true,
      sdxlEndpointId,
    });
    expect(route.modelFamily).toBe('illustrious');
    expect(route.endpointId).toBe(sdxlEndpointId);
    expect(route.checkpoint.toLowerCase()).toContain('illustrious');
    expect(route.sampler).toBe('dpmpp_2m_sde');
    expect(route.scheduler).toBe('karras');
    expect(route.cfg).toBeGreaterThanOrEqual(5);
    expect(route.clipSkip).toBe(2);
    expect(route.promptProtocol).toBe('illustrious-tags');
    expect(route.negativePrompt).toContain('worst quality');
    expect(route.qualityEnhancers.upscale).toBe(true);
    // 原子性：不得出现 FLUX 采样参数/checkpoint 混入
    expect(route.sampler).not.toBe('euler');
    expect(route.cfg).not.toBe(1);
    expect(route.checkpoint.toLowerCase()).not.toContain('flux');
  });

  it('矩阵开启 + 写实女性 → pony：score tag 协议', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: 'realistic',
      nsfwIntensity: 3,
      matrixActive: true,
      sdxlEndpointId,
    });
    expect(route.modelFamily).toBe('pony');
    expect(route.promptProtocol).toBe('pony-tags');
    expect(route.negativePrompt).toContain('score_1');
    expect(route.negativePrompt).toContain('censored');
  });

  it('矩阵开启 + 3D → 保留 FLUX 精品层（flux-natural 协议）', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: '3d',
      nsfwIntensity: 1,
      matrixActive: true,
      sdxlEndpointId,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.promptProtocol).toBe('flux-natural');
    expect(route.cfg).toBe(1);
  });

  it('矩阵关闭 → fail-open FLUX，协议/负向仍是 flux 族原生', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: '2d',
      nsfwIntensity: 1,
      matrixActive: false,
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.promptProtocol).toBe('flux-natural');
    expect(route.negativePrompt).toContain('photograph');
    // FLUX 2D 回退也默认开放大去糊
    expect(route.qualityEnhancers.upscale).toBe(true);
  });

  it('矩阵开启但缺 SDXL 端点 → fail-open FLUX', () => {
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category: 'female',
      renderStyle: '2d',
      nsfwIntensity: 1,
      matrixActive: true,
      sdxlEndpointId: '',
    });
    expect(route.modelFamily).toBe('flux');
    expect(route.presetId).toBe('flux-matrix-failopen');
  });
});

// ─── model-matrix 计划层 ─────────────────────────────────────

describe('resolveModelPlan 协议注入', () => {
  it('二次元计划带 illustrious 协议与放大默认', () => {
    const plan = resolveModelPlan({
      surface: 'companion',
      category: 'female',
      renderStyle: '2d',
      nsfwLevel: 1,
      matrixActive: true,
    });
    expect(plan.endpointKey).toBe('runpod-sdxl-pro');
    expect(plan.promptProtocol).toBe('illustrious-tags');
    expect(plan.qualityEnhancers).toEqual({ adetailer: true, upscale: true });
  });

  it('总闸关闭时 flux 计划也注入协议字段', () => {
    const plan = resolveModelPlan({
      surface: 'companion',
      category: 'transgender',
      renderStyle: 'realistic',
      nsfwLevel: 5,
      matrixActive: false,
    });
    expect(plan.endpointKey).toBe('runpod-flux');
    expect(plan.promptProtocol).toBe('flux-natural');
    expect(plan.negativePrompt).toContain('child, underage');
  });
});

// ─── studio-task-prompt 家族原生组装 ─────────────────────────

describe('buildStudioTaskPrompt 家族协议', () => {
  it('illustrious 家族产出 danbooru 质量 tag 开头', () => {
    const prompt = buildStudioTaskPrompt({
      task: 'portrait',
      modelFamily: 'illustrious',
      scene: 'cafe window seat',
      category: 'female',
      renderStyle: '2d',
    });
    expect(prompt.startsWith('masterpiece, best quality')).toBe(true);
  });

  it('pony 家族产出 score tag 开头', () => {
    const prompt = buildStudioTaskPrompt({
      task: 'portrait',
      modelFamily: 'pony',
      scene: 'bedroom portrait',
      category: 'female',
      renderStyle: 'realistic',
    });
    expect(prompt.startsWith('score_9')).toBe(true);
  });

  it('flux 家族保留 authored scene 原文（不 tag 化）', () => {
    const prompt = buildStudioTaskPrompt({
      task: 'portrait',
      modelFamily: 'flux',
      scene: 'She reads a book by the window in soft morning light.',
      category: 'female',
      renderStyle: 'realistic',
      hasIdentityReference: true,
    });
    expect(prompt).toContain('She reads a book by the window');
  });
});
