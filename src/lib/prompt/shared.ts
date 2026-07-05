/**
 * PromptDSL  
 *  generate-from-meta  prompt 
 * girlfriend / outfit / shop_item preset 
 */

//   
// LLM  appearance / scene  FLUX 
export const BLUR_KEYWORDS: readonly string[] = [
  'soft focus', 'soft-focus', 'out of focus', 'out-of-focus', 'defocused',
  'blurry', 'blurred', 'blur background', 'blurred background',
  'hazy', 'haze', 'misty', 'foggy',
  'dreamy', 'ethereal', 'gauzy', 'gauze', 'veiled',
  'motion blur', 'gaussian blur', 'lens blur',
  'bokeh', 'shallow depth of field', 'depth of field', 'shallow dof',
  'low resolution', 'lowres', 'pixelated', 'low detail',
];

//  positive prompt ""
//  positive prompt 
export const NEGATION_PHRASES: readonly string[] = [
  'no person', 'no people', 'no human', 'no humans', 'no woman', 'no man',
  'no model', 'no models', 'no mannequin', 'no mannequins',
  'no face', 'no faces', 'no body', 'no bodies', 'no body part', 'no body parts',
  'no hands', 'no arms', 'no legs', 'no head',
  'without a person', 'without person', 'without people',
  'without a model', 'without a mannequin', 'without a human', 'without a face',
];

/**
 *  keywords 
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
  // 
  cleaned = cleaned
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s+/g, ' ');
  return cleaned;
}

//   
export const QUALITY_TOKENS = {
  base: 'RAW photo, masterpiece, best quality',
  resolution: 'ultra-high resolution, 4K, 8K UHD, super resolution',
  sharpness: 'highly detailed, sharp focus, tack sharp, in-focus, crisp details',
  hardware: 'shot on Hasselblad H6D-100c, deep focus everything in focus',
  photoreal: 'ultra photorealistic, photorealism, hyperrealistic',
} as const;

//  negative prompt /
export const COMMON_NEGATIVE_TAIL = [
  'blurry', 'blur', 'blurred', 'soft focus', 'out of focus', 'defocused',
  'hazy', 'dreamy', 'motion blur', 'depth of field', 'shallow depth of field', 'bokeh',
  'low quality', 'worst quality', 'lowres', 'pixelated',
  'watermark', 'text', 'logo', 'signature',
  'jpeg artifacts', 'compression artifacts',
].join(', ');

/**
 * Prompt 
 */
export type PromptType = 'girlfriend' | 'outfit' | 'shop_item';

/**
 * Preset 
 */
export interface PresetContext {
  /** generate-meta  prompt sanitizeBlurKeywords  */
  rawPrompt: string;
  /**  LLM  metadata null */
  metadata?: { appearance?: string; scene?: string; lighting?: string } | null;
}

/**
 * Preset 
 */
export interface AssembledPrompt {
  positive: string;
  negative: string;
}

/**
 *  positive prompt   preset 
 */
export function joinParts(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map(s => s.trim().replace(/[]+$/g, ''))
    .join(', ');
}
