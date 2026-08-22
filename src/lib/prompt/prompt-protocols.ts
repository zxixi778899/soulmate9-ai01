/**
 * Prompt Protocol Matrix — 模型家族 × 题材 的提示词 / 负向 / 质量增强结构。
 *
 * 三个底模家族的提示词协议完全不同，禁止混用：
 *   - flux        → 'flux-natural'      自然语言句子（T5 理解长句，忌 tag 堆砌）
 *   - pony        → 'pony-tags'         score 评分 tag 开头 + 逗号 tag（SDXL 写实）
 *   - illustrious → 'illustrious-tags'  danbooru tag + 美学质量 tag（SDXL 二次元）
 *
 * 题材维度（女 / 男 / 跨性别 / 2D / 3D）在每族内给出原生描述子、负向与
 * 质量增强默认（ADetailer 修脸 / 4x-UltraSharp 放大）。2D 默认开启放大，
 * 是二次元出图去糊的关键。
 *
 * 参数（steps/cfg/sampler/分辨率）仍由 model-matrix / image-generation-routing
 * 决定；本模块只负责"提示词协议 + 负向 + 增强器"这一层，二者在路由层原子绑定。
 */
import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle } from '@/lib/comfy-console/studio-profile';

export type PromptFamily = 'flux' | 'pony' | 'illustrious';
export type PromptSubject = 'female' | 'male' | 'transgender' | '2d' | '3d';
export type PromptProtocolId = 'flux-natural' | 'pony-tags' | 'illustrious-tags';

export type FamilySubjectPreset = {
  /** 中文标准说明（控制台/文档展示） */
  note: string;
  /** 题材原生描述子（按协议格式书写） */
  descriptor: string;
  /** 质量开头（tag 族为评分/美学 tag；flux 为空） */
  qualityPrefix: string;
  /** 质量收尾（flux 为自然语言画质句；tag 族通常为空） */
  qualitySuffix: string;
  /** 族×题材负向（不含全局 BLOCKED，函数内自动追加） */
  negative: string;
  /** NSFW 时追加的负向（去打码等） */
  nsfwNegativeExtra: string;
  /** 质量增强默认 */
  enhancers: { adetailer: boolean; upscale: boolean };
};

const BLOCKED =
  'child, underage, teen, young-looking, schoolchild, non-consensual, coercion, violence, incest, bestiality';

export const PROMPT_PROTOCOL_BY_FAMILY: Record<PromptFamily, PromptProtocolId> = {
  flux: 'flux-natural',
  pony: 'pony-tags',
  illustrious: 'illustrious-tags',
};

// ─── FLUX：自然语言协议 ────────────────────────────────────────
const FLUX_PRESETS: Record<PromptSubject, FamilySubjectPreset> = {
  female: {
    note: 'FLUX 写实女性：自然语言长句 + 真实皮肤质感，CFG 恒 1、guidance 3.5~4。',
    descriptor: 'young adult woman, natural skin texture with subtle pores, realistic photograph',
    qualityPrefix: '',
    qualitySuffix: 'sharp focus, high detail, natural color grading, soft practical light',
    negative: 'blurry, low quality, deformed, extra limbs, watermark, text, plastic skin, airbrushed, cartoon, anime, 3d render',
    nsfwNegativeExtra: '',
    enhancers: { adetailer: true, upscale: false },
  },
  male: {
    note: 'FLUX 写实男性：男性解剖与自然光，负向排除女性化特征。',
    descriptor: 'young adult man, masculine anatomy, broad shoulders, realistic photograph',
    qualityPrefix: '',
    qualitySuffix: 'sharp focus, high detail, natural color grading',
    negative: 'blurry, low quality, deformed, female body, breasts, feminine face, watermark, text, cartoon, anime',
    nsfwNegativeExtra: '',
    enhancers: { adetailer: true, upscale: false },
  },
  transgender: {
    note: 'FLUX 跨性别：自然真实的性别呈现，避免刻板化与漫画化。',
    descriptor: 'young adult transgender woman, confident authentic gender presentation, natural anatomy, realistic photograph',
    qualityPrefix: '',
    qualitySuffix: 'sharp focus, high detail, natural skin, respectful portrayal',
    negative: 'blurry, low quality, caricature, fetishized stereotype, deformed, watermark, text, cartoon, anime',
    nsfwNegativeExtra: '',
    enhancers: { adetailer: true, upscale: false },
  },
  '2d': {
    note: 'FLUX 2D 回退：自然语言描述动漫画风 + 动漫 LoRA，默认开放大去糊。',
    descriptor: '2D anime illustration, fully colored finished artwork, cel shading, expressive eyes, vibrant flat color',
    qualityPrefix: '',
    qualitySuffix: 'sharp clean lines, high detail anime key visual, no blur, no jpeg artifacts',
    negative: 'photograph, photorealistic, 3d render, blurry, soft focus, low quality, jpeg artifacts, dirty lines, line art only, sketch, unfinished sketch, monochrome, grayscale, watermark',
    nsfwNegativeExtra: '',
    enhancers: { adetailer: true, upscale: true },
  },
  '3d': {
    note: 'FLUX 3D 渲染：PBR 材质与渲染器质感描述。',
    descriptor: '3D character render, PBR materials, subsurface scattering, studio octane render',
    qualityPrefix: '',
    qualitySuffix: 'crisp geometry, clean topology shading, high detail textures',
    negative: '2d, flat color, sketch, line art, blurry, low quality, photograph, watermark',
    nsfwNegativeExtra: '',
    enhancers: { adetailer: true, upscale: false },
  },
};

// ─── Pony：score 评分 tag 协议 ─────────────────────────────────
const PONY_PRESETS: Record<PromptSubject, FamilySubjectPreset> = {
  female: {
    note: 'Pony 写实女性：score_9 评分 tag 开头 + 逗号 tag，CFG 6~6.5、clipSkip 2。',
    descriptor: '1girl, solo, mature female, realistic, detailed skin',
    qualityPrefix: 'score_9, score_8_up, score_7_up',
    qualitySuffix: '',
    negative: 'score_1, score_2, bad anatomy, bad hands, missing fingers, extra digits, blurry, low quality, watermark, text, painting, sketch, monochrome, cartoon',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: false },
  },
  male: {
    note: 'Pony 写实男性：1boy 评分 tag 协议，负向排除女性化特征。',
    descriptor: '1boy, solo, masculine male, broad shoulders, realistic',
    qualityPrefix: 'score_9, score_8_up, score_7_up',
    qualitySuffix: '',
    negative: 'score_1, score_2, 1girl, female body, breasts, bad anatomy, bad hands, blurry, low quality, watermark, cartoon',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: false },
  },
  transgender: {
    note: 'Pony 跨性别：1girl 呈现 + 自然解剖，负向排除夸张刻板化。',
    descriptor: '1girl, solo, transgender female, natural anatomy, realistic',
    qualityPrefix: 'score_9, score_8_up, score_7_up',
    qualitySuffix: '',
    negative: 'score_1, score_2, caricature, bad anatomy, bad hands, blurry, low quality, watermark, cartoon, sketch',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: false },
  },
  '2d': {
    note: 'Pony 2D：评分 tag + anime style tag（Pony 兼顾动漫，但旗舰二次元走 Illustrious）。',
    descriptor: '1girl, solo, anime style, fully colored, cel shading',
    qualityPrefix: 'score_9, score_8_up, score_7_up',
    qualitySuffix: '',
    negative: 'score_1, score_2, bad anatomy, bad hands, blurry, low quality, watermark, photorealistic, 3d, sketch, monochrome, line art only',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: true },
  },
  '3d': {
    note: 'Pony 3D：评分 tag + 3d 渲染 tag。',
    descriptor: '1girl, solo, 3d style, pbr materials, render',
    qualityPrefix: 'score_9, score_8_up, score_7_up',
    qualitySuffix: '',
    negative: 'score_1, score_2, bad anatomy, blurry, low quality, watermark, sketch, 2d flat color',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: false },
  },
};

// ─── Illustrious：danbooru tag 协议 ────────────────────────────
const ILLUSTRIOUS_PRESETS: Record<PromptSubject, FamilySubjectPreset> = {
  female: {
    note: 'Illustrious 二次元女性：masterpiece 美学 tag 开头 + danbooru tag，CFG 5.5~6、clipSkip 2、默认放大+修脸。',
    descriptor: '1girl, solo, anime style, fully colored, cel shading, detailed eyes',
    qualityPrefix: 'masterpiece, best quality, very aesthetic, absurdres, highres',
    qualitySuffix: '',
    negative: 'worst quality, low quality, bad anatomy, bad hands, missing fingers, extra digits, blurry, jpeg artifacts, photorealistic, realistic, 3d, watermark, text, signature, sketch, monochrome, line art only',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: true },
  },
  male: {
    note: 'Illustrious 二次元男性：1boy danbooru 协议。',
    descriptor: '1boy, solo, anime style, fully colored, cel shading',
    qualityPrefix: 'masterpiece, best quality, very aesthetic, absurdres, highres',
    qualitySuffix: '',
    negative: 'worst quality, low quality, 1girl, bad anatomy, bad hands, blurry, jpeg artifacts, photorealistic, 3d, watermark, sketch, monochrome, line art only',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: true },
  },
  transgender: {
    note: 'Illustrious 跨性别：1girl 呈现 + 自然解剖 tag。',
    descriptor: '1girl, solo, anime style, transgender female, natural anatomy',
    qualityPrefix: 'masterpiece, best quality, very aesthetic, absurdres, highres',
    qualitySuffix: '',
    negative: 'worst quality, low quality, caricature, bad anatomy, bad hands, blurry, jpeg artifacts, photorealistic, 3d, watermark',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: true },
  },
  '2d': {
    note: 'Illustrious 2D 旗舰：danbooru tag + 美学质量 tag，放大+修脸保障清晰度。',
    descriptor: '1girl, solo, anime style, fully colored, cel shading, vibrant color, detailed background',
    qualityPrefix: 'masterpiece, best quality, very aesthetic, absurdres, highres',
    qualitySuffix: '',
    negative: 'worst quality, low quality, bad anatomy, bad hands, blurry, jpeg artifacts, photorealistic, realistic, 3d, watermark, text, sketch, monochrome, line art only',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: true },
  },
  '3d': {
    note: 'Illustrious 3D 风格：anime 基底 + 3d 风格 tag（非主路径）。',
    descriptor: '1girl, solo, anime style, 3d style, smooth shading',
    qualityPrefix: 'masterpiece, best quality, very aesthetic, absurdres',
    qualitySuffix: '',
    negative: 'worst quality, low quality, bad anatomy, blurry, jpeg artifacts, photorealistic, watermark',
    nsfwNegativeExtra: 'censored, mosaic, bar censor',
    enhancers: { adetailer: true, upscale: true },
  },
};

const PRESETS_BY_FAMILY: Record<PromptFamily, Record<PromptSubject, FamilySubjectPreset>> = {
  flux: FLUX_PRESETS,
  pony: PONY_PRESETS,
  illustrious: ILLUSTRIOUS_PRESETS,
};

// ─── 解析与组装 ────────────────────────────────────────────────

/** 由伴侣类别 + 渲染风格推导题材维度。 */
export function resolvePromptSubject(
  category: CompanionCategory | string | undefined,
  renderStyle: AnimeRenderStyle | undefined,
): PromptSubject {
  if (renderStyle === '2d') return '2d';
  if (renderStyle === '3d') return '3d';
  if (category === 'male') return 'male';
  if (category === 'transgender') return 'transgender';
  return 'female';
}

export function resolveFamilySubjectPreset(
  family: PromptFamily,
  subject: PromptSubject,
): FamilySubjectPreset {
  return PRESETS_BY_FAMILY[family][subject];
}

/** 族×题材负向（自动追加全局 BLOCKED 与 NSFW 去打码）。 */
export function familyNegativePrompt(
  family: PromptFamily,
  subject: PromptSubject,
  nsfw = false,
): string {
  const preset = resolveFamilySubjectPreset(family, subject);
  const extra = nsfw && preset.nsfwNegativeExtra ? `, ${preset.nsfwNegativeExtra}` : '';
  return `${preset.negative}${extra}, ${BLOCKED}`;
}

/** 族×题材质量增强默认（ADetailer / 放大）。 */
export function familyQualityEnhancers(
  family: PromptFamily,
  subject: PromptSubject,
): { adetailer: boolean; upscale: boolean } {
  return { ...resolveFamilySubjectPreset(family, subject).enhancers };
}

/** tag 族格式化：小写 + 空格转下划线（danbooru 规范）。 */
function tagify(fragment: string): string {
  return fragment.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * 按家族协议组装正向提示词。
 * - illustrious/pony：质量 tag 开头 + tag 化身份 + 场景 + 触发词
 * - flux：自然语言拼接（不 tag 化）
 */
export function encodeFamilyPrompt(input: {
  family: PromptFamily;
  subject: PromptSubject;
  /** 身份/外观片段（逗号分隔） */
  identity?: string;
  /** 场景描述（用户编写或草稿） */
  scene?: string;
  framing?: string;
  loraTriggers?: string[];
}): string {
  const preset = resolveFamilySubjectPreset(input.family, input.subject);
  const protocol = PROMPT_PROTOCOL_BY_FAMILY[input.family];
  const triggers = [...new Set((input.loraTriggers || []).map((t) => t.trim()).filter(Boolean))].slice(0, 8);
  const scene = (input.scene || '').trim();
  const framing = (input.framing || '').trim();

  if (protocol === 'flux-natural') {
    return [framing, input.identity?.trim() || preset.descriptor, scene, preset.qualitySuffix, triggers.join(', ')]
      .filter(Boolean)
      .join(', ')
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .trim()
      .slice(0, 520);
  }

  // tag 协议：身份片段 tag 化；场景保留原文（Illustrious/Pony 兼容短自然语言）。
  const identityTags = (input.identity?.trim() ? input.identity : preset.descriptor)
    .split(',')
    .map(tagify)
    .filter(Boolean)
    .join(', ');
  return [preset.qualityPrefix, identityTags, framing ? tagify(framing) : '', scene, triggers.join(', ')]
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim()
    .slice(0, 520);
}

/** 中文标准说明（控制台展示/文档）。 */
export function describeFamilyBasicPreset(
  family: PromptFamily,
  subject: PromptSubject,
): string {
  return resolveFamilySubjectPreset(family, subject).note;
}
