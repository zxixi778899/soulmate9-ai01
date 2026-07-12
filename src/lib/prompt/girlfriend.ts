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
  'photorealistic, fair luminous skin, even skin tone, natural pores, well-lit face, bright clean exposure, lively eyes with catchlights, sharp focus';

/**
 * Soft figure hint — keep short so face/pose still dominate.
 * Avoid fixed lingerie / same body spam that collapses variety.
 */
export const GIRLFRIEND_BODY_FIXED =
  'feminine curves, attractive adult figure, natural proportions';

/** Default framing for companion cards: face the viewer (not back/side template). */
export const GIRLFRIEND_FRAMING =
  'facing viewer, eye contact, front three-quarter view, natural candid pose';

/**
 * Short negatives — FLUX hates long SD negative lists.
 * Include anti-template tokens for the back/side lingerie collapse.
 */
export const GIRLFRIEND_NEGATIVE =
  'blurry, deformed, bad anatomy, extra fingers, underexposed, dark muddy skin, dull lifeless eyes, stiff expression, ' +
  'from behind, back view, looking away, same pose, identical outfit, plastic skin, oversmoothed, ' +
  'child, underage, watermark, text, logo, cartoon, anime';

/** Short FLUX-safe negative (empty only when caller opts in) */
export const GIRLFRIEND_NEGATIVE_FLUX =
  'from behind, back view, looking away, underexposed, dark muddy skin, stiff expression, blurry, deformed, child, underage, watermark';

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
      'standing at glass railing facing camera, one hand on rail, confident smile, medium full-body',
      'leaning elbows on railing facing viewer, shoulders open, candid laugh, three-quarter body',
      'walking toward camera on rooftop, hair moving, direct eye contact, full-body',
      'sitting on outdoor lounge chair facing camera, legs crossed, relaxed editorial pose',
    ],
    outfits: [
      'fitted red satin crop top and black trousers',
      'metallic evening mini dress',
      'black blazer over lace cami and jeans',
      'emerald green bodycon dress',
      'white silk blouse and leather skirt',
    ],
    env: 'luxury rooftop at night, city skyline soft bokeh',
    light: 'bright front key light on face, cool city ambient background, warm rim on hair, subject clearly exposed',
    match: /rooftop|night|city|skyline|club|glam|neon|evening/i,
  },
  {
    id: 'mirror_selfie',
    label: 'Mirror selfie',
    poses: [
      'bathroom mirror selfie facing mirror, phone in hand, free hand in hair, hip slightly popped, high angle front view',
      'front-facing mirror selfie, both shoulders visible, playful pout, phone at chest height',
      'mirror selfie with peace sign, leaning toward glass, bright smile',
      'mirror selfie holding phone with both hands, straight-on torso, candid after-party energy',
    ],
    outfits: [
      'black graphic crop tee and ripped jeans',
      'oversized band hoodie and shorts',
      'red tank top and denim mini skirt',
      'sports bra and track pants',
      'striped long-sleeve and cargo pants',
    ],
    env: 'tiled bathroom with vanity lights',
    light: 'bright phone flash on face, pale glossy skin highlights, hard flash catchlights, clear exposure',
    match: /selfie|mirror|bathroom|flash|tattoo|casual|party/i,
  },
  {
    id: 'city_apartment',
    label: 'Apartment couch',
    poses: [
      'sitting on couch facing camera, elbows on thighs, calm direct eye contact, eye-level portrait',
      'curled sideways on sofa facing viewer, chin on hand, soft smile',
      'standing in living room facing camera, weight on one hip, arms relaxed',
      'kneeling on rug facing camera with hands on knees, friendly smile, medium shot',
    ],
    outfits: [
      'teal velvet corset top and denim shorts',
      'cream knit sweater dress',
      'striped button-up shirt and black skirt',
      'soft pink cardigan over white top',
      'casual hoodie and yoga pants',
    ],
    env: 'modern apartment living room, soft pillows, night city prints on wall',
    light: 'bright warm indoor key light on face, soft fill, clean skin exposure, background slightly dimmer',
    match: /apartment|couch|indoor|living room|soft glam|home/i,
  },
  {
    id: 'window_sunlight',
    label: 'Window sunlight',
    poses: [
      'standing by window facing camera, soft smile, hand lightly on curtain, three-quarter body',
      'sitting on window seat facing viewer, knees up casually, golden light on face',
      'leaning back against window frame facing camera, relaxed shoulders',
      'close portrait by window facing viewer, hair catching sun, bright eyes',
    ],
    outfits: [
      'white linen blouse and light jeans',
      'floral summer dress',
      'soft yellow sundress',
      'beige knit top and skirt',
      'pale blue shirt dress',
    ],
    env: 'tall window, sheer curtains, airy home interior',
    light: 'bright golden window key on face, soft shadows, luminous fair skin, airy daylight',
    match: /window|sunlight|lace|morning|sheer|curtain/i,
  },
  {
    id: 'pink_bedroom',
    label: 'Bedroom',
    poses: [
      'sitting on bed facing camera, legs folded, bright smile, medium shot',
      'lying on stomach on bed facing viewer, chin on hands, playful eyes',
      'sitting at edge of bed facing camera, one knee up, soft laugh',
      'kneeling on bed facing camera, hands on sheets, lively expression',
    ],
    outfits: [
      'pastel pink satin sleep set',
      'black lace bralette with high-waist shorts (front view)',
      'oversized white tee as sleepwear',
      'red silk camisole and shorts',
      'striped pajama top and shorts',
    ],
    env: 'pastel pink bedroom, LED accent lights, soft sheets',
    light: 'bright pink LED plus warm bedside key on face, glossy pale skin, cheerful well-lit bedroom',
    match: /bedroom|lingerie|pink|led|garter|stockings|kneeling|nsfw/i,
  },
  {
    id: 'gothic_throne',
    label: 'Throne fantasy',
    poses: [
      'seated on ornate throne facing camera, one hand on armrest, confident smirk, low-angle',
      'sitting upright on throne facing viewer, legs elegantly crossed, crown tilt',
      'leaning forward on throne armrest facing camera, intense eye contact',
      'standing beside throne facing camera, hand on chair back, power pose',
    ],
    outfits: [
      'black lace gown with sapphire jewelry',
      'dark velvet dress and silver crown',
      'structured black corset dress',
      'deep purple evening gown',
      'black leather and lace hybrid outfit',
    ],
    env: 'gothic set with controlled haze, dramatic props',
    light: 'strong bright key light on face and body, cool rim light, pale luminous skin, deep background only',
    match: /gothic|throne|queen|crown|dark|fantasy|dominant/i,
  },
  {
    id: 'cafe_day',
    label: 'Cafe daylight',
    poses: [
      'at cafe table facing camera, chin on hand, easy natural smile, 50mm portrait crop',
      'holding coffee cup with both hands facing viewer, soft laugh',
      'leaning toward table facing camera, elbows on wood, candid smile',
      'standing by cafe window facing camera, cup in one hand, lifestyle shot',
    ],
    outfits: [
      'cream sweater and jeans',
      'plaid shirt and skirt',
      'trench coat over simple top',
      'denim jacket and white tee',
      'soft green blouse and trousers',
    ],
    env: 'sunlit cafe window seat, coffee cup on table',
    light: 'bright soft daylight on face, clear catchlights, fresh fair skin, clean exposure',
    match: /cafe|coffee|daylight|brunch|casual date|day/i,
  },
  {
    id: 'car_night',
    label: 'Car night',
    poses: [
      'in passenger seat turned toward camera, soft intimate smile, close crop, face fully visible',
      'sitting in car facing viewer through open door, one arm on seat, bright face light',
      'driver seat selfie angle facing camera, hand on wheel edge, candid smile',
      'leaning across center console facing camera, intimate but front-facing',
    ],
    outfits: [
      'black date-night dress',
      'red off-shoulder top',
      'leather jacket over tank',
      'sparkly evening top',
      'simple white blouse',
    ],
    env: 'car interior at night, city lights through windows',
    light: 'bright practical key on face, soft neon color spill in background only, clear skin exposure',
    match: /car|night drive|neon|passenger|vehicle/i,
  },
  {
    id: 'beach_breeze',
    label: 'Beach breeze',
    poses: [
      'walking toward camera mid-step, hair wind-blown, bright natural smile, full-body',
      'standing on sand facing camera, hands in hair, open sky behind',
      'sitting on beach towel facing viewer, knees bent, playful smile',
      'jogging lightly toward camera, candid laugh, lifestyle wide shot',
    ],
    outfits: [
      'light summer sundress',
      'white linen shirt over swimsuit',
      'colorful bikini with sarong (front view)',
      'denim shorts and crop tee',
      'flowy beach cover-up',
    ],
    env: 'beach at golden hour, ocean behind',
    light: 'bright warm sun on face, soft hair rim light, open sky, luminous skin',
    match: /beach|ocean|summer|outdoor|wind|vacation/i,
  },
  {
    id: 'kitchen_morning',
    label: 'Kitchen morning',
    poses: [
      'standing at kitchen counter facing camera, mug in both hands, soft natural half-smile',
      'leaning on counter facing viewer, one heel lifted, relaxed morning pose',
      'sitting on counter edge facing camera, swinging feet, bright smile',
      'pouring coffee facing camera, candid domestic moment',
    ],
    outfits: [
      'oversized morning shirt and shorts',
      'soft robe over sleepwear',
      'simple tee and sweatpants',
      'knit cardigan and tank',
      'casual home dress',
    ],
    env: 'bright kitchen, morning routine',
    light: 'bright morning window light on face, clean soft shadows, fresh pale skin',
    match: /kitchen|morning|coffee home|domestic|cozy/i,
  },
  {
    id: 'studio_clean',
    label: 'Studio clean',
    poses: [
      'standing facing camera, weight on one hip, soft approachable smile, three-quarter body lookbook',
      'arms crossed lightly facing viewer, commercial smile, medium shot',
      'one hand in pocket facing camera, confident posture, fashion card pose',
      'seated on stool facing camera, hands on knees, clean portrait crop',
    ],
    outfits: [
      'premium black cocktail dress',
      'white tailored blazer dress',
      'red power dress',
      'navy silk blouse and trousers',
      'designer casual chic set',
    ],
    env: 'seamless studio backdrop, premium companion card look',
    light: 'large bright softbox key on face, gentle fill, fair luminous skin, clean commercial exposure',
    match: /studio|clean|portrait|card|profile|simple/i,
  },
  {
    id: 'golden_hour',
    label: 'Golden hour outdoor',
    poses: [
      'walk-and-turn toward camera, hair catching wind, warm natural smile to viewer',
      'standing in park facing camera, soft golden light, candid lifestyle pose',
      'sitting on outdoor steps facing viewer, elbows on knees, relaxed smile',
      'close outdoor portrait facing camera, sun on face, lively eyes',
    ],
    outfits: [
      'flowy midi dress',
      'denim jacket and sundress',
      'white tee and light skirt',
      'pastel blouse and jeans',
      'casual linen set',
    ],
    env: 'outdoors at golden hour, lifestyle companion moment',
    light: 'warm low sun fully lighting face and shoulders, bright golden exposure, luminous skin',
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
    'oval face, soft cheekbones, light freckles, clear fair skin, soft natural makeup',
    'heart-shaped face, defined jaw, bold eyeliner, glossy lips, luminous pale skin',
    'round youthful face, full cheeks, dewy fair skin, soft pink makeup',
    'long face, high cheekbones, sharp brows, minimal makeup, bright even complexion',
    'diamond face shape, almond eyes, subtle contour, nude lips, porcelain-fair skin',
    'soft square jaw, thick lashes, light freckles, healthy fair glow',
    'narrow chin, wide-set eyes, messy baby hairs, no heavy foundation, fresh pale skin',
    'soft angular face, beauty mark near lip, smoky eye, clear bright skin',
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
  if (/shy|soft|gentle|innocent/.test(p)) return 'soft natural half-smile, relaxed cheeks, warm shy eyes';
  if (/playful|brat|tease|flirty/.test(p)) return 'cheeky real smile, lively eyes, tiny nose wrinkle';
  if (/dominant|confident|queen|bold/.test(p)) return 'confident soft smirk, relaxed jaw, intense but natural eyes';
  if (/romantic|caring|sweet/.test(p)) return 'warm affectionate smile, soft eye crinkles';

  const byScene: Record<string, string> = {
    mirror_selfie: 'cheeky pout or tiny tongue tip, playful eyes, natural micro-expression',
    rooftop_night: 'soft glamorous smile, lively eyes, relaxed mouth',
    pink_bedroom: 'bright over-shoulder smile, playful eyes',
    gothic_throne: 'slight parted lips, controlled smirk, alive eyes',
    window_sunlight: 'gentle over-shoulder smile, soft real expression',
    cafe_day: 'easy candid smile, natural laugh lines',
    car_night: 'intimate soft smile, relaxed face',
    beach_breeze: 'bright natural smile, wind-kissed cheeks',
    kitchen_morning: 'sleepy soft smile, relaxed eyelids',
    studio_clean: 'approachable soft smile, commercial but natural',
    golden_hour: 'warm natural smile to viewer',
    city_apartment: 'calm soft smile, direct friendly eyes',
  };
  return byScene[scene.id] || 'natural soft smile, lively eyes, relaxed facial muscles';
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
    outfit:
      (row.outfit as string) ||
      (row.current_outfit as string) ||
      (meta.outfit as string) ||
      (cardApp.outfit as string) ||
      undefined,
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

    const { pose, outfit } = pickScenePoseAndOutfit(fixedSubject, scene);

  // Order: who → body → FRONT-FACING pose → outfit → place → light → expression → quality
  // Companion cards must face the viewer; avoid mass back/side lingerie templates.
  const positive = trimPrompt(
    joinParts([
      subjectClause,
      GIRLFRIEND_BODY_FIXED,
      pose,
      outfit,
      scene.env,
      scene.light,
      expression,
      GIRLFRIEND_FRAMING,
      metaBits,
      extra,
      GIRLFRIEND_QUALITY_PREFIX,
    ]),
  );

  // Default: short anti-underexposure negative (user issue: dark muddy faces).
  // Pass useEmptyNegative: true only for pure FLUX workers that black-frame on any neg.
  const negative =
    opts?.useEmptyNegative === true ? '' : GIRLFRIEND_NEGATIVE;

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
