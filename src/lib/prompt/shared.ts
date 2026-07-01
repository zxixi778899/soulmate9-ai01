/**
 * PromptDSL — 共享部分
 * 把 generate-from-meta 中散落的硬编码 prompt 拆分成结构化字段，
 * 各类型（girlfriend / outfit / shop_item）的 preset 单独维护。
 */

// ─── 模糊关键词清洗 ───────────────────────────────────────
// LLM 生成的 appearance / scene 文本可能包含让 FLUX 输出模糊的关键词
export const BLUR_KEYWORDS: readonly string[] = [
  'soft focus', 'soft-focus', 'out of focus', 'out-of-focus', 'defocused',
  'blurry', 'blurred', 'blur background', 'blurred background',
  'hazy', 'haze', 'misty', 'foggy',
  'dreamy', 'ethereal', 'gauzy', 'gauze', 'veiled',
  'motion blur', 'gaussian blur', 'lens blur',
  'bokeh', 'shallow depth of field', 'depth of field', 'shallow dof',
  'low resolution', 'lowres', 'pixelated', 'low detail',
];

// 否定指令在 positive prompt 中会让扩散模型反而把"被否定的概念"画出来
// 必须在送入生成器前从 positive prompt 中物理清除
export const NEGATION_PHRASES: readonly string[] = [
  'no person', 'no people', 'no human', 'no humans', 'no woman', 'no man',
  'no model', 'no models', 'no mannequin', 'no mannequins',
  'no face', 'no faces', 'no body', 'no bodies', 'no body part', 'no body parts',
  'no hands', 'no arms', 'no legs', 'no head',
  'without a person', 'without person', 'without people',
  'without a model', 'without a mannequin', 'without a human', 'without a face',
];

/**
 * 同时清理模糊词和否定词（默认）。可传入自定义 keywords 数组扩展。
 */
export function sanitizeBlurKeywords(text: string, extra: readonly string[] = []): string {
  if (!text) return text;
  let cleaned = text;
  for (const kw of [...BLUR_KEYWORDS, ...NEGATION_PHRASES, ...extra]) {
    const re = new RegExp(
      `\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'gi',
    );
    cleaned = cleaned.replace(re, '');
  }
  // 清理多余逗号空格
  cleaned = cleaned
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s+/g, ' ');
  return cleaned;
}

// ─── 通用质量关键词 ──────────────────────────────────────
export const QUALITY_TOKENS = {
  base: 'RAW photo, masterpiece, best quality',
  resolution: 'ultra-high resolution, 4K, 8K UHD, super resolution',
  sharpness: 'highly detailed, sharp focus, tack sharp, in-focus, crisp details',
  hardware: 'shot on Hasselblad H6D-100c, deep focus everything in focus',
  photoreal: 'ultra photorealistic, photorealism, hyperrealistic',
} as const;

// 通用 negative prompt 末尾（避免水印/低质等共性问题）
export const COMMON_NEGATIVE_TAIL = [
  'blurry', 'blur', 'blurred', 'soft focus', 'out of focus', 'defocused',
  'hazy', 'dreamy', 'motion blur', 'depth of field', 'shallow depth of field', 'bokeh',
  'low quality', 'worst quality', 'lowres', 'pixelated',
  'watermark', 'text', 'logo', 'signature',
  'jpeg artifacts', 'compression artifacts',
].join(', ');

/**
 * Prompt 类型
 */
export type PromptType = 'girlfriend' | 'outfit' | 'shop_item';

/**
 * Preset 输入参数
 */
export interface PresetContext {
  /** 上游（generate-meta 或用户）传来的原始 prompt，已被 sanitizeBlurKeywords 清洗过 */
  rawPrompt: string;
  /** 上游 LLM 生成的 metadata，可能为 null */
  metadata?: { appearance?: string; scene?: string; lighting?: string } | null;
}

/**
 * Preset 输出
 */
export interface AssembledPrompt {
  positive: string;
  negative: string;
}

/**
 * 拼接最终 positive prompt — 各 preset 自己实现并调用
 */
export function joinParts(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map(s => s.trim().replace(/[，。]+$/g, ''))
    .join(', ');
}
