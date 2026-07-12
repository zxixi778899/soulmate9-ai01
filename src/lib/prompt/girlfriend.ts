/**
 * Girlfriend card image prompt preset — optimized for FLUX.1
 *
 * Design goals (from premium reference set):
 * - Read character traits (hair/eyes/body/personality/style) first
 * - Scene-driven life: rooftop night / selfie / apartment / window light / bedroom / fantasy throne
 * - Vivid pose + micro-expression + lighting story (not flat template spam)
 * - FLUX prefers short natural captions; keep empty/minimal negatives
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

/** Photoreal quality — sharp, bright, FLUX-friendly (applied once) */
export const GIRLFRIEND_QUALITY_PREFIX =
  'RAW photo, masterpiece, best quality, ultra photorealistic, 8k uhd, ' +
  'highly detailed face and eyes, detailed skin texture with natural pores and subtle freckles, ' +
  'sharp focus, crisp micro details, professional photography, ' +
  'shot on Canon EOS R5, 50mm lens, vibrant color grade, high dynamic range';

/**
 * Sensual figure tokens — applied for girlfriend cards, but not the whole story.
 */
export const GIRLFRIEND_BODY_FIXED =
  'curvy hourglass figure, full bust, slim waist, wide hips, thick thighs, ' +
  'soft feminine curves, sexy allure, confident body language';

/** Default framing when no scene is chosen */
export const GIRLFRIEND_FRAMING =
  'three-quarter body portrait, head to mid-thighs, dynamic natural pose, ' +
  'looking at viewer, centered composition, immersive environment';

/**
 * FLUX: keep negatives short or empty.
 * Long SD-style negatives frequently yield black / washed images.
 */
export const GIRLFRIEND_NEGATIVE =
  'blurry, low quality, worst quality, deformed, bad anatomy, extra fingers, ' +
  'child, underage, watermark, text, logo, cartoon, anime, plastic skin, oversmoothed';

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
  /** Optional explicit scene id from admin UI / metadata */
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
  | 'studio_clean'
  | 'golden_hour'
  | 'auto';

type SceneRecipe = {
  id: Exclude<GirlfriendSceneId, 'auto'>;
  label: string;
  /** Environment + wardrobe vibe */
  scene: string;
  pose: string;
  light: string;
  mood: string;
  /** keywords that route auto-pick here */
  match: RegExp;
};

/**
 * Reference-inspired scene library (more vivid than one static template).
 */
export const GIRLFRIEND_SCENE_RECIPES: SceneRecipe[] = [
  {
    id: 'rooftop_night',
    label: 'Rooftop night glam',
    scene:
      'on a luxury rooftop terrace at night, city skyline and warm building lights behind her, ' +
      'shiny red snakeskin crop top and matching high-waist leggings, diamond earrings and delicate pendant necklace',
    pose:
      'leaning forward over a glass table with both hands planted, arched back, chest forward, hips pushed out, ' +
      'chin slightly lifted, sultry eye contact',
    light:
      'blue twilight sky with stars, mixed city glow and cool rim light on shoulders, specular highlights on glossy fabric',
    mood: 'high-fashion nightlife energy, expensive and untouchable',
    match: /rooftop|night|city|skyline|club|glam|neon|evening/i,
  },
  {
    id: 'mirror_selfie',
    label: 'Bathroom mirror selfie',
    scene:
      'candid bathroom mirror selfie, tiled walls and white door behind her, phone in one hand, ' +
      'cropped black graphic tee lifted under her chest, low-rise ripped blue jeans, tattoos and navel piercing accents if fitting',
    pose:
      'one arm raised into messy wavy hair, hip cocked, casual mirror lean, intimate phone selfie angle from slightly above',
    light: 'harsh on-camera flash mixed with warm indoor bathroom light, hard shadows, skin sheen',
    mood: 'raw after-party energy, playful bratty confidence',
    match: /selfie|mirror|bathroom|flash|tattoo|casual|party girl|messy/i,
  },
  {
    id: 'city_apartment',
    label: 'City apartment couch',
    scene:
      'sitting on a beige sofa in a pink apartment living room, framed night city skyline prints on the wall, ' +
      'teal velvet corset top with gold hooks, tiny frayed denim shorts, soft throw pillows nearby',
    pose:
      'upright on the couch edge, thighs together, palms resting on the cushions, calm direct gaze, elegant posture',
    light: 'warm room light plus cool city lights through windows, clean editorial portrait lighting',
    mood: 'polished girlfriend-next-door luxury, quietly seductive',
    match: /apartment|couch|corset|denim|indoor|living room|soft glam/i,
  },
  {
    id: 'window_sunlight',
    label: 'Lace window sunlight',
    scene:
      'standing by a tall window with white lace curtains, soft domestic interior, intimate morning atmosphere',
    pose:
      'body turned in a three-quarter twist toward the window, looking back over her shoulder with a gentle smile, ' +
      'one hand on the curtain, natural hip curve emphasized',
    light:
      'strong golden side sunlight, lace shadow patterns cast across bare skin, glowing highlights and deep warm shadows',
    mood: 'sun-warmed intimacy, soft and erotic without stiffness',
    match: /window|sunlight|lace|morning|golden|sheer|curtain|nude soft/i,
  },
  {
    id: 'pink_bedroom',
    label: 'Pink neon bedroom',
    scene:
      'kneeling on a pastel pink bed with plush toys and LED strip lights, photo wall behind her, ' +
      'black lingerie with garter straps and sheer stockings, glossy skin',
    pose:
      'on all fours / kneeling lean, back arched, looking back over her shoulder with a bright mischievous smile, ' +
      'booty-forward composition, intimate close three-quarter framing',
    light: 'pink LED glow, soft bedside lamp warmth, wet-skin specular highlights',
    mood: 'playful NSFW girlfriend energy, flirty and inviting',
    match: /bedroom|lingerie|pink|led|garter|stockings|kneeling|nsfw soft/i,
  },
  {
    id: 'gothic_throne',
    label: 'Gothic throne fantasy',
    scene:
      'seated on an ornate black gothic throne with smoke and dramatic props, ' +
      'black lace lingerie bodysuit, jeweled crown and sapphire jewelry, dark royal atmosphere',
    pose:
      'legs open throne sit, one hand near her body, theatrical expression with parted lips and tongue tip, ' +
      'dominant seductive energy, cinematic low angle',
    light: 'volumetric god rays, smoke haze, high-contrast studio glamour lighting',
    mood: 'dark queen fantasy, erotic power pose',
    match: /gothic|throne|queen|crown|dark|fantasy|lace black|dominant/i,
  },
  {
    id: 'studio_clean',
    label: 'Clean studio portrait',
    scene: 'seamless studio backdrop, fashion lookbook styling, premium companion card presentation',
    pose: 'confident standing three-quarter pose, weight on one hip, looking at viewer',
    light: 'bright softbox key light, clean fill, no muddy shadows',
    mood: 'commercial beauty, clear and marketable',
    match: /studio|clean|portrait|card|profile|simple/i,
  },
  {
    id: 'golden_hour',
    label: 'Golden hour outdoor',
    scene: 'outdoors at golden hour, soft wind in hair, lifestyle companion moment',
    pose: 'natural walk-stop pose, slight lean, warm smile to viewer',
    light: 'warm low sun on face and shoulders, bright well-lit subject, crisp edges',
    mood: 'romantic and approachable',
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

/** Resolve a short person name; never return a full image caption */
export function resolvePersonName(raw?: string | null, fallback = 'a stunning young woman'): string {
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
 * Pick a scene from explicit id, metadata text, tags, or stable name hash.
 */
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

  // Personality routing
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

  // Stable variety per character so gallery does not look identical
  const seed = `${subject.name || ''}|${subject.hairColor || ''}|${subject.eyes || ''}`;
  const idx = hashPick(seed || 'default', GIRLFRIEND_SCENE_RECIPES.length);
  return GIRLFRIEND_SCENE_RECIPES[idx] || GIRLFRIEND_SCENE_RECIPES[0];
}

/**
 * Expression / vibe from personality tags — keeps faces alive.
 */
export function buildExpressionClause(subject: GirlfriendSubject, scene: SceneRecipe): string {
  const p = (subject.personality || subject.mood || '').toLowerCase();
  if (/shy|soft|gentle|innocent/.test(p)) {
    return 'soft parted lips, warm half-smile, slightly bashful eyes, tender gaze';
  }
  if (/playful|brat|tease|flirty/.test(p)) {
    return 'mischievous smile, flirty eye contact, playful energy, lively expression';
  }
  if (/dominant|confident|queen|bold/.test(p)) {
    return 'confident sultry stare, controlled seduction, powerful presence';
  }
  if (/romantic|caring|sweet/.test(p)) {
    return 'affectionate gaze, soft smile, intimate eye contact';
  }
  // Scene default micro-expression
  if (scene.id === 'mirror_selfie') return 'bratty mirror-face, lips slightly pouted, cheeky confidence';
  if (scene.id === 'rooftop_night') return 'sultry open-mouth breath, glossy lips, elevated glam stare';
  if (scene.id === 'pink_bedroom') return 'bright flirty smile over the shoulder, inviting eyes';
  if (scene.id === 'gothic_throne') return 'dramatic erotic expression, tongue tip, hypnotic allure';
  if (scene.id === 'window_sunlight') return 'gentle over-shoulder smile, sunlit freckles, soft eyes';
  return 'seductive expression, soft parted lips, alive eye contact';
}

/**
 * Build trait clause from girlfriend features (reads card fields).
 * Written as a readable sentence for FLUX.
 */
export function buildSubjectClause(s: GirlfriendSubject): string {
  const name = resolvePersonName(s.name, 'a stunningly beautiful young woman');
  const parts: string[] = [
    `photorealistic portrait of ${name}`,
    'gorgeous young adult woman age 23-28',
  ];

  if (s.race) parts.push(`${s.race} ethnicity`);
  if (s.hair || s.hairColor) {
    parts.push(`beautiful ${[s.hairColor, s.hair].filter(Boolean).join(' ')} hair`.trim());
  }
  if (s.eyes) parts.push(`${s.eyes} eyes with catchlights`);
  if (s.body) parts.push(`${s.body} figure`);
  // style should be short outfit cue, not a full prompt
  if (s.style && !looksLikeFluxPrompt(s.style)) {
    parts.push(`personal style: ${String(s.style).slice(0, 80)}`);
  }
  if (s.occupation && !looksLikeFluxPrompt(s.occupation)) {
    parts.push(String(s.occupation).slice(0, 60));
  }
  // Only append short appearance notes — never re-paste a full assembled prompt
  if (s.appearance && !looksLikeFluxPrompt(s.appearance)) {
    const a = sanitizeBlurKeywords(s.appearance);
    if (a) parts.push(a.slice(0, 160));
  }

  const tags = normalizeTags(s.tags).slice(0, 6);
  if (tags.length) parts.push(tags.join(', '));

  return parts.join(', ');
}

/**
 * Map a girlfriend DB / list row into GirlfriendSubject.
 */
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

  // Prefer structured appearance; skip full captions that would re-stack
  let appearance: string | undefined;
  const cand = appearanceField || imagePrompt;
  if (cand && !looksLikeFluxPrompt(cand)) {
    appearance = cand;
  } else if (cand && looksLikeFluxPrompt(cand)) {
    const stripped = stripQualityBoilerplate(cand).slice(0, 120);
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

function trimPrompt(positive: string, max = 980): string {
  let out = positive
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (out.length > max) {
    out = out.slice(0, max);
    const lastComma = out.lastIndexOf(',');
    if (lastComma > max * 0.75) out = out.slice(0, lastComma);
  }
  return out.trim();
}

/**
 * Assemble full girlfriend card prompt:
 * traits first → scene life → body → expression → quality.
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

  // Full captions from UI/DB must never be re-stacked — rebuild from subject instead
  const rawIsFullCaption =
    rawIn.length > 120 &&
    (/three-quarter|looking at viewer|hourglass|large breasts|photorealistic three-quarter|raw photo|masterpiece/i.test(
      rawIn,
    ) ||
      looksLikeFluxPrompt(rawIn));

  const subjectClause = buildSubjectClause(fixedSubject);
  const rawStripped = rawIsFullCaption ? '' : stripQualityBoilerplate(rawIn);
  const extra =
    rawStripped &&
    rawStripped.length > 8 &&
    !subjectClause.toLowerCase().includes(rawStripped.toLowerCase().slice(0, 40))
      ? rawStripped.slice(0, 180)
      : '';

  // Optional lighting/appearance from generate-meta
  const metaBits = joinParts([
    ctx.metadata?.appearance && !looksLikeFluxPrompt(ctx.metadata.appearance)
      ? sanitizeBlurKeywords(String(ctx.metadata.appearance)).slice(0, 120)
      : '',
    ctx.metadata?.lighting ? sanitizeBlurKeywords(String(ctx.metadata.lighting)).slice(0, 80) : '',
  ]);

  const positive = trimPrompt(
    joinParts([
      GIRLFRIEND_QUALITY_PREFIX,
      subjectClause,
      GIRLFRIEND_BODY_FIXED,
      scene.scene,
      scene.pose,
      scene.light,
      expression,
      scene.mood,
      metaBits,
      extra,
      'same woman identity consistent, natural anatomy, vivid storytelling portrait',
    ]),
  );

  const negative =
    opts?.useEmptyNegative === false ? GIRLFRIEND_NEGATIVE : GIRLFRIEND_NEGATIVE_FLUX;

  return { positive, negative };
}

/**
 * Convenience: build prompt directly from a girlfriend list/DB row.
 * Defaults to empty negative for FLUX stability.
 */
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
