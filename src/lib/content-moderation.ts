/**
 *   NSFW  + 
 *
 * 
 * 1. /
 * 2. LLM NSFW 
 * 3.  NSFW 
 *    -  content_nsfw_level
 *    - admin 
 *    - 
 *
 * Why moderation API OpenAI Moderation
 * -  API  NSFW "NSFW "
 * - 
 * - " AI " NSFW 
 */

export type NsfwLevel = 'sfw' | 'mild' | 'moderate' | 'explicit';

/**
 * 
 * - 
 * - 
 * - 
 */
const HARD_BLOCK_PATTERNS: RegExp[] = [
  // Minor-related keywords (English)
  /\bminor(s)?\b/i,
  /\bunder\s*age\b/i,
  /\bchild(ren)?\b/i,
  /\bteen(ager|age)?s?\b/i,
  /\b(school|student|kid|kids|boy|girl)\b/i,
  /\b(loli|shota|cub)\b/i,

  // Minor-related keywords (Chinese)
  /(未成年|少女|幼女|女童|童颜)/,

  // Non-consensual content (English)
  /\b(non[- ]?consensual|rape|force(d|ful)?|coercion)\b/i,

  // Non-consensual content (Chinese)
  /(强迫|强暴|迷奸)/,

  // Real person references (English)
  /\b(celebrity|politician|real\s*person)\b/i,

  // Real person references (Chinese)
  /(明星|名人|真人)/,
];

export interface ModerationResult {
  allowed: boolean;
  nsfwLevel: NsfwLevel;
  reason?: string;
  matchedPattern?: string;
}

/**
 * 
 *
 * @param text 
 * @returns allowed: nsfwLevel: 
 *
 * 
 * -  HARD_BLOCK  
 * -    NSFW 
 */
export function moderateText(text: string): ModerationResult {
  if (!text || text.length === 0) {
    return { allowed: true, nsfwLevel: 'sfw' };
  }

  const normalized = text.toLowerCase().slice(0, 10000); //  ReDoS

  for (const pattern of HARD_BLOCK_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        allowed: false,
        nsfwLevel: 'sfw',
        reason: 'content_violates_policy',
        matchedPattern: match[0],
      };
    }
  }

  return { allowed: true, nsfwLevel: 'moderate' }; //  sfw
}

/**
 *  NSFW 
 *  chat_messages  content_nsfw_level 
 */
export function inferNsfwLevel(params: {
  hasExplicitImage?: boolean;
  messageRole?: 'user' | 'assistant' | 'system';
  girlfriendAllowNsfw?: boolean;
}): NsfwLevel {
  if (params.hasExplicitImage) return 'explicit';
  if (!params.girlfriendAllowNsfw) return 'sfw';
  // assistant  moderateuser  SFW 
  return 'moderate';
}

/**
 *  / 
 */
export function requiresEnhancedDeletion(nsfwLevel: NsfwLevel): boolean {
  return nsfwLevel === 'explicit' || nsfwLevel === 'moderate';
}

/**
 *  CDN false
 *  / AI  NSFW  CDN
 */
export function isCacheableOnPublicCdn(_nsfwLevel: NsfwLevel): boolean {
  return false; //  NSFW  CDN
}