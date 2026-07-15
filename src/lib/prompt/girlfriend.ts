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
  pickInstalledLora,
  sanitizeLoraForVolume,
  type LoraPlan,
  type LoraEntry,
  LORA_REGISTRY,
  getDefaultStyleLora,
  isLoraInstalled,
  planToLorasArray,
} from '@/lib/runpod-loras';
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
  'stunningly beautiful, seductive and alluring, soft glamorous makeup, glossy lips, bedroom eyes, flawless glowing skin, photorealistic editorial beauty photo, crisp detailed eyes, natural skin texture with pores, detailed flowing hair, high-resolution 8K detail, sharp focus on face, intimate and captivating, professional studio lighting, magazine cover quality, RAW photo, masterpiece'

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
      'standing at rooftop bar holding cocktail glass, one hand in pocket, candid night selfie',
      'sitting on rooftop bench, phone selfie angle, city skyline behind her',
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
      'sitting on bed taking mirror selfie, phone slightly above face, cozy pose',
      'full length mirror selfie in hallway, one hip popped, confident stance',
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
      'lying on sofa scrolling phone, legs up on armrest, candid home selfie',
      'sitting at dining table with wine glass, relaxed evening selfie angle',
      'kneeling on couch looking over backrest at camera, playful pose',
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
      'sitting cross-legged on floor by window, phone selfie in sunlight',
      'standing at balcony door, morning coffee in hand, natural light selfie',
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
      'lying on bed holding phone above for overhead selfie, hair spread on pillow',
      'sitting on floor leaning against bed, casual bedroom selfie',
      'kneeling on bed fixing hair in vanity mirror, candid getting-ready selfie',
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
      'reclining in ornate chair, one leg draped over armrest, dark editorial selfie',
      'standing before dark mirror, adjusting jewelry, moody reflection selfie',
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
      'sitting at cafe table with latte art, phone selfie with coffee cup in foreground',
      'standing outside cafe holding takeout cup, street style selfie',
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
      'in passenger seat taking selfie with phone, neon lights reflecting in window',
      'leaning out car window, night street selfie with city lights',
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
      'sitting on beach towel, phone selfie with ocean behind her, hair in breeze',
      'standing in shallow water, sunset selfie with wet skin glow',
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
      'sitting on kitchen counter eating fruit, casual morning selfie',
      'standing at sink with morning coffee, sleepy cute selfie angle',
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
      'sitting on studio stool, one knee up, casual portrait selfie angle',
      'leaning against studio wall, arms crossed, minimal backdrop selfie',
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
      'sitting on park bench, golden light selfie with warm bokeh background',
      'lying in grass looking up at camera, golden hour glow on face',
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
    'beautiful young adult woman 18-25',
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
  if (s.occupation) parts.push(`${s.occupation}`);
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
    'a stunningly beautiful seductive adult AI girlfriend, age 18-25',
    fixedSubject.race ? `${fixedSubject.race} features` : '',
    hair ? (/\bhair\b/i.test(hair) ? hair : `${hair} hair`) : '',
    fixedSubject.eyes ? `${fixedSubject.eyes} eyes` : '',
    fixedSubject.body ? `${fixedSubject.body} figure` : GIRLFRIEND_BODY_FIXED,
    personalityHint ? `${personalityHint} vibe` : '',
    fixedSubject.occupation ? `${fixedSubject.occupation}` : '',
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


﻿/**
 * Two-LoRA plan for girlfriend card generation.
 *
 * Primary  = style LoRA (photoreal / hyperreal) — always applied
 * Secondary = body or detail LoRA — applied when character traits warrant it
 *
 * Only references LoRAs that exist in LORA_REGISTRY (confirmed on volume).
 */

export type { LoraPlan };
export { planToLorasArray };

/** Backward-compat type alias */
export type GirlfriendLoraPlan = {
  lora_name: string | null;
  lora_strength_model: number;
  lora_strength_clip: number;
  trigger_words: string[];
  note: string;
  /** Extended two-LoRA plan */
  plan: LoraPlan;
};

function registryByCategory(cat: 'style' | 'body' | 'detail'): LoraEntry | undefined {
  return LORA_REGISTRY.find((e) => e.category === cat && isLoraInstalled(e.file));
}

function envOrDefault(envKey: string, fallback: LoraEntry): LoraEntry {
  const env = process.env[envKey];
  if (env) {
    const found = LORA_REGISTRY.find((e) => e.file === env || e.file.startsWith(env));
    if (found && isLoraInstalled(found.file)) return found;
  }
  return fallback;
}

/**
 * Build a two-LoRA plan from character traits.
 *
 * Decision tree:
 *   Primary  → always a style LoRA (photoreal by default, hyperreal for "hyperreal" keyword)
 *   Secondary →
 *     curvy/busty/hourglass keywords → body-curvy
 *     pear/wide-hips keywords        → body-pear
 *     skin/pores/texture keywords     → detail-skin
 *     (no match)                     → null (style only)
 */
export function buildLoraPlan(
  subject: GirlfriendSubject,
  sceneId?: string,
  opts?: { preferBody?: boolean; preferDetail?: boolean },
): LoraPlan {
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

  // ── Primary: style LoRA ──
  const defaultStyle = getDefaultStyleLora();
  let primary = envOrDefault('GIRLFRIEND_STYLE_LORA', defaultStyle);

  if (/hyperreal|aidma|ultra.?real/.test(bag)) {
    const hyper = LORA_REGISTRY.find(
      (e) => e.file.includes('hyperreal') && isLoraInstalled(e.file),
    );
    if (hyper) primary = hyper;
  }

  // ── Secondary: body or detail ──
  let secondary: LoraPlan['secondary'] = null;

  if (opts?.preferBody || /curvy|busty|hourglass|voluptuous|large breasts/.test(bag)) {
    const bodyCurvy = LORA_REGISTRY.find(
      (e) => e.file.includes('body_curvy') && isLoraInstalled(e.file),
    );
    if (bodyCurvy) {
      secondary = {
        name: bodyCurvy.file,
        strength_model: bodyCurvy.strength,
        strength_clip: bodyCurvy.strength,
        note: 'body-curvy',
      };
    }
  } else if (/pear|wide hips|big ass|thick thighs/.test(bag)) {
    const bodyPear = LORA_REGISTRY.find(
      (e) => e.file.includes('body_pear') && isLoraInstalled(e.file),
    );
    if (bodyPear) {
      secondary = {
        name: bodyPear.file,
        strength_model: bodyPear.strength,
        strength_clip: bodyPear.strength,
        note: 'body-pear',
      };
    }
  } else if (opts?.preferDetail || /skin|pores|texture|natural skin/.test(bag)) {
    const skin = LORA_REGISTRY.find(
      (e) => e.file.includes('detail_skin') && !e.file.includes('nplastic') && isLoraInstalled(e.file),
    );
    if (skin) {
      secondary = {
        name: skin.file,
        strength_model: skin.strength,
        strength_clip: skin.strength,
        note: 'detail-skin',
      };
    }
  }

  return {
    primary: {
      name: primary.file,
      strength_model: primary.strength,
      strength_clip: primary.strength,
      note: `style:${primary.file.split('_').slice(1, 3).join('-')}`,
    },
    secondary,
  };
}

/**
 * Backward-compatible wrapper: returns the old GirlfriendLoraPlan shape
 * plus the new LoraPlan for callers that support loras[].
 */
export function resolveGirlfriendLoraPlan(
  subject: GirlfriendSubject,
  sceneId?: string,
  opts?: { preferBody?: boolean; preferOutfit?: boolean; preferNsfwPose?: boolean },
): GirlfriendLoraPlan {
  const plan = buildLoraPlan(subject, sceneId, {
    preferBody: opts?.preferBody,
    preferDetail: false,
  });

  return {
    lora_name: plan.primary.name,
    lora_strength_model: plan.primary.strength_model,
    lora_strength_clip: plan.primary.strength_clip,
    trigger_words: [],
    note: plan.secondary
      ? `${plan.primary.note}+${plan.secondary.note}`
      : plan.primary.note,
    plan,
  };
}
