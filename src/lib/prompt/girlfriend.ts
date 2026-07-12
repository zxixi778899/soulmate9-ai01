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
  'stunning beautiful woman, refined glamorous makeup, glossy lips, long lashes, flawless dewy skin, bright high-key beauty lighting, sexy alluring presence, photorealistic, sharp focus'

/**
 * Soft figure hint — keep short so face/pose still dominate.
 * Avoid fixed lingerie / same body spam that collapses variety.
 */
export const GIRLFRIEND_BODY_FIXED =
  'gorgeous hourglass figure, slim waist, full breasts, round hips, long toned legs, sexy feminine body'

/** Default framing for companion cards: face the viewer (not back/side template). */
export const GIRLFRIEND_FRAMING =
  'facing viewer, eye contact, three-quarter body or full body, show chest and hips or long legs, not face-only close-up, Instagram AI-girlfriend card'

/**
 * Short negatives — FLUX hates long SD negative lists.
 * Include anti-template tokens for the back/side lingerie collapse.
 */
export const GIRLFRIEND_NEGATIVE =
  'blurry, deformed, bad anatomy, extra fingers, underexposed, dark muddy skin, dull lifeless eyes, stiff expression, plain looking, ' +
  'face-only close-up, headshot only, cropped at shoulders, baggy oversized hoodie hiding body, from behind, back view, looking away, ' +
  'plastic skin, oversmoothed, child, underage, watermark, text, logo, cartoon, anime'

/** Short FLUX-safe negative (empty only when caller opts in) */
export const GIRLFRIEND_NEGATIVE_FLUX =
  'face-only close-up, headshot only, underexposed, dark muddy skin, baggy hoodie, from behind, stiff expression, blurry, deformed, child, underage, watermark'

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
      'standing full body facing camera on rooftop, hand on hip, chest out, long legs visible, sexy confident pose',
      'three-quarter body at glass railing facing viewer, arched back, show bust and hips, glamorous night pose',
      'walking toward camera full body, hips swaying, long legs, eye contact, sexy nightlife energy',
      'leaning on railing three-quarter body facing camera, cleavage visible, hourglass silhouette',
    ],
    outfits: [
      'tight red mini dress, deep neckline, bodycon fit',
      'black sequin crop top and high-waist mini skirt',
      'shiny satin slip dress hugging curves',
      'fitted leather pants and low-cut glam top',
      'emerald bodycon dress with thigh slit',
    ],
    env: 'luxury rooftop at night, city skyline bokeh',
    light: 'bright beauty key light on face and body, high-key subject exposure, city lights only in background',
    match: /rooftop|night|city|skyline|club|glam|neon|evening/i,
  },
  {
    id: 'mirror_selfie',
    label: 'Mirror selfie',
    poses: [
      'full-body bathroom mirror selfie facing mirror, phone in hand, hip popped, show waist hips and legs',
      'three-quarter mirror selfie facing camera, arched back, chest and hips visible, sexy Instagram pose',
      'mirror selfie from slightly high angle, body angled to show curves, long legs, flirty face',
      'standing mirror selfie, one hand in hair, body-focused framing, not face crop',
    ],
    outfits: [
      'tight crop top and tiny shorts showing midriff and legs',
      'fitted tank top and low-rise jeans hugging hips',
      'sexy lingerie set with sheer robe, front view',
      'sports bra and high-waist shorts, toned body',
      'bodycon mini dress, deep neckline',
    ],
    env: 'bright bathroom vanity mirror, clean tiles',
    light: 'bright vanity lights plus phone flash on face and body, pale glossy skin, high exposure beauty selfie',
    match: /selfie|mirror|bathroom|flash|tattoo|casual|party/i,
  },
  {
    id: 'city_apartment',
    label: 'Apartment couch',
    poses: [
      'sitting on couch three-quarter body facing camera, legs angled, bust and hips visible, sexy relaxed pose',
      'standing in living room full body facing viewer, hand on hip, long legs, hourglass silhouette',
      'kneeling on couch facing camera, arched back, show chest and waist, flirty look',
      'sitting on armrest three-quarter body, crossed legs, cleavage visible, glamorous home look',
    ],
    outfits: [
      'tight satin camisole and mini shorts',
      'deep-v bodycon dress',
      'crop sweater and high-waist skirt showing waist',
      'lace bodysuit with jeans, curves visible',
      'silk slip dress clinging to body',
    ],
    env: 'stylish modern apartment living room',
    light: 'bright warm beauty light on face and body, high exposure, soft fill, not dim ambient only',
    match: /apartment|couch|indoor|living room|soft glam|home/i,
  },
  {
    id: 'window_sunlight',
    label: 'Window sunlight',
    poses: [
      'standing by window three-quarter body facing camera, hand on curtain, bust and hips visible',
      'full body by window facing viewer, weight on one hip, long legs, sexy soft smile',
      'sitting on window seat three-quarter body, legs extended, body-focused framing',
      'leaning on window frame three-quarter body, arched posture, glamorous daylight beauty',
    ],
    outfits: [
      'sheer white blouse over lace bralette and skirt',
      'tight sundress with cleavage and leg slit',
      'crop top and high-waist shorts',
      'satin camisole dress',
      'body-hugging knit dress',
    ],
    env: 'tall bright window, airy interior',
    light: 'bright golden beauty light on face and body, luminous skin, high-key daylight exposure',
    match: /window|sunlight|lace|morning|sheer|curtain/i,
  },
  {
    id: 'pink_bedroom',
    label: 'Bedroom',
    poses: [
      'sitting on bed three-quarter body facing camera, knees slightly apart, chest and hips visible, sexy smile',
      'kneeling on bed facing camera, arched back, show bust waist hips, glamorous pose',
      'lying on side on bed three-quarter body facing viewer, curves emphasized, long legs',
      'standing by bed full body facing camera, hand in hair, lingerie body showcase',
    ],
    outfits: [
      'sexy matching lingerie set, front view, curves visible',
      'sheer babydoll nightie',
      'silk camisole and lace panties',
      'tight sleep shorts and crop top',
      'black lace bodysuit',
    ],
    env: 'pastel pink bedroom, soft sheets, LED accents',
    light: 'bright pink beauty key plus warm bedside fill on face and body, glossy pale skin, high exposure',
    match: /bedroom|lingerie|pink|led|garter|stockings|kneeling|nsfw/i,
  },
  {
    id: 'gothic_throne',
    label: 'Throne fantasy',
    poses: [
      'seated on throne three-quarter body facing camera, legs posed to show long legs and hips, power sexy pose',
      'sitting upright on throne full torso and hips visible, cleavage, crown, facing viewer',
      'leaning forward on throne three-quarter body, bust emphasized, seductive eye contact',
      'standing beside throne full body, hand on chair, long legs, glamorous dark queen pose',
    ],
    outfits: [
      'black lace lingerie gown with high slit',
      'dark velvet corset dress, deep neckline',
      'structured black mini dress with garter details',
      'purple satin gown hugging curves',
      'black leather-and-lace bodysuit',
    ],
    env: 'gothic set, controlled haze, dramatic props',
    light: 'strong bright beauty key on face and body, cool rim only, pale luminous skin, not underexposed',
    match: /gothic|throne|queen|crown|dark|fantasy|dominant/i,
  },
  {
    id: 'cafe_day',
    label: 'Cafe daylight',
    poses: [
      'sitting at cafe table three-quarter body facing camera, crossed legs, bust visible, pretty smile',
      'standing by cafe window full body facing viewer, hand on hip, long legs, stylish sexy casual',
      'leaning on table three-quarter body, subtle cleavage, glamorous casual pose',
      'walking into frame full body toward camera, hourglass silhouette, lifestyle beauty',
    ],
    outfits: [
      'tight blouse and mini skirt',
      'bodycon midi dress with neckline',
      'crop cardigan over fitted top and shorts',
      'denim mini skirt and fitted tee',
      'satin cami and high-waist trousers showing waist',
    ],
    env: 'bright sunlit cafe',
    light: 'bright daylight beauty light on face and body, high exposure, clear catchlights',
    match: /cafe|coffee|daylight|brunch|casual date|day/i,
  },
  {
    id: 'car_night',
    label: 'Car night',
    poses: [
      'sitting in car three-quarter body turned to camera, bust and waist visible, sexy night look',
      'standing outside open car door full body facing viewer, long legs, hand on door, glamorous pose',
      'passenger seat body-focused three-quarter crop facing camera, cleavage, flirty smile',
      'leaning on car hood full body, hip cocked, long legs, sexy editorial',
    ],
    outfits: [
      'tight red off-shoulder top and mini skirt',
      'black bodycon dress',
      'leather mini skirt and crop top',
      'sparkly low-cut club top and tight pants',
      'satin slip dress',
    ],
    env: 'car and city night lights',
    light: 'bright practical beauty light on face and body, neon only background, high subject exposure',
    match: /car|night drive|neon|passenger|vehicle/i,
  },
  {
    id: 'beach_breeze',
    label: 'Beach breeze',
    poses: [
      'full body walking toward camera on beach, long legs, hips swaying, sexy summer smile',
      'standing full body facing camera, hand in hair, bikini body showcase, hourglass figure',
      'three-quarter body on sand facing viewer, arched pose, bust and hips visible',
      'sitting on beach towel three-quarter body, long legs extended, glamorous vacation look',
    ],
    outfits: [
      'sexy bikini, front view, athletic glam body',
      'micro skirt cover-up over bikini',
      'wet-look white shirt dress open over swimsuit',
      'high-leg one-piece swimsuit',
      'crop top and tiny beach shorts',
    ],
    env: 'beach at golden hour, ocean behind',
    light: 'bright warm sun on face and body, high-key beach beauty lighting, luminous skin',
    match: /beach|ocean|summer|outdoor|wind|vacation/i,
  },
  {
    id: 'kitchen_morning',
    label: 'Kitchen morning',
    poses: [
      'standing at kitchen counter three-quarter body facing camera, oversized shirt slightly open, long legs',
      'full body in kitchen facing viewer, hip against counter, sexy casual morning pose',
      'sitting on counter three-quarter body, crossed legs, bust visible, flirty smile',
      'reaching for mug three-quarter body, arched posture, body-focused framing',
    ],
    outfits: [
      'oversized shirt barely covering sexy shorts',
      'silk robe loosely tied over lingerie',
      'tight tank top and tiny shorts',
      'crop tee and high-waist sleep shorts',
      'bodycon lounge dress',
    ],
    env: 'bright modern kitchen',
    light: 'bright morning beauty light on face and body, high exposure, fresh dewy skin',
    match: /kitchen|morning|coffee home|domestic|cozy/i,
  },
  {
    id: 'studio_clean',
    label: 'Studio clean',
    poses: [
      'three-quarter body fashion pose facing camera, hand on hip, show bust hips and waist, lookbook sexy',
      'full body studio pose facing viewer, long legs, model stance, hourglass silhouette',
      'three-quarter body with slight twist, chest toward camera, glamorous commercial beauty',
      'seated on stool three-quarter body, legs long in frame, sexy polished pose',
    ],
    outfits: [
      'tight black cocktail dress, deep neckline',
      'red bodycon dress',
      'white blazer dress with long legs bare',
      'lace bodysuit and tailored pants open blazer',
      'silk slip dress',
    ],
    env: 'clean seamless studio backdrop, premium AI girlfriend card',
    light: 'large bright beauty softbox on face and body, high-key commercial exposure, flawless skin',
    match: /studio|clean|portrait|card|profile|simple/i,
  },
  {
    id: 'golden_hour',
    label: 'Golden hour outdoor',
    poses: [
      'full body outdoor walk toward camera, long legs, hips visible, sexy warm smile',
      'three-quarter body golden hour facing viewer, hand in hair, bust and waist visible',
      'standing full body, weight on one hip, hourglass silhouette, glamorous lifestyle',
      'sitting on steps three-quarter body, legs long in frame, pretty sexy smile',
    ],
    outfits: [
      'flowy dress with leg slit and fitted bodice',
      'crop top and high-waist skirt',
      'tight sundress',
      'denim shorts and tied shirt showing midriff',
      'satin cami dress',
    ],
    env: 'outdoors at golden hour',
    light: 'bright warm beauty sunlight on face and body, high exposure golden glow, luminous skin',
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
    'symmetrical pretty face, high cheekbones, full glossy lips, long lashes, beauty makeup',
    'model-like face, refined jaw, smoky eyes, nude glossy lips, flawless skin',
    'soft glamorous face, doe eyes, pink blush, plump lips, dewy skin',
    'sharp pretty features, arched brows, cat-eye liner, glamorous contour',
    'classic beauty face, almond eyes, soft highlight, polished makeup',
    'sultry pretty face, bedroom eyes, glossy nude lips, luminous skin',
    'youthful glam face, bright eyes, soft contour, kissable lips',
    'elegant beauty face, defined cheekbones, red-tinted lips, runway makeup',
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
  if (/shy|soft|gentle|innocent/.test(p)) return 'soft glamorous smile, pretty eyes, refined makeup, shy allure';
  if (/playful|brat|tease|flirty/.test(p)) return 'flirty glamorous smile, seductive eyes, glossy lips';
  if (/dominant|confident|queen|bold/.test(p)) return 'confident seductive smirk, smoky eyes, glamorous makeup';
  if (/romantic|caring|sweet/.test(p)) return 'warm seductive smile, pretty eyes, polished makeup';

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
  return byScene[scene.id] || 'glamorous flirty smile, seductive eyes, polished beauty makeup';
}

/**
 * Traits only — face identity + hair/eyes/body from card.
 */
export function buildSubjectClause(s: GirlfriendSubject): string {
  const name = resolvePersonName(s.name, 'a beautiful young woman');
  const parts: string[] = [
    name,
    'stunningly beautiful young adult woman 23-28',
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
