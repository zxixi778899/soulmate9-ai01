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
export const HIGH_NSFW_PROMPT = 'consenting adults age 25+ only, high-NSFW erotic composition, tasteful explicit nudity, exposed adult body, provocative intimate pose, strong sexual tension, realistic adult anatomy, confident direct eye contact, premium uncensored boudoir aesthetic';

export const COMPACT_ADULT_NEGATIVE = 'child, minor, underage, teen, young-looking, loli, shota, non-consensual, coercion, violence, gore, incest, bestiality, bad anatomy, deformed hands, watermark, text';

export const STUDIO_PROMPTS: Record<CompanionCategory, { prompt: string; negative: string }> = {
  female: {
    prompt: 'A breathtaking adult woman age 25+, voluptuous feminine hourglass figure, full natural breasts, soft curves, bare glowing skin with visible pores, confident direct eye contact, explicit consensual adult boudoir scene, provocative natural pose, sensual parted lips, detailed realistic skin texture and anatomy, warm cinematic intimate lighting, erotic high-resolution editorial boudoir photography, 8k uhd, raw photo',
    negative: `male body, masculine face, ${BLOCKED}`,
  },
  male: {
    prompt: 'A striking adult man age 25+, athletic masculine physique, broad shoulders, defined muscular torso and abs, bare toned skin, confident direct eye contact, explicit consensual adult bedroom scene, provocative natural pose, detailed realistic skin and male anatomy, warm cinematic intimate lighting, erotic high-resolution editorial photography',
    negative: `female body, breasts, feminine face, ${BLOCKED}`,
  },
  transgender: {
    prompt: 'A beautiful adult transgender woman age 25+, confident authentic feminine presentation, elegant curvy proportions, soft glowing skin, alluring direct eye contact, explicit consensual adult boudoir scene, provocative natural pose, sensual expression, detailed realistic skin texture and anatomy, warm cinematic intimate lighting, erotic high-resolution editorial photography',
    negative: `caricature, fetishized stereotype, ${BLOCKED}`,
  },
  anime: {
    prompt: 'An unmistakably adult anime character age 25+, mature facial features and voluptuous adult proportions, expressive seductive eyes, explicit consensual adult fantasy scene, provocative dynamic pose, sensual atmosphere, polished 2D illustration, clean line art, rich cel shading, detailed background, premium erotic anime key visual',
    negative: `childlike proportions, school uniform, loli, shota, photorealistic, photograph, 3d render, ${BLOCKED}`,
  },
};

export function normalizeCompanionCategory(input: {
  gender?: unknown;
  style?: unknown;
  tags?: unknown;
}): CompanionCategory {
  const gender = String(input.gender || '').toLowerCase();
  const style = String(input.style || '').toLowerCase();
  const tags = Array.isArray(input.tags) ? input.tags.join(' ').toLowerCase() : String(input.tags || '').toLowerCase();
  if (/anime|manga|cartoon|2d|comic|二次元/.test(`${style} ${tags}`)) return 'anime';
  if (/trans|non.?binary|跨性别/.test(`${gender} ${tags}`)) return 'transgender';
  if (/\bfemale\b|\bwoman\b|\bwomen\b|女性/.test(`${gender} ${tags}`)) return 'female';
  if (/\bmale\b|\bman\b|\bmen\b|boyfriend|男性/.test(`${gender} ${tags}`)) return 'male';
  return 'female';
}
