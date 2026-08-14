import { normalizeCompanionCategory, type CompanionCategory } from '@/lib/companion-category';
import { resolveCompanionProfile } from '@/lib/companion-profile';
import { buildStudioPromptEnhancement, compactFluxPrompt, studioNegativePrompt } from '@/lib/comfy-console/studio-profile';

const ACTIONS: Record<CompanionCategory, string[]> = {
  female: [
    'reclining on silk sheets, arching toward the camera with confident direct eye contact',
    'kneeling on a velvet couch, leaning closer with inviting adult body language',
    'standing beneath warm shower light, water tracing natural curves, looking at the viewer',
  ],
  male: [
    'sitting on the edge of a bed, shirt open, leaning toward the camera with intense eye contact',
    'standing after a shower with a towel low on the waist, water across a defined torso',
    'reclining on dark sheets, one arm behind the head, confident adult body language',
  ],
  transgender: [
    'posing confidently beside a bedroom mirror, celebrating an authentic adult body and identity',
    'reclining on silk sheets with elegant natural proportions and inviting direct eye contact',
    'standing in warm intimate light, confidently revealing an authentic adult silhouette',
  ],
  anime: [
    'in a luxurious fantasy bedroom, striking a provocative dynamic pose with direct eye contact',
    'reclining on illustrated silk sheets, mature expression, cinematic adult composition',
    'standing under neon light in a revealing fantasy outfit, confident mature body language',
  ],
};

export type CompanionGenerationResult = {
  category: CompanionCategory;
  baseInfo: string;
  action: string;
  quality: string;
  identitySpecification: string;
  positive: string;
  negative: string;
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableIdentityCue(row: Record<string, unknown>, salt: string, options: string[]): string {
  const seed = [row.id, row.slug, row.name, row.age, row.gender, salt].map((value) => String(value || '')).join('|');
  return options[stableHash(seed) % options.length] || options[0];
}

export function buildCompanionIdentitySpecification(row: Record<string, unknown>): string {
  const profile = resolveCompanionProfile(row);
  const exactAge = Math.max(18, Math.round(Number(row.age) || 25));
  const gender = profile.category === 'male'
    ? 'adult man'
    : profile.category === 'transgender'
      ? 'adult transgender woman'
      : 'adult woman';
  const faceShape = stableIdentityCue(row, 'face', [
    'oval face with high cheekbones',
    'heart-shaped face with a narrow chin',
    'soft square face with a defined jawline',
    'round face with full cheeks',
    'long face with elegant cheekbones',
    'diamond-shaped face with broad cheekbones',
  ]);
  const featureCue = stableIdentityCue(row, 'feature', [
    'straight narrow nose and softly arched brows',
    'small upturned nose and wide-set eyes',
    'prominent nose bridge and deep-set eyes',
    'full lower lip and thick straight brows',
    'defined cupid bow and gently hooded eyes',
    'subtle cheek dimples and naturally full lips',
    'light freckles across the nose and cheeks',
    'a small beauty mark near one cheek',
  ]);
  const explicitFeatures = [
    row.appearance_face,
    row.distinguishing_features,
    row.appearance_features,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(', ');
  const parts = [
    `${exactAge}-year-old ${gender}`,
    row.appearance_race ? `${String(row.appearance_race)} ethnicity and facial heritage` : '',
    row.appearance_hair_color ? `${String(row.appearance_hair_color)} hair color` : '',
    row.appearance_hair ? `${String(row.appearance_hair)} hairstyle` : '',
    row.appearance_eyes ? `${String(row.appearance_eyes)} eyes` : '',
    row.appearance_body ? `${String(row.appearance_body)} body build and proportions` : '',
    row.personality ? `${String(row.personality)} temperament and presence` : '',
    row.appearance_style ? `${String(row.appearance_style)} visual and wardrobe style` : '',
    explicitFeatures,
    faceShape,
    featureCue,
  ].filter(Boolean);
  return `Identity specification for ${String(row.name || 'this companion')}: ${parts.join('; ')}. Preserve this exact age, gender presentation, ethnicity, face geometry, hair, eyes, physique, temperament and signature features in every view; do not replace them with a generic beauty face.`;
}

/**
 * Brief identity cue for turnaround/reference sheets where COMPOSITION must
 * dominate the prompt. Includes enough visual detail for cross-view consistency
 * (face, body, style, height/weight) without the verbose face-geometry focus
 * that causes FLUX to crop to a headshot.
 */
export function buildCompanionIdentityBrief(row: Record<string, unknown>): string {
  const profile = resolveCompanionProfile(row);
  const age = Math.max(18, Math.round(Number(row.age) || 25));
  const gender = profile.category === 'male' ? 'man' : profile.category === 'transgender' ? 'trans woman' : 'woman';

  const heightCm = stableIdentityCue(row, 'height', [
    '165cm', '168cm', '170cm', '172cm', '175cm', '178cm', '180cm', '183cm', '185cm', '188cm',
  ]);

  // Keep brief — FLUX needs short prompts for full-body coherence
  const parts = [
    `${age}-year-old ${gender}`,
    row.appearance_race ? String(row.appearance_race) : '',
    row.appearance_hair_color && row.appearance_hair
      ? `${String(row.appearance_hair_color)} ${String(row.appearance_hair)} hair`
      : row.appearance_hair ? `${String(row.appearance_hair)} hair` : '',
    row.appearance_eyes ? `${String(row.appearance_eyes)} eyes` : '',
    row.appearance_body ? `${String(row.appearance_body)} build` : '',
    heightCm,
  ].filter(Boolean);
  return parts.join(', ');
}

export function buildCompanionAgeNegativePrompt(row: Record<string, unknown>): string {
  const age = Math.max(18, Math.round(Number(row.age) || 25));
  const texture = 'over-sharpened skin, exaggerated pores, harsh clarity, deep facial creases, waxy retouching';
  if (age <= 24) {
    return `middle-aged appearance, elderly appearance, aged face, deep wrinkles, pronounced crow's feet, weathered skin, sagging skin, ${texture}`;
  }
  if (age <= 34) {
    return `elderly appearance, prematurely aged face, deep wrinkles, pronounced crow's feet, weathered skin, ${texture}`;
  }
  return `incorrect apparent age, artificially aged face, ${texture}`;
}

function pick<T>(items: T[], seed = Math.random()): T {
  return items[Math.min(items.length - 1, Math.floor(seed * items.length))];
}

export type CompanionSceneIntensity = 1 | 2 | 3 | 4 | 5;

type RealSceneKind = 'home' | 'outdoor' | 'water' | 'mirror' | 'work' | 'nightlife' | 'intimate' | 'neutral';

const REAL_SCENE_DIRECTIONS: Record<RealSceneKind, string> = {
  home: 'Use soft window light or an ordinary practical lamp with neutral walls and believable household clutter. Show fabric compression against furniture, small wrinkles, and objects placed for use rather than decoration.',
  outdoor: 'Use weather-consistent daylight, restrained natural greens and sky tones, slight wind affecting hair and clothing, and grounded foot contact with the real surface. Keep the background recognisable instead of dissolving it into artificial bokeh.',
  water: 'Use physically plausible wet hair, irregular water droplets, damp fabric and reflected ambient light. Keep skin color neutral beneath the moisture and avoid glossy oil-like skin or blue-magenta color contamination.',
  mirror: 'Make the phone, reflected gaze, hand grip and reflection geometry agree. Use ordinary bathroom or dressing-room light, minor lens distortion and a casually imperfect crop instead of a polished advertisement pose.',
  work: 'Use credible task lighting and a lived-in workspace with touched objects, subtle clothing creases and hands genuinely handling a relevant prop. The subject is caught between actions rather than presenting a mannequin pose.',
  nightlife: 'Let colored signs remain mostly in the background while a neutral practical key light protects real skin tone. Keep blacks readable, saturation restrained and the environment grounded rather than bathing the entire body in cyan and magenta.',
  intimate: 'Use soft neutral bedside or window light, naturally compressed bedding, plausible support from the mattress or furniture, and clear contact points. Preserve real skin variation without glamour retouching.',
  neutral: 'Use a believable available-light location, neutral white balance, restrained local color, real material texture and a background with small signs of everyday use.',
};

const INTENSITY_BODY_LANGUAGE: Record<CompanionSceneIntensity, string> = {
  1: 'Capture an unguarded pause between actions: shoulders at different heights, weight settled through one leg or the furniture, relaxed fingers, and a small spontaneous expression.',
  2: 'Use quietly flirtatious but plausible body language: a gentle torso turn, one hand occupied by the environment, an off-center stance, and eye contact that feels noticed rather than performed.',
  3: 'Use confident sensual body language with a supported spine, visible balance, naturally bent joints, and clothing or bedding reacting to the pose. Keep the gesture continuous and physically achievable.',
  4: 'Use an intimate action with clear preparation and follow-through, anatomically readable contact points, stable support from limbs or furniture, and responsive expressions instead of frozen posing.',
  5: 'Stage the complex adult action as one believable moment in progress: every body has a stable center of gravity, contact creates visible compression, hands have a clear purpose, and expressions respond naturally to the shared action.',
};

function inferRealSceneKind(action: string): RealSceneKind {
  const value = action.toLowerCase();
  if (/mirror|selfie|vanity|fitting room|phone/.test(value)) return 'mirror';
  if (/shower|bath|pool|spring|water|wet|rain/.test(value)) return 'water';
  if (/office|desk|library|gym|kitchen|cafe|work/.test(value)) return 'work';
  if (/bed|bedroom|sheets|couch|sofa|massage|intimate/.test(value)) return 'intimate';
  if (/night|neon|club|bar|city light|rooftop|balcony/.test(value)) return 'nightlife';
  if (/outdoor|beach|garden|street|park|cherry|motorcycle/.test(value)) return 'outdoor';
  if (/apartment|living room|home|window|reading/.test(value)) return 'home';
  return 'neutral';
}

export function buildCompanionSceneRealism(
  row: Record<string, unknown>,
  action: string,
  intensity: CompanionSceneIntensity,
): string {
  const kind = inferRealSceneKind(action);
  const setting: Record<RealSceneKind, string> = {
    home: 'soft window light, an ordinary lived-in room, lightly rumpled fabric',
    outdoor: 'weather-consistent daylight, a recognizable background, light wind in hair and clothing',
    water: 'soft reflected light, naturally wet hair, irregular droplets and damp fabric',
    mirror: 'ordinary room light, correct reflection geometry and a casual camera angle',
    work: 'credible task light, a used workspace and one relevant object in hand',
    nightlife: 'neutral light on skin with colored city lights confined to the background',
    intimate: 'soft bedside light, naturally compressed bedding and visible physical support',
    neutral: 'believable available light, a lived-in setting and real material texture',
  };
  const gesture = ({
    1: 'an unguarded pause, relaxed shoulders and shifted weight',
    2: 'quiet flirtation, one occupied hand and off-center weight',
    3: 'a supported spine, naturally bent joints and continuous movement',
    4: 'clear preparation, stable support and coherent hand contact',
    5: 'stable centers of gravity, purposeful hands and responsive expressions',
  } as const)[intensity];
  return `${setting[kind]}, ${gesture}, eye-level 35mm camera`;
}

export const COMPANION_REALISM_NEGATIVE = 'oversaturated, teal-orange grading, cyan skin, magenta skin, neon color cast on skin, crushed blacks, blown highlights, HDR halo, excessive contrast, beauty filter, airbrushed skin, plastic skin, waxy skin, poreless skin, uncanny valley, synthetic eyes, doll face, generic influencer face, mannequin pose, frozen gesture, rigid symmetry, perfectly centered composition, decorative hand pose, floating hands, weightless body, impossible balance, disconnected contact, excessive bokeh, fake luxury set';

export function buildCompanionGenerationPrompt(
  row: Record<string, unknown>,
  options?: { action?: string; adult?: boolean; random?: number; sceneOnly?: boolean; intensity?: CompanionSceneIntensity },
): CompanionGenerationResult {
  const profile = resolveCompanionProfile(row);
  const category = normalizeCompanionCategory({
    gender: profile.gender,
    style: profile.style,
    tags: row.tags,
  });
  const isIllustrated = /anime|manga|cartoon|2d|3d|cgi/i.test(profile.style);
  const action = options?.action?.trim() || pick(ACTIONS[category], options?.random);
  const identitySpecification = buildCompanionIdentitySpecification(row);
  const identityBrief = buildCompanionIdentityBrief(row);
  const intensity = options?.intensity || (options?.adult === false ? 1 : 3);
  const sceneRealism = isIllustrated ? '' : buildCompanionSceneRealism(row, action, intensity);
  const baseInfo = [
    String(row.name || 'adult companion'),
    String(row.age ? `age ${row.age}` : 'age 25+'),
    String(row.gender || profile.gender || category),
    String(row.appearance_hair_color || ''),
    String(row.appearance_hair || ''),
    String(row.appearance_eyes || ''),
    String(row.appearance_body || ''),
    String(row.appearance_race || ''),
    String(row.personality || ''),
    String(row.appearance_style || profile.style),
    String(row.appearance_face || row.distinguishing_features || ''),
  ].filter(Boolean).join(', ');
  const quality = isIllustrated ? 'high-resolution 2D anime frame' : 'Natural candid photograph';
  const negative = `${studioNegativePrompt(category, isIllustrated ? '2d' : 'realistic')}, different person, face swap`;
  const enhanced = buildStudioPromptEnhancement({
    category,
    intensity,
    animeStyle: isIllustrated ? '2d' : 'realistic',
    identity: options?.sceneOnly ? undefined : identityBrief,
    scene: [action, sceneRealism].filter(Boolean).join(', '),
  });
  const positive = compactFluxPrompt(`${quality}, ${enhanced}`, 990);

  if (options?.sceneOnly) {
    return {
      category,
      baseInfo,
      action,
      quality,
      identitySpecification,
      positive,
      negative,
    };
  }
  return {
    category,
    baseInfo,
    action,
    quality,
    identitySpecification,
    positive,
    negative,
  };
}
export function randomCompanionAction(category: CompanionCategory, random = Math.random()): string {
  return pick(ACTIONS[category], random);
}
