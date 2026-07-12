/**
 * Girlfriend card image prompts — FLUX.1
 *
 * Structure (simple, Civitai-style natural language):
 *   traits + action/pose + environment/light + short quality
 * Negative: only hard exclusions (keep short for FLUX).
 *
 * Goals from reference set:
 * - Distinct faces (not same template beauty face)
 * - Varied poses / camera angles (not one static three-quarter stand)
 * - Natural light (window, flash, city night, golden hour) — avoid flat beauty-dish spam
 */
import {
  sanitizeBlurKeywords,
  joinParts,
  looksLikeFluxPrompt,
  extractPersonName,
  stripQualityBoilerplate,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

/** Short quality tail — do NOT stack camera spam (causes same-face look). */
export const GIRLFRIEND_QUALITY_PREFIX =
  'photorealistic, natural skin texture, detailed eyes, sharp focus, realistic lighting';

/**
 * Soft figure hint — keep short so face/pose still dominate.
 * Full "hourglass large breasts" spam forces same body every time.
 */
export const GIRLFRIEND_BODY_FIXED =
  'feminine curves, attractive adult figure, natural proportions';

/** Framing only when scene does not already set camera */
export const GIRLFRIEND_FRAMING =
  'three-quarter length, looking at viewer, natural candid pose';

/**
 * Short negatives — FLUX hates long SD negative lists.
 */
export const GIRLFRIEND_NEGATIVE =
  'blurry, deformed, bad anatomy, extra fingers, same face, plastic skin, oversmoothed, ' +
  'child, underage, watermark, text, logo, cartoon, anime';

/** Prefer empty negative for pure FLUX workers */
export const GIRLFRIEND_NEGATIVE_FLUX = '';

export interface GirlfriendSubject {
  name?: string;
  race?: string;
  hair?: string;
  hairColor?: string;
  eyes?: string;
  body?: string;
  style?: string;
  personality?: string;
  tags?: string[] | string;
  appearance?: string;
  occupation?: string;
  sceneId?: string;
  mood?: string;
}

export type GirlfriendSceneId =
  | 'rooftop_night'
  | 'mirror_selfie'
  | 'city_apartment'
  | 'window_sunlight'
  | 'pink_bedroom'
  | 'gothic_throne'
  | 'cafe_day'
  | 'car_night'
  | 'beach_breeze'
  | 'kitchen_morning'
  | 'studio_clean'
  | 'golden_hour'
  | 'auto';

type SceneRecipe = {
  id: Exclude<GirlfriendSceneId, 'auto'>;
  label: string;
  /** Action / pose / camera (most important for variety) */
  action: string;
  /** Place + wardrobe vibe */
  env: string;
  /** Light story — one clear source */
  light: string;
  match: RegExp;
};

/**
 * Reference-inspired scenes: different faces need different poses + light, not one template.
 * Keep each clause short (Civitai caption style).
 */
export const GIRLFRIEND_SCENE_RECIPES: SceneRecipe[] = [
  {
    id: 'rooftop_night',
    label: 'Rooftop night',
    action:
      'leaning on glass railing, one hip cocked, chin slightly down, looking up at camera, medium full-body shot',
    env: 'luxury rooftop at night, city skyline bokeh, fitted evening outfit',
    light: 'cool blue ambient + warm city rim light on hair and shoulders',
    match: /rooftop|night|city|skyline|club|glam|neon|evening/i,
  },
  {
    id: 'mirror_selfie',
    label: 'Mirror selfie',
    action:
      'bathroom mirror selfie, phone in hand, free hand in messy hair, hip popped, high angle',
    env: 'tiled bathroom, casual crop top and jeans, candid after-party vibe',
    light: 'direct phone flash + warm overhead bulb, hard shadows, skin sheen',
    match: /selfie|mirror|bathroom|flash|tattoo|casual|party/i,
  },
  {
    id: 'city_apartment',
    label: 'Apartment couch',
    action:
      'sitting on couch edge, knees together then slightly open, elbows on thighs, calm direct eye contact, eye-level',
    env: 'modern apartment living room, soft pillows, stylish date-night top',
    light: 'warm lamp key light, cool window fill from city night',
    match: /apartment|couch|indoor|living room|soft glam|home/i,
  },
  {
    id: 'window_sunlight',
    label: 'Window sunlight',
    action:
      'standing by window, body three-quarter turned, looking back over shoulder, hand resting on curtain',
    env: 'tall window, sheer lace curtains, intimate home interior',
    light: 'strong golden side sun, soft lace shadow patterns on skin',
    match: /window|sunlight|lace|morning|sheer|curtain/i,
  },
  {
    id: 'pink_bedroom',
    label: 'Bedroom kneel',
    action:
      'kneeling on bed facing away then looking back, arched back, over-shoulder smile, three-quarter crop',
    env: 'pastel bedroom, LED strips, soft sheets, lingerie or sleepwear',
    light: 'pink LED fill + warm bedside practical light',
    match: /bedroom|lingerie|pink|led|garter|stockings|kneeling|nsfw/i,
  },
  {
    id: 'gothic_throne',
    label: 'Throne fantasy',
    action:
      'seated on ornate chair, legs crossed or open elegant, one hand on armrest, low-angle power pose',
    env: 'dark gothic set, smoke haze, black lace outfit, dramatic props',
    light: 'high-contrast key light, volumetric haze, deep shadows',
    match: /gothic|throne|queen|crown|dark|fantasy|dominant/i,
  },
  {
    id: 'cafe_day',
    label: 'Cafe daylight',
    action:
      'leaning on cafe table with chin on hand, slight smile, 50mm candid portrait crop',
    env: 'sunlit cafe window seat, coffee cup, casual day outfit',
    light: 'soft daylight through glass, gentle catchlights in eyes',
    match: /cafe|coffee|daylight|brunch|casual date|day/i,
  },
  {
    id: 'car_night',
    label: 'Car night',
    action:
      'in passenger seat, body turned toward camera, one arm on seat back, intimate close crop',
    env: 'car interior at night, city lights through windows, date-night dress',
    light: 'dashboard glow + street neon color spill, shallow depth of field',
    match: /car|night drive|neon|passenger|vehicle/i,
  },
  {
    id: 'beach_breeze',
    label: 'Beach breeze',
    action:
      'walking toward camera mid-step, hair wind-blown, natural smile, full-body wide shot',
    env: 'beach at golden hour, light summer outfit, ocean behind',
    light: 'low warm sun, soft rim light through hair, bright open sky',
    match: /beach|ocean|summer|outdoor|wind|vacation/i,
  },
  {
    id: 'kitchen_morning',
    label: 'Kitchen morning',
    action:
      'standing at kitchen counter, mug in both hands, relaxed shoulders, soft half-smile, medium shot',
    env: 'bright kitchen, morning routine, simple home clothes',
    light: 'cool morning window light from the side, clean soft shadows',
    match: /kitchen|morning|coffee home|domestic|cozy/i,
  },
  {
    id: 'studio_clean',
    label: 'Studio clean',
    action:
      'weight on one hip, arms relaxed, fashion lookbook stance, three-quarter body',
    env: 'seamless studio backdrop, premium companion card look',
    light: 'large soft key light, gentle fill, clean commercial lighting',
    match: /studio|clean|portrait|card|profile|simple/i,
  },
  {
    id: 'golden_hour',
    label: 'Golden hour outdoor',
    action:
      'walk-and-turn pose, slight lean, hair catching wind, warm smile to viewer',
    env: 'outdoors at golden hour, lifestyle companion moment',
    light: 'warm low sun on face and shoulders, natural outdoor light',
    match: /golden|outdoor|park|sunset|warm smile|date/i,
  },
];

function normalizeTags(tags?: string[] | string): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  return String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function resolvePersonName(raw?: string | null, fallback = 'a young woman'): string {
  if (!raw?.trim()) return fallback;
  if (!looksLikeFluxPrompt(raw)) return raw.trim().slice(0, 48);
  return extractPersonName(raw) || fallback;
}

function hashPick(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return mod > 0 ? h % mod : 0;
}

/**
 * Unique-ish face cue from name seed so different girls don't share one beauty face.
 * (Not ethnicity stereotypes — hairline / freckles / face shape / makeup intensity.)
 */
export function buildFaceIdentityClause(subject: GirlfriendSubject): string {
  const seed = `${subject.name || ''}|${subject.hairColor || ''}|${subject.eyes || ''}|${subject.race || ''}`;
  const faces = [
    'oval face, soft cheekbones, natural freckles across nose, light natural makeup',
    'heart-shaped face, defined jaw, bold eyeliner, glossy lips',
    'round youthful face, full cheeks, dewy skin, soft pink makeup',
    'long face, high cheekbones, sharp brows, minimal makeup',
    'diamond face shape, almond eyes, subtle contour, nude lips',
    'square jaw softened, thick lashes, sun-kissed skin, freckles on cheeks',
    'narrow chin, wide-set eyes, messy baby hairs, no heavy foundation',
    'soft angular face, beauty mark near lip, smoky eye makeup',
  ];
  return faces[hashPick(seed || 'face', faces.length)];
}

export function pickGirlfriendScene(
  subject: GirlfriendSubject,
  rawPrompt = '',
  metadataScene?: string | null,
): SceneRecipe {
  const explicit = (subject.sceneId || '').trim().toLowerCase();
  if (explicit && explicit !== 'auto') {
    const hit = GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === explicit);
    if (hit) return hit;
  }

  const bag = [
    metadataScene || '',
    subject.style || '',
    subject.occupation || '',
    subject.personality || '',
    subject.appearance || '',
    subject.mood || '',
    rawPrompt || '',
    normalizeTags(subject.tags).join(' '),
  ]
    .join(' ')
    .toLowerCase();

  for (const recipe of GIRLFRIEND_SCENE_RECIPES) {
    if (recipe.match.test(bag)) return recipe;
  }

  const p = (subject.personality || '').toLowerCase();
  if (/shy|soft|gentle|innocent|caring/.test(p)) {
    return GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === 'window_sunlight')!;
  }
  if (/playful|brat|tease|party|wild/.test(p)) {
    return GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === 'mirror_selfie')!;
  }
  if (/dominant|queen|dark|mysterious|gothic/.test(p)) {
    return GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === 'gothic_throne')!;
  }
  if (/elegant|luxury|glam|model/.test(p)) {
    return GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === 'rooftop_night')!;
  }
  if (/cozy|home|sweet|girlfriend next door/.test(p)) {
    return GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === 'kitchen_morning')!;
  }

  const seed = `${subject.name || ''}|${subject.hairColor || ''}|${subject.eyes || ''}|${subject.body || ''}`;
  const idx = hashPick(seed || 'default', GIRLFRIEND_SCENE_RECIPES.length);
  return GIRLFRIEND_SCENE_RECIPES[idx] || GIRLFRIEND_SCENE_RECIPES[0];
}

export function buildExpressionClause(subject: GirlfriendSubject, scene: SceneRecipe): string {
  const p = (subject.personality || subject.mood || '').toLowerCase();
  if (/shy|soft|gentle|innocent/.test(p)) return 'soft half-smile, bashful eyes';
  if (/playful|brat|tease|flirty/.test(p)) return 'mischievous smile, flirty eyes';
  if (/dominant|confident|queen|bold/.test(p)) return 'confident stare, calm seduction';
  if (/romantic|caring|sweet/.test(p)) return 'warm affectionate gaze';

  const byScene: Record<string, string> = {
    mirror_selfie: 'cheeky pout, playful eyes',
    rooftop_night: 'sultry half-lidded gaze',
    pink_bedroom: 'bright over-shoulder smile',
    gothic_throne: 'dramatic parted lips',
    window_sunlight: 'gentle over-shoulder smile',
    cafe_day: 'easy candid smile',
    car_night: 'intimate soft look',
    beach_breeze: 'bright natural smile',
    kitchen_morning: 'sleepy soft smile',
  };
  return byScene[scene.id] || 'natural expression, alive eyes';
}

/**
 * Traits only — face identity + hair/eyes/body from card.
 */
export function buildSubjectClause(s: GirlfriendSubject): string {
  const name = resolvePersonName(s.name, 'a beautiful young woman');
  const parts: string[] = [
    name,
    'young adult woman 23-28',
    buildFaceIdentityClause(s),
  ];

  if (s.race) parts.push(`${s.race} features`);
  if (s.hair || s.hairColor) {
    parts.push(`${[s.hairColor, s.hair].filter(Boolean).join(' ')} hair`.trim());
  }
  if (s.eyes) parts.push(`${s.eyes} eyes`);
  if (s.body) parts.push(`${s.body} body`);
  if (s.style && !looksLikeFluxPrompt(s.style)) {
    parts.push(String(s.style).slice(0, 60));
  }
  if (s.appearance && !looksLikeFluxPrompt(s.appearance)) {
    const a = sanitizeBlurKeywords(s.appearance);
    if (a) parts.push(a.slice(0, 100));
  }

  const tags = normalizeTags(s.tags).slice(0, 4);
  if (tags.length) parts.push(tags.join(', '));

  return parts.join(', ');
}

export function subjectFromGirlfriendRow(row: Record<string, unknown>): GirlfriendSubject {
  const card =
    row.character_card && typeof row.character_card === 'object'
      ? (row.character_card as Record<string, unknown>)
      : {};
  const cardApp =
    card.appearance && typeof card.appearance === 'object'
      ? (card.appearance as Record<string, string>)
      : {};

  const rawName = String(row.name || card.title || '');
  const imagePrompt = (row.image_prompt as string) || undefined;
  const appearanceField = (row.appearance as string) || undefined;

  let appearance: string | undefined;
  const cand = appearanceField || imagePrompt;
  if (cand && !looksLikeFluxPrompt(cand)) {
    appearance = cand;
  } else if (cand && looksLikeFluxPrompt(cand)) {
    const stripped = stripQualityBoilerplate(cand).slice(0, 100);
    if (stripped && !looksLikeFluxPrompt(stripped)) appearance = stripped;
  }

  const meta =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    name: resolvePersonName(
      rawName,
      extractPersonName(imagePrompt) || extractPersonName(appearanceField) || '',
    ),
    race: (row.appearance_race as string) || cardApp.race || undefined,
    hair:
      (row.appearance_hair as string) ||
      cardApp.hair_style ||
      cardApp.hair ||
      undefined,
    hairColor: (row.appearance_hair_color as string) || cardApp.hair_color || undefined,
    eyes: (row.appearance_eyes as string) || cardApp.eyes || undefined,
    body: (row.appearance_body as string) || cardApp.body || undefined,
    style: (row.appearance_style as string) || cardApp.style || undefined,
    personality: (row.personality as string) || (card.personality as string) || undefined,
    tags: (row.tags as string[] | string) || (card.tags as string[]) || undefined,
    appearance,
    occupation: (card.occupation as string) || (card.role_label as string) || undefined,
    sceneId:
      (row.scene_id as string) ||
      (meta.scene_id as string) ||
      (meta.scene as string) ||
      undefined,
    mood: (row.mood as string) || (meta.mood as string) || undefined,
  };
}

function trimPrompt(positive: string, max = 720): string {
  let out = positive
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (out.length > max) {
    out = out.slice(0, max);
    const lastComma = out.lastIndexOf(',');
    if (lastComma > max * 0.7) out = out.slice(0, lastComma);
  }
  return out.trim();
}

/**
 * Assemble: traits → action → env → light → expression → quality.
 * Simple Civitai-style caption, not stacked SD boilerplate.
 */
export function assembleGirlfriendPrompt(
  ctx: PresetContext,
  subject: GirlfriendSubject,
  opts?: { useEmptyNegative?: boolean; sceneId?: string },
): AssembledPrompt {
  const fixedSubject: GirlfriendSubject = {
    ...subject,
    name: resolvePersonName(subject.name),
    sceneId: opts?.sceneId || subject.sceneId,
  };

  const rawIn = sanitizeBlurKeywords(ctx.rawPrompt || '');
  const metaScene = ctx.metadata?.scene || null;
  const scene = pickGirlfriendScene(fixedSubject, rawIn, metaScene);
  const expression = buildExpressionClause(fixedSubject, scene);

  const rawIsFullCaption =
    rawIn.length > 100 &&
    (/three-quarter|looking at viewer|hourglass|large breasts|photorealistic|raw photo|masterpiece/i.test(
      rawIn,
    ) ||
      looksLikeFluxPrompt(rawIn));

  const subjectClause = buildSubjectClause(fixedSubject);
  const rawStripped = rawIsFullCaption ? '' : stripQualityBoilerplate(rawIn);
  const extra =
    rawStripped &&
    rawStripped.length > 8 &&
    !subjectClause.toLowerCase().includes(rawStripped.toLowerCase().slice(0, 40))
      ? rawStripped.slice(0, 120)
      : '';

  const metaBits = joinParts([
    ctx.metadata?.appearance && !looksLikeFluxPrompt(ctx.metadata.appearance)
      ? sanitizeBlurKeywords(String(ctx.metadata.appearance)).slice(0, 80)
      : '',
    ctx.metadata?.lighting ? sanitizeBlurKeywords(String(ctx.metadata.lighting)).slice(0, 60) : '',
  ]);

  // Order: who → body hint → action → place → light → face mood → quality
  const positive = trimPrompt(
    joinParts([
      subjectClause,
      GIRLFRIEND_BODY_FIXED,
      scene.action,
      scene.env,
      scene.light,
      expression,
      metaBits,
      extra,
      GIRLFRIEND_QUALITY_PREFIX,
    ]),
  );

  const negative =
    opts?.useEmptyNegative === false ? GIRLFRIEND_NEGATIVE : GIRLFRIEND_NEGATIVE_FLUX;

  return { positive, negative };
}

export function assembleGirlfriendFromRow(
  row: Record<string, unknown>,
  rawPrompt = '',
  opts?: { sceneId?: string; useEmptyNegative?: boolean },
): AssembledPrompt {
  return assembleGirlfriendPrompt({ rawPrompt }, subjectFromGirlfriendRow(row), {
    useEmptyNegative: opts?.useEmptyNegative !== false,
    sceneId: opts?.sceneId,
  });
}
