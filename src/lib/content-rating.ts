/**
 * Unified SFW/NSFW content rating layer.
 *
 * Single source of truth for deciding which content channel a generation
 * request may use and how intense it may be. Replaces the scattered regex
 * checks that previously lived inside individual API routes.
 *
 * Levels:
 *   0 everyday | 1 flirty | 2 lingerie/suggestive | 3 sensual nudity
 *   4 explicit nudity | 5 explicit sexual content
 *
 * Rules (compliant with the intimacy gate):
 *   - Intimacy levels 1-2: channel is ALWAYS sfw, level capped at 2.
 *   - Intimacy levels 3-5: nsfw channel allowed, level capped at the
 *     intimacy policy's nsfwIntensity.
 *   - Global kill switch (site settings) or per-companion opt-out forces sfw.
 */

import type { IntimacyGenerationPolicy } from '@/lib/intimacy-policy';

export type ContentChannel = 'sfw' | 'nsfw';

export type NsfwLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** Level 5: explicit sexual acts / fluids. */
const LEVEL5_RE =
  /\b(fuck|fucking|fucked|sex|sexual|intercourse|make love|blowjob|handjob|deepthroat|creampie|facial|cum|cumming|orgasm|climax|penetrat|missionary|cowgirl|doggy|threesome|anal sex|bdsm|bondage|milking)\b|性爱|做爱|口交|肛交|内射|颜射|高潮|抽插|性交/i;

/** Level 4: nudity / exposed genitals. */
const LEVEL4_RE =
  /\b(nude|naked|nudity|topless|bottomless|undress|strip(ped)?|pussy|vagina|penis|cock|dick|nipples? exposed|bare breasts|genitals|spread (legs|open)|bent over)\b|裸体|全裸|一丝不挂|脱光|露点|乳头|阴部|生殖器/i;

/** Level 3: lingerie / seduction / masturbation. */
const LEVEL3_RE =
  /\b(lingerie|sexy lingerie|negligee|see.?through|bustier|corset|garter|thong|panties|bra\b|masturbat|tease|seduce|seductive|erotic|horny|aroused|kink|fetish|whip|collar|leash)\b|内衣|情趣|挑逗|自慰|诱惑|性感写真/i;

/** Level 2: suggestive clothing / posing. */
const LEVEL2_RE =
  /\b(bikini|swimsuit|cleavage|hot pants|short shorts|mini skirt|off.?shoulder|wet shirt|wet t.?shirt|bedroom pose|sultry|provocative pose)\b|比基尼|泳装|低胸|热裤/i;

/** Level 1: flirty / romantic vibe. */
const LEVEL1_RE =
  /\b(sexy|hot|flirt|flirty|alluring|kiss|romantic|intimate|bedroom eyes|smoldering)\b|性感|撩|暧昧|亲密|诱惑/i;

/** Broad adult mention detector (diagnostics / safety logging). */
export const ADULT_MENTION_RE =
  /nude|naked|undress|strip|nsfw|explicit|sex|sexy|lingerie|topless|bottomless|masturbat|orgasm|erotic|horny|breast|nipple|thong|bikini|撩|裸体|脱光|内衣|色情|自慰|高潮|性爱|乳头|乳房|一丝不挂/i;

/**
 * Detect the highest NSFW level implied by free text (request + context).
 * Returns 0 when nothing suggestive is found.
 */
export function detectRequestedNsfwLevel(text: string): NsfwLevel {
  if (!text) return 0;
  const sample = text.slice(0, 4000);
  if (LEVEL5_RE.test(sample)) return 5;
  if (LEVEL4_RE.test(sample)) return 4;
  if (LEVEL3_RE.test(sample)) return 3;
  if (LEVEL2_RE.test(sample)) return 2;
  if (LEVEL1_RE.test(sample)) return 1;
  return 0;
}

export function detectAdultMention(text: string): boolean {
  return ADULT_MENTION_RE.test(text || '');
}

export interface ContentRatingInput {
  /** Free-text user request. */
  userRequest: string;
  /** Optional recent chat lines (role/content) — scanned for intent too. */
  chatContext?: Array<{ role?: string; content?: string }>;
  /** Intimacy-derived policy for this companion + user. */
  intimacyPolicy: IntimacyGenerationPolicy;
  /** Site-wide NSFW kill switch (site_settings). Defaults to enabled. */
  nsfwGloballyEnabled?: boolean;
  /** Per-companion opt-out (future companion setting). */
  companionNsfwDisabled?: boolean;
}

export interface ContentRatingResult {
  channel: ContentChannel;
  /** Effective maximum level this request may generate after all caps. */
  level: NsfwLevel;
  /** Level implied by the raw text, before caps. */
  requestedLevel: NsfwLevel;
  /** True when adult terms appear anywhere in request/context. */
  adultMention: boolean;
  /** True when adult content was requested but capped to SFW. */
  downgraded: boolean;
  /** Intensity value to feed prompt/LoRA routing (1-5). */
  maxIntensity: number;
}

function clampLevel(value: number): NsfwLevel {
  return Math.min(5, Math.max(0, Math.round(value))) as NsfwLevel;
}

/**
 * Resolve the content rating for a generation request.
 *
 * Channel semantics match the existing resolveImagePromptChannel behavior:
 * intimacy level 3+ unlocks the NSFW channel; levels 1-2 stay SFW no matter
 * what the text says. The level additionally caps how far the content may go.
 */
export function resolveContentRating(input: ContentRatingInput): ContentRatingResult {
  const blob = [
    input.userRequest || '',
    ...(input.chatContext || []).map((line) => String(line?.content || '')),
  ]
    .join(' ')
    .slice(0, 4000);

  const requestedLevel = detectRequestedNsfwLevel(blob);
  const adultMention = detectAdultMention(blob);

  const globallyEnabled = input.nsfwGloballyEnabled !== false;
  const companionEnabled = !input.companionNsfwDisabled;
  const nsfwUnlocked =
    input.intimacyPolicy.adultAllowed && globallyEnabled && companionEnabled;

  const channel: ContentChannel = nsfwUnlocked ? 'nsfw' : 'sfw';

  // SFW channel caps at lingerie level (2); NSFW channel caps at the intimacy
  // policy intensity so higher text demand never outruns the relationship.
  const cap = nsfwUnlocked ? input.intimacyPolicy.nsfwIntensity : Math.min(2, input.intimacyPolicy.nsfwIntensity);
  const level = clampLevel(Math.min(requestedLevel, cap));

  return {
    channel,
    level,
    requestedLevel,
    adultMention,
    downgraded: adultMention && channel === 'sfw',
    maxIntensity: cap,
  };
}
