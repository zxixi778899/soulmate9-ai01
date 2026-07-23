export const COMPANION_CATEGORIES = ['female', 'male', 'transgender', 'anime'] as const;
export type CompanionCategory = (typeof COMPANION_CATEGORIES)[number];

export const COMPANION_CATEGORY_LABELS: Record<CompanionCategory, { en: string; zh: string }> = {
  female: { en: 'Women', zh: '女性' },
  male: { en: 'Men', zh: '男性' },
  transgender: { en: 'Transgender', zh: '跨性别' },
  anime: { en: 'Anime', zh: '二次元' },
};

const BLOCKED =
  'child, underage, teen, young-looking, schoolchild, non-consensual, coercion, violence, gore, incest, bestiality, blurry, bad anatomy, deformed hands, watermark, text';

export const STUDIO_PROMPTS: Record<CompanionCategory, { prompt: string; negative: string }> = {
  female: {
    prompt: 'A breathtaking adult woman age 25+, feminine hourglass figure, confident direct eye contact, explicit consensual adult boudoir scene, provocative natural pose, detailed skin and anatomy, cinematic intimate lighting, photorealistic high-resolution editorial quality',
    negative: `male body, masculine face, ${BLOCKED}`,
  },
  male: {
    prompt: 'A striking adult man age 25+, athletic masculine physique, broad shoulders and defined torso, confident direct eye contact, explicit consensual adult bedroom scene, provocative natural pose, detailed skin and male anatomy, cinematic intimate lighting, photorealistic high-resolution editorial quality',
    negative: `female body, breasts, feminine face, ${BLOCKED}`,
  },
  transgender: {
    prompt: 'A beautiful adult transgender person age 25+, confident authentic gender presentation, elegant natural proportions, direct eye contact, explicit consensual adult boudoir scene, provocative natural pose, detailed skin and anatomy, cinematic intimate lighting, photorealistic high-resolution editorial quality',
    negative: `caricature, fetishized stereotype, ${BLOCKED}`,
  },
  anime: {
    prompt: 'An unmistakably adult anime character age 25+, mature facial features and adult proportions, explicit consensual adult fantasy scene, provocative dynamic pose, polished 2D illustration, clean line art, expressive eyes, rich cel shading, detailed background, premium anime key visual',
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
  if (/male|\bman\b|boyfriend|男性/.test(`${gender} ${tags}`)) return 'male';
  return 'female';
}
