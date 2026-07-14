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
import { pickInstalledLora, sanitizeLoraForVolume } from '@/lib/runpod-loras';
import {
  sanitizeBlurKeywords,
  joinParts,
  looksLikeFluxPrompt,
  extractPersonName,
  stripQualityBoilerplate,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

/**
 * Quality tail (自然语言质量词) — beauty / allure / photoreal.
 * Keep short; avoid stacking camera spam that collapses faces.
 */
export const GIRLFRIEND_QUALITY_PREFIX =
  'stunningly beautiful, seductive and alluring, soft glamorous makeup, glossy lips, bedroom eyes, flawless glowing skin, photorealistic editorial beauty photo, crisp eyes, natural skin texture, detailed hair, high-resolution detail, sharp focus, intimate and captivating'

/**
 * Soft figure hint — keep short so face/pose still dominate.
 * Avoid fixed lingerie / same body spam that collapses variety.
 */
export const GIRLFRIEND_BODY_FIXED =
  'sexy feminine silhouette, graceful waist and hips, attractive figure, realistic anatomy and proportions'

/** Default framing for companion cards: face the viewer (not back/side template). */
export const GIRLFRIEND_FRAMING =
  'facing the viewer with intimate eye contact'

/**
 * Short negatives — FLUX hates long SD negative lists.
 * Include anti-template tokens for the back/side lingerie collapse.
 */
export const GIRLFRIEND_NEGATIVE =
  'blurry, deformed, bad anatomy, extra fingers, underexposed, dark muddy skin, stiff mannequin pose, same standing pose, ' +
  'exaggerated plastic body, cartoon proportions, face-only close-up, headshot only, from behind, looking away, ' +
  'oversmoothed AI skin, plastic skin, child, underage, watermark, text, logo, cartoon, anime'

/** Short FLUX-safe negative (empty only when caller opts in) */
export const GIRLFRIEND_NEGATIVE_FLUX =
  'blurry, out of focus, oversaturated, orange skin, harsh backlight, blown highlights, stiff pose, twisted torso, waxy skin, bad anatomy, deformed hands, child, underage, watermark, text'

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
  outfit?: string;
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
  /** Multiple front-facing poses (picked per character) */
  poses: string[];
  /** Wardrobe options (picked per character) — avoid one white lingerie look */
  outfits: string[];
  /** Place */
  env: string;
  /** Light story — face is primary lit */
  light: string;
  match: RegExp;
};

/**
 * Companion-card scenes: mostly FACE CAMERA.
 * Looking-back / from-behind is rare and never the only option.
 * Outfits diversify per character hash so batch gen does not clone lingerie.
 */
export const GIRLFRIEND_SCENE_RECIPES: SceneRecipe[] = [
  {
    id: 'rooftop_night',
    label: 'Rooftop night',
    poses: [
      'casual lean on railing, body angled 30 degrees, one elbow on rail, relaxed shoulders, three-quarter body',
      'sitting on outdoor lounge chair facing camera, legs naturally crossed, lifestyle night date look',
      'standing mid-conversation pose, weight on back leg, one hand holding a drink, full body',
      'walking past railing toward camera mid-step, natural arm swing, candid nightlife photo',
    ],
    outfits: [
      'fitted black top and tailored trousers, date-night chic',
      'satin midi dress with light jacket on shoulders',
      'dark jeans and stylish blouse',
      'knit crop cardigan over camisole and skirt',
      'simple black mini dress, elegant not costume',
    ],
    env: 'city rooftop terrace at night, skyline soft bokeh',
    light: 'soft front fill on face and torso, city lights in background only, natural night photo not studio spot',
    match: /rooftop|night|city|skyline|club|glam|neon|evening/i,
  },
  {
    id: 'mirror_selfie',
    label: 'Mirror selfie',
    poses: [
      'bathroom mirror selfie, phone in right hand, left hand fixing hair, casual hip shift, full body',
      'mirror selfie slightly high angle, both feet visible, natural standing, playful smile',
      'leaning toward mirror for closer selfie, shoulders relaxed, three-quarter crop',
      'mirror selfie after getting ready, one hand on sink edge, candid pose',
    ],
    outfits: [
      'everyday crop tee and jeans',
      'tank top and shorts',
      'hoodie half-zip over sports bra and leggings',
      'blouse and skirt getting-ready look',
      'simple slip dress',
    ],
    env: 'home bathroom mirror, real tiles and vanity',
    light: 'bright vanity bulbs plus mild phone flash, clear face exposure, realistic home selfie light',
    match: /selfie|mirror|bathroom|flash|tattoo|casual|party/i,
  },
  {
    id: 'city_apartment',
    label: 'Apartment',
    poses: [
      'sitting on couch with one leg tucked, phone on lap, relaxed home pose, three-quarter body',
      'standing in living room holding a mug, casual weight shift, full body',
      'kneeling on floor by coffee table arranging items, candid lifestyle',
      'leaning on sofa back facing camera, soft smile, three-quarter body',
    ],
    outfits: [
      'soft sweater and jeans',
      'camisole and relaxed trousers',
      'knit dress',
      'shirt and shorts home chic',
      'cardigan over tank and skirt',
    ],
    env: 'modern apartment living room, lived-in details',
    light: 'warm practical lamp plus window fill, natural indoor exposure',
    match: /apartment|couch|indoor|living room|soft glam|home/i,
  },
  {
    id: 'window_sunlight',
    label: 'Window light',
    poses: [
      'standing at a gentle 20-degree angle by the window, torso and hips aligned, shoulders relaxed, head naturally turned toward camera, three-quarter body',
      'sitting on window ledge, knees up casually, lifestyle portrait',
      'leaning back on window frame, arms loosely crossed, full body',
      'holding curtain lightly, subtle smile, balanced natural three-quarter pose',
    ],
    outfits: [
      'white linen shirt and jeans',
      'simple sundress',
      'knit top and skirt',
      'soft blouse and trousers',
      'casual tee dress',
    ],
    env: 'bright apartment window, sheer curtains',
    light: 'bright diffused window key light on face, clean highlights, natural daylight exposure',
    match: /window|sunlight|lace|morning|sheer|curtain/i,
  },
  {
    id: 'pink_bedroom',
    label: 'Bedroom',
    poses: [
      'sitting on bed edge, feet on floor, leaning forward slightly, three-quarter body',
      'lying on stomach on bed, chin on hands, playful but natural',
      'sitting cross-legged on bed scrolling phone, candid',
      'standing beside bed putting on earring, full body getting-ready pose',
    ],
    outfits: [
      'silk pajama set',
      'oversized tee and shorts',
      'soft robe over sleepwear',
      'camisol and shorts',
      'simple lingerie set, natural not fetish costume',
    ],
    env: 'cozy bedroom, soft sheets, personal details',
    light: 'warm bedside lamp plus soft room light, flattering but real',
    match: /bedroom|lingerie|pink|led|garter|stockings|kneeling|nsfw/i,
  },
  {
    id: 'gothic_throne',
    label: 'Dark editorial',
    poses: [
      'seated in ornate chair, ankles crossed, one hand on armrest, elegant three-quarter body',
      'standing beside chair, hand resting on backrest, full body editorial',
      'sitting sideways on chair, looking to camera, fashion story pose',
      'leaning on chair with both hands, confident but natural stance',
    ],
    outfits: [
      'black evening dress',
      'dark blouse and leather skirt',
      'velvet dress with subtle jewelry',
      'black tailored set',
      'lace top and long skirt',
    ],
    env: 'dark styled interior, moody editorial set',
    light: 'soft beauty key on face, controlled background darkness, not crushed blacks on skin',
    match: /gothic|throne|queen|crown|dark|fantasy|dominant/i,
  },
  {
    id: 'cafe_day',
    label: 'Cafe',
    poses: [
      'at cafe table, both hands on cup, shoulders relaxed, three-quarter portrait',
      'turning in chair toward camera, candid laugh, lifestyle crop',
      'standing by counter waiting for order, full body casual',
      'leaning on table with forearms, easy smile, natural pose',
    ],
    outfits: [
      'jeans and nice top',
      'trench coat over dress',
      'sweater and skirt',
      'denim jacket and tee',
      'simple day dress',
    ],
    env: 'daytime cafe, window seat',
    light: 'soft daylight through window, natural cafe photo exposure',
    match: /cafe|coffee|daylight|brunch|casual date|day/i,
  },
  {
    id: 'car_night',
    label: 'Car night',
    poses: [
      'in passenger seat, body turned slightly to camera, seatbelt on, three-quarter crop',
      'driver seat, one hand on wheel, candid night drive look',
      'standing by open car door, full body street night photo',
      'leaning on car door frame, relaxed conversation pose',
    ],
    outfits: [
      'date-night top and jeans',
      'leather jacket over dress',
      'simple blouse and skirt',
      'knit sweater and trousers',
      'casual blazer look',
    ],
    env: 'car interior or street beside car at night',
    light: 'dashboard and street practical lights, face readable, not studio glam beam',
    match: /car|night drive|neon|passenger|vehicle/i,
  },
  {
    id: 'beach_breeze',
    label: 'Beach',
    poses: [
      'walking on sand toward camera mid-step, hair moving, full body',
      'standing barefoot, hands in pockets of cover-up, natural smile',
      'sitting on towel, knees bent, lifestyle vacation crop',
      'looking back while walking but face still mostly to camera, candid',
    ],
    outfits: [
      'summer sundress',
      'shirt cover-up over swimsuit',
      'denim shorts and tee',
      'simple one-piece swimsuit with sarong',
      'linen set',
    ],
    env: 'beach, ocean soft background',
    light: 'golden natural sunlight, bright open sky, real outdoor exposure',
    match: /beach|ocean|summer|outdoor|wind|vacation/i,
  },
  {
    id: 'kitchen_morning',
    label: 'Kitchen morning',
    poses: [
      'standing at counter with coffee mug, hip lightly against cabinet, three-quarter body',
      'opening fridge door candidly, full body morning routine',
      'sitting on counter edge briefly, relaxed home pose',
      'buttering toast at counter, lifestyle action pose',
    ],
    outfits: [
      'oversized morning shirt and shorts',
      'robe over sleepwear',
      'tee and sweatpants',
      'tank and shorts',
      'simple home dress',
    ],
    env: 'bright home kitchen',
    light: 'morning window light, clean soft shadows, natural home photo',
    match: /kitchen|morning|coffee home|domestic|cozy/i,
  },
  {
    id: 'studio_clean',
    label: 'Clean card',
    poses: [
      'relaxed standing pose, weight on one leg, arms natural at sides, three-quarter body',
      'slight step forward, soft smile, full body lookbook but natural',
      'seated on simple stool, hands on thighs, three-quarter body',
      'hands lightly clasped in front, commercial but human posture',
    ],
    outfits: [
      'simple elegant dress',
      'blouse and trousers',
      'knit top and skirt',
      'clean casual chic set',
      'tailored jacket over top',
    ],
    env: 'clean seamless backdrop, companion profile card',
    light: 'large soft key and gentle fill, natural skin, not harsh beauty dish',
    match: /studio|clean|portrait|card|profile|simple/i,
  },
  {
    id: 'golden_hour',
    label: 'Golden hour',
    poses: [
      'walking toward camera on path, natural stride, full body',
      'standing and turning torso to camera, hair in breeze, three-quarter body',
      'sitting on outdoor steps, elbows on knees, candid smile',
      'holding phone taking a photo of scenery, lifestyle moment',
    ],
    outfits: [
      'flowy day dress',
      'jeans and light blouse',
      'skirt and tee',
      'linen shirt set',
      'casual cardigan look',
    ],
    env: 'outdoors at golden hour',
    light: 'warm low sun on face and body, real outdoor glow',
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

function pickFromList(seed: string, list: string[], salt = ''): string {
  if (!list.length) return '';
  return list[hashPick(`${seed}|${salt}`, list.length)] || list[0];
}

/** Per-character variety: pose + wardrobe from scene pools (not one fixed template). */
export function pickScenePoseAndOutfit(
  subject: GirlfriendSubject,
  scene: SceneRecipe,
): { pose: string; outfit: string } {
  const seed = [
    subject.name || '',
    subject.hairColor || '',
    subject.eyes || '',
    subject.race || '',
    subject.personality || '',
    subject.outfit || '',
  ].join('|');
  const pose = pickFromList(seed, scene.poses, `pose|${scene.id}`);
  const outfit =
    (subject.outfit && subject.outfit.trim()) ||
    pickFromList(seed, scene.outfits, `outfit|${scene.id}`);
  return { pose, outfit };
}


/**
 * Unique-ish face cue from name seed so different girls don't share one beauty face.
 * (Not ethnicity stereotypes — hairline / freckles / face shape / makeup intensity.)
 */
export function buildFaceIdentityClause(subject: GirlfriendSubject): string {
  const seed = `${subject.name || ''}|${subject.hairColor || ''}|${subject.eyes || ''}|${subject.race || ''}`;
  const faces = [
    'pretty oval face, soft cheekbones, natural freckles, light makeup',
    'heart-shaped pretty face, defined but natural jaw, soft liner, glossy lips',
    'round youthful pretty face, full cheeks, dewy skin, soft pink makeup',
    'long pretty face, high cheekbones, clean brows, minimal glam',
    'diamond face, almond eyes, subtle contour, nude lips',
    'soft square jaw, thick lashes, light freckles, healthy glow',
    'narrow chin, wide-set eyes, baby hairs, fresh no-foundation look',
    'soft angular face, beauty mark near lip, soft smoky eye',
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
  if (/shy|soft|gentle|innocent/.test(p)) return 'gentle pretty smile, warm eyes'
  if (/playful|brat|tease|flirty/.test(p)) return 'playful smile, lively eyes'
  if (/dominant|confident|queen|bold/.test(p)) return 'confident smile, calm eyes'
  if (/romantic|caring|sweet/.test(p)) return 'warm smile, kind eyes'

  const byScene: Record<string, string> = {
    mirror_selfie: 'flirty pout, seductive eyes, glamorous selfie makeup',
    rooftop_night: 'sexy glamorous smile, bedroom eyes, polished makeup',
    pink_bedroom: 'sexy bright smile, seductive eyes, glossy lips',
    gothic_throne: 'seductive parted lips, dark glamorous makeup, intense eyes',
    window_sunlight: 'pretty soft smile, beauty makeup, luminous eyes',
    cafe_day: 'pretty candid smile, polished casual glam',
    car_night: 'intimate flirty smile, glamorous night makeup',
    beach_breeze: 'bright sexy smile, sun-kissed glam, pretty face',
    kitchen_morning: 'soft pretty smile, fresh beauty makeup',
    studio_clean: 'magazine beauty smile, seductive eyes, flawless makeup',
    golden_hour: 'warm sexy smile, golden-hour beauty glow',
    city_apartment: 'calm seductive smile, pretty eyes, polished makeup',
  };
  return byScene[scene.id] || 'natural pretty smile, alive eyes'
}

/**
 * Traits only — face identity + hair/eyes/body from card.
 */
export function buildSubjectClause(s: GirlfriendSubject): string {
  const name = resolvePersonName(s.name, 'a beautiful young woman');
  const parts: string[] = [
    name,
    'beautiful young adult woman 23-28',
    buildFaceIdentityClause(s),
  ];

  if (s.race) parts.push(`${s.race} features`);
  if (s.hair || s.hairColor) {
    const hair = [s.hairColor, s.hair].filter(Boolean).join(' ').trim();
    parts.push(/\bhair\b/i.test(hair) ? hair : `${hair} hair`);
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
    outfit:
      (row.outfit as string) ||
      (row.current_outfit as string) ||
      (meta.outfit as string) ||
      (cardApp.outfit as string) ||
      undefined,
  };
}

function trimPrompt(positive: string, max = 650): string {
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
 * Assemble natural-language FLUX caption:
 *   1) 主角 (who she is — name + identity)
 *   2) 在干嘛 (what she is doing — pose / outfit / scene / expression)
 *   3) 质量词 (beauty + allure + photoreal quality)
 *
 * AI girlfriend is the product core: images must feel seductive, beautiful, alluring.
 * Avoid identical template spam — pose/outfit/env vary per character hash + scene.
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
      ? rawStripped.slice(0, 140)
      : '';

  const { pose, outfit } = pickScenePoseAndOutfit(fixedSubject, scene);

  // ── 1) 主角 ──
  const hair = [fixedSubject.hairColor, fixedSubject.hair].filter(Boolean).join(' ').trim();
  const personalityHint =
    fixedSubject.personality && !looksLikeFluxPrompt(fixedSubject.personality)
      ? String(fixedSubject.personality).slice(0, 48)
      : '';
  const conciseIdentity = joinParts([
    fixedSubject.name,
    'a stunningly beautiful seductive adult AI girlfriend, age 23-28',
    fixedSubject.race ? `${fixedSubject.race} features` : '',
    hair ? (/\bhair\b/i.test(hair) ? hair : `${hair} hair`) : '',
    fixedSubject.eyes ? `${fixedSubject.eyes} eyes` : '',
    fixedSubject.body ? `${fixedSubject.body} figure` : GIRLFRIEND_BODY_FIXED,
    personalityHint ? `${personalityHint} vibe` : '',
  ]);
  const person = trimPrompt(conciseIdentity || subjectClause, 260);

  // ── 2) 在干嘛 ──
  const light = scene.light || 'soft flattering key light on her face, natural skin tone';
  const generatedAction = joinParts([
    pose,
    `wearing ${outfit}`,
    `in ${scene.env}`,
    light,
    expression,
    GIRLFRIEND_FRAMING,
  ]);
  // Prefer admin/custom action text when present; otherwise scene recipe.
  const actionCore = extra || generatedAction;
  const action = trimPrompt(actionCore.replace(/^[Ss]he is\s+/i, '').replace(/[.]$/, ''), 280);

  // ── 3) 质量词 ──
  const quality = GIRLFRIEND_QUALITY_PREFIX;

  const positive = trimPrompt(
    `${person}. She is ${action}. ${quality}.`,
    700,
  );

  // Default: short anti-underexposure negative (user issue: dark muddy faces).
  // Pass useEmptyNegative: true only for pure FLUX workers that black-frame on any neg.
  const negative = opts?.useEmptyNegative === true ? '' : GIRLFRIEND_NEGATIVE_FLUX;

  return { positive, negative };
}

export function assembleGirlfriendFromRow(
  row: Record<string, unknown>,
  rawPrompt = '',
  opts?: { sceneId?: string; useEmptyNegative?: boolean },
): AssembledPrompt {
  return assembleGirlfriendPrompt({ rawPrompt }, subjectFromGirlfriendRow(row), {
    useEmptyNegative: opts?.useEmptyNegative === true,
    sceneId: opts?.sceneId,
  });
}


﻿/** Default image LoRA plan for girlfriend cards (style/skin first; pose/outfit optional). */
export type GirlfriendLoraPlan = {
  lora_name: string | null;
  lora_strength_model: number;
  lora_strength_clip: number;
  trigger_words: string[];
  note: string;
};

/**
 * Prompt = who/where/framing. LoRA = realism + optional body/outfit support.
 * Prefer 1 LoRA at a time (Comfy graph). Files must exist on volume models/loras/.
 */
export function resolveGirlfriendLoraPlanRaw(
  subject: GirlfriendSubject,
  sceneId?: string,
  opts?: { preferBody?: boolean; preferOutfit?: boolean; preferNsfwPose?: boolean },
): GirlfriendLoraPlan {
  const bag = [
    subject.personality || '',
    subject.style || '',
    subject.appearance || '',
    subject.outfit || '',
    sceneId || subject.sceneId || '',
    normalizeTags(subject.tags).join(' '),
  ]
    .join(' ')
    .toLowerCase();

  const styleFile =
    process.env.GIRLFRIEND_STYLE_LORA ||
    process.env.RUNPOD_DEFAULT_LORA ||
    'flux_style_photoreal_v1.safetensors';
  const hyperFile =
    process.env.GIRLFRIEND_HYPER_LORA || 'flux_style_hyperreal_aidma_v1.safetensors';
  const skinFile = process.env.GIRLFRIEND_SKIN_LORA || 'flux_detail_skin_v1.safetensors';
  const bodyFile = process.env.GIRLFRIEND_BODY_LORA || 'flux_body_curvy_v1.safetensors';
  const pearFile = process.env.GIRLFRIEND_PEAR_LORA || 'flux_body_pear_v1.safetensors';
  const lingerieFile =
    process.env.GIRLFRIEND_LINGERIE_LORA || 'flux_outfit_lingerie_v1.safetensors';
  const bunnyFile = process.env.GIRLFRIEND_BUNNY_LORA || 'flux_outfit_bunny_v1.safetensors';
  const maidFile = process.env.GIRLFRIEND_MAID_LORA || 'flux_outfit_maid_v1.safetensors';
  const bikiniFile = process.env.GIRLFRIEND_BIKINI_LORA || 'flux_outfit_bikini_v1.safetensors';
  const latexFile = process.env.GIRLFRIEND_LATEX_LORA || 'flux_outfit_latex_v1.safetensors';
  const schoolFile = process.env.GIRLFRIEND_SCHOOL_LORA || 'flux_outfit_school_v1.safetensors';
  const nsfwPoseFile =
    process.env.GIRLFRIEND_NSFW_POSE_LORA || 'flux_pose_nsfw_dynamic_v1.safetensors';
  const ahegaoFile = process.env.GIRLFRIEND_AHEGAO_LORA || 'flux_face_ahegao_v1.safetensors';

  if (opts?.preferNsfwPose || /ahegao|orgasm face|rolling eyes/.test(bag)) {
    if (/ahegao|orgasm face|rolling eyes/.test(bag)) {
      return {
        lora_name: ahegaoFile,
        lora_strength_model: 0.5,
        lora_strength_clip: 0.5,
        trigger_words: [],
        note: 'face-ahegao',
      };
    }
    return {
      lora_name: nsfwPoseFile,
      lora_strength_model: 0.55,
      lora_strength_clip: 0.55,
      trigger_words: [],
      note: 'pose-nsfw-dynamic',
    };
  }

  if (/bunny|playboy|rabbit ears|leotard/.test(bag)) {
    return {
      lora_name: bunnyFile,
      lora_strength_model: 0.65,
      lora_strength_clip: 0.65,
      trigger_words: [],
      note: 'outfit-bunny',
    };
  }
  if (/maid|apron|french maid/.test(bag)) {
    return {
      lora_name: maidFile,
      lora_strength_model: 0.65,
      lora_strength_clip: 0.65,
      trigger_words: [],
      note: 'outfit-maid',
    };
  }
  if (/bikini|swimsuit|beach|poolside/.test(bag)) {
    return {
      lora_name: bikiniFile,
      lora_strength_model: 0.62,
      lora_strength_clip: 0.62,
      trigger_words: [],
      note: 'outfit-bikini',
    };
  }
  if (/latex|catsuit|pvc|shiny rubber/.test(bag)) {
    return {
      lora_name: latexFile,
      lora_strength_model: 0.6,
      lora_strength_clip: 0.6,
      trigger_words: [],
      note: 'outfit-latex',
    };
  }
  if (/school uniform|sailor uniform|jk uniform|plaid skirt uniform/.test(bag)) {
    return {
      lora_name: schoolFile,
      lora_strength_model: 0.6,
      lora_strength_clip: 0.6,
      trigger_words: [],
      note: 'outfit-school',
    };
  }

  if (
    opts?.preferOutfit ||
    /lingerie|garter|babydoll|lace bra|stockings|bodysuit sheer/.test(bag)
  ) {
    return {
      lora_name: lingerieFile,
      lora_strength_model: 0.62,
      lora_strength_clip: 0.62,
      trigger_words: [],
      note: 'outfit-lingerie',
    };
  }

  if (/pear|wide hips|big ass|thick thighs|booty/.test(bag) && !/hourglass|busty/.test(bag)) {
    return {
      lora_name: pearFile,
      lora_strength_model: 0.55,
      lora_strength_clip: 0.55,
      trigger_words: [],
      note: 'body-pear',
    };
  }
  if (
    opts?.preferBody ||
    /curvy|busty|hourglass|voluptuous|large breasts|slim waist/.test(bag)
  ) {
    return {
      lora_name: bodyFile,
      lora_strength_model: 0.55,
      lora_strength_clip: 0.55,
      trigger_words: [],
      note: 'body-curvy-light',
    };
  }

  if (/skin|pores|detail|texture/.test(bag)) {
    return {
      lora_name: skinFile,
      lora_strength_model: 0.4,
      lora_strength_clip: 0.4,
      trigger_words: [],
      note: 'detail-skin',
    };
  }
  if (/hyperreal|aidma|ultra realistic/.test(bag)) {
    return {
      lora_name: hyperFile,
      lora_strength_model: 0.5,
      lora_strength_clip: 0.5,
      trigger_words: [],
      note: 'style-hyperreal',
    };
  }

  return {
    lora_name: styleFile,
    lora_strength_model: 0.55,
    lora_strength_clip: 0.55,
    trigger_words: [],
    note: 'style-photoreal',
  };
}

/** Public plan: never request a LoRA that is not on the volume. */
export function resolveGirlfriendLoraPlan(
  subject: GirlfriendSubject,
  sceneId?: string,
  opts?: { preferBody?: boolean; preferOutfit?: boolean; preferNsfwPose?: boolean },
): GirlfriendLoraPlan {
  const plan = resolveGirlfriendLoraPlanRaw(subject, sceneId, opts);
  // Prefer body/style when pose/outfit missing on disk
  const safe = sanitizeLoraForVolume(plan.lora_name, {
    fallback: pickInstalledLora([
      process.env.GIRLFRIEND_STYLE_LORA,
      process.env.RUNPOD_DEFAULT_LORA,
      'flux_style_photoreal_v1.safetensors',
      'flux_body_curvy_v1.safetensors',
      'flux_detail_skin_v1.safetensors',
    ]),
  });
  if (!safe.changed) return plan;
  return {
    ...plan,
    lora_name: safe.lora_name,
    note: safe.lora_name
      ? `${plan.note}->fallback:${safe.lora_name}`
      : `${plan.note}->no-lora`,
    // keep strength moderate for style fallback
    lora_strength_model: safe.lora_name?.includes('style')
      ? Math.min(plan.lora_strength_model, 0.55)
      : plan.lora_strength_model,
    lora_strength_clip: safe.lora_name?.includes('style')
      ? Math.min(plan.lora_strength_clip, 0.55)
      : plan.lora_strength_clip,
  };
}
