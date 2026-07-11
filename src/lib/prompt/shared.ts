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
    .map(s => s.trim().replace(/[,.\s]+$/g, ''))
    .join(', ');
}

/** Detect full FLUX/SD image captions wrongly stored as a "name" or title */
export function looksLikeFluxPrompt(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length > 72) return true;
  if (
    /\b(raw photo|masterpiece|best quality|photorealistic|ultra photorealistic|8k|sharp focus|tack sharp|natural skin pores|three-quarter)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if ((t.match(/,/g) || []).length >= 4) return true;
  return false;
}

/** Tokens that look like names but are quality/prompt words — never return these */
const NAME_BLOCKLIST = new Set(
  [
    'raw', 'photo', 'masterpiece', 'best', 'quality', 'ultra', 'photorealistic',
    'portrait', 'woman', 'girl', 'gorgeous', 'beautiful', 'stunning', 'young',
    'adult', 'looking', 'viewer', 'sharp', 'focus', 'detailed', 'natural',
    'skin', 'professional', 'photography', 'bright', 'clear', 'lighting',
    'three', 'quarter', 'body', 'standing', 'wearing', 'classic', 'fashion',
  ].map((w) => w.toLowerCase()),
);

function isPlausiblePersonName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2 || n.length > 40) return false;
  if (looksLikeFluxPrompt(n)) return false;
  const words = n.split(/\s+/);
  if (words.length === 0 || words.length > 3) return false;
  // Reject quality-token false positives like "RAW" from "portrait of RAW photo"
  if (words.some((w) => NAME_BLOCKLIST.has(w.toLowerCase()))) return false;
  return /^[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){0,2}$/.test(n);
}

/** Pull a person name like "Claire Edwards" out of a corrupted prompt/name field */
export function extractPersonName(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (isPlausiblePersonName(t)) return t;

  const patterns = [
    // Prefer "portrait of Name," before quality spam (skip "of RAW photo")
    /\b(?:three-quarter\s+)?(?:body\s+)?portrait of (?!RAW\b)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
    /\bof ([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),\s*(?:gorgeous|beautiful|stunning|young)/i,
    /\bname[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
    // "Claire Edwards, gorgeous young adult"
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+),\s*(?:gorgeous|beautiful|stunning|young|21|22|23|24|25)/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1] && isPlausiblePersonName(m[1])) return m[1].trim();
  }
  return null;
}

/** Safe short label for UI / logs (never dump full prompts as "name") */
export function safeDisplayName(
  name: string | null | undefined,
  fallback = '未命名',
): string {
  if (!name?.trim()) return fallback;
  if (!looksLikeFluxPrompt(name)) return name.trim();
  return extractPersonName(name) || fallback;
}

/** Strip repeated quality boilerplate so we don't stack RAW photo ×2 */
export function stripQualityBoilerplate(s: string): string {
  if (!s) return s;
  let out = s;
  const patterns = [
    /\bRAW photo\b/gi,
    /\bmasterpiece\b/gi,
    /\bbest quality\b/gi,
    /\bultra photorealistic\b/gi,
    /\bultra-high resolution\b/gi,
    /\b4K\b/gi,
    /\b8K UHD\b/gi,
    /\b8k uhd\b/gi,
    /\b8k\b/gi,
    /\bsuper resolution\b/gi,
    /\bhighly detailed(?: face and eyes)?\b/gi,
    /\bphotorealism\b/gi,
    /\bhyperrealistic\b/gi,
    /\bdslr\b/gi,
    /\bsharp focus\b/gi,
    /\btack sharp\b/gi,
    /\bin-focus\b/gi,
    /\bcrisp details\b/gi,
    /\bdetailed eyes\b/gi,
    /\bdetailed face\b/gi,
    /\bdetailed skin texture\b/gi,
    /\bnatural skin pores\b/gi,
    /\bprofessional photography\b/gi,
    /\bshot on Canon EOS R5(?:,?\s*(?:50mm|85mm)[^,]*)?/gi,
    /\b85mm f\/1\.4 lens\b/gi,
    /\b50mm lens\b/gi,
    /\bbright clear lighting\b/gi,
    /\bwell-lit subject\b/gi,
    /\bsoft cinematic lighting\b/gi,
    /\bultra-high resolution\b/gi,
  ];
  for (const re of patterns) out = out.replace(re, '');
  return out
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
