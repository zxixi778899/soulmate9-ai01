export const COMPANION_CATEGORIES = ['female', 'male', 'transgender', 'anime'] as const;
export type CompanionCategory = (typeof COMPANION_CATEGORIES)[number];

export type CompanionLabelLocale = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de';

export const COMPANION_CATEGORY_LABELS: Record<CompanionCategory, Record<CompanionLabelLocale, string>> = {
  female: { en: 'Women', zh: '女性', ja: '女性', ko: '여성', es: 'Mujeres', fr: 'Femmes', de: 'Frauen' },
  male: { en: 'Men', zh: '男性', ja: '男性', ko: '남성', es: 'Hombres', fr: 'Hommes', de: 'Männer' },
  transgender: { en: 'Transgender', zh: '跨性别', ja: 'トランスジェンダー', ko: '트랜스젠더', es: 'Transgénero', fr: 'Transgenre', de: 'Transgender' },
  anime: { en: 'Anime', zh: '二次元', ja: 'アニメ', ko: '애니메이션', es: 'Anime', fr: 'Anime', de: 'Anime' },
};

/**
 * Safety guardrails shared by all adult generation surfaces (studio prompts +
 * quick presets). Always keep minors / coercion / violence excluded.
 */
export const BLOCKED =
  'child, underage, teen, young-looking, schoolchild, minor, loli, shota, non-consensual, coercion, violence, gore, incest, bestiality, blurry, bad anatomy, deformed hands, watermark, text';

/**
 * High-explicitness adult baseline per companion category. These power the
 * admin Creation Workbench "adult prompt" buttons and set the default
 * high-NSFW tone. All subjects are framed as consenting adults age 25+.
 */
export const HIGH_NSFW_PROMPT = 'The image depicts consenting adults age 25 or older in a private erotic scene. Their intimate pose, naturally exposed body, realistic anatomy, direct eye contact, and confident sexual tension are photographed with an uncensored premium boudoir aesthetic.';

export const COMPACT_ADULT_NEGATIVE = 'child, minor, underage, teen, young-looking, loli, shota, non-consensual, coercion, violence, gore, incest, bestiality, bad anatomy, deformed hands, watermark, text';

export const STUDIO_PROMPTS: Record<CompanionCategory, { prompt: string; negative: string }> = {
  female: {
    prompt: 'a consenting adult on a modern sofa in a private living room, medium full-body framing',
    negative: `male body, masculine face, ${BLOCKED}`,
  },
  male: {
    prompt: 'a consenting adult on a modern sofa in a private living room, medium full-body framing',
    negative: `female body, breasts, feminine face, ${BLOCKED}`,
  },
  transgender: {
    prompt: 'a consenting adult on a modern sofa in a private living room, medium full-body framing',
    negative: `caricature, fetishized stereotype, ${BLOCKED}`,
  },
  anime: {
    prompt: 'a consenting adult on a sofa in a private fantasy apartment, medium full-body framing',
    negative: `childlike proportions, school uniform, loli, shota, photorealistic, photograph, 3d render, ${BLOCKED}`,
  },
};

export function normalizeCompanionCategory(input: {
  gender?: unknown;
  style?: unknown;
  tags?: unknown;
}): CompanionCategory {
  const gender = String(input.gender || '').trim().toLowerCase();
  // Gender is an identity field. Style and tags must never override it.
  if (/\btrans(?:gender|sexual)?\b|non.?binary|mtf|ftm/.test(gender)) return 'transgender';
  if (/\bmale\b|\bman\b|\bmen\b|boyfriend/.test(gender)) return 'male';
  if (/\bfemale\b|\bwoman\b|\bwomen\b|girlfriend/.test(gender)) return 'female';
  return 'female';
}

/**
 * Display-side classification for catalog browsing (Explore / Home tabs).
 * Unlike normalizeCompanionCategory (which feeds the generation pipeline and
 * must stay gender-first so pronouns/anatomy stay consistent), the showcase
 * surfaces group 2D companions under the Anime tab: 2d/anime style or tags
 * win over gender here.
 */
export function companionDisplayCategory(input: {
  gender?: unknown;
  style?: unknown;
  tags?: unknown;
}): CompanionCategory {
  if (exactStyle(input.style) === '2d') return 'anime';
  if (Array.isArray(input.tags) && input.tags.some((tag) => ['anime', '2d', 'manga'].includes(String(tag).trim().toLowerCase()))) return 'anime';
  return normalizeCompanionCategory(input);
}

export type CompanionRenderStyle = 'realistic' | '2d' | '3d';

function exactStyle(value: unknown): CompanionRenderStyle | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['2d', '2danime', 'anime2d', 'anime', 'manga', 'cartoon', 'cel', 'celshaded'].includes(normalized)) return '2d';
  if (['3d', '3danime', 'anime3d', 'cgi', 'pbr', 'animation3d', '3danimation'].includes(normalized)) return '3d';
  if (['realistic', 'photorealistic', 'photo', 'photography', 'real'].includes(normalized)) return 'realistic';
  return null;
}

export function normalizeCompanionRenderStyle(input: {
  renderStyle?: unknown;
  animeRenderStyle?: unknown;
  visualStyle?: unknown;
  appearanceStyle?: unknown;
  /** Tag array from girlfriend row — used as last-resort 2D/anime signal. */
  tags?: unknown;
}): CompanionRenderStyle {
  const explicit =
    exactStyle(input.renderStyle)
    || exactStyle(input.animeRenderStyle)
    || exactStyle(input.visualStyle)
    || exactStyle(input.appearanceStyle);
  if (explicit) return explicit;

  // ── Tag-based fallback: anime / 2d / manga tags → 2D ──
  if (Array.isArray(input.tags)) {
    const animeTags = ['anime', '2d', 'manga', 'cel-shaded', 'celshaded', 'illustration', 'cartoon'];
    const hasAnimeTag = input.tags.some((tag) =>
      animeTags.includes(String(tag).trim().toLowerCase()),
    );
    if (hasAnimeTag) return '2d';
  }

  return 'realistic';
}