import { HIGH_NSFW_PROMPT, STUDIO_PROMPTS, normalizeCompanionCategory, type CompanionCategory } from '@/lib/companion-category';
import { resolveCompanionProfile } from '@/lib/companion-profile';

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
  const gender = profile.category === 'male' ? 'man' : profile.category === 'transgender' ? 'transgender woman' : 'woman';

  // Stable body proportion cues — FLUX responds to visual ratios, not numbers
  const heightCm = stableIdentityCue(row, 'height', [
    '165cm', '168cm', '170cm', '172cm', '175cm', '178cm', '180cm', '183cm', '185cm', '188cm',
  ]);
  const proportionCue = stableIdentityCue(row, 'proportion', [
    'compact 6.5-head-tall figure, shorter legs relative to torso',
    'balanced 7-head-tall figure, average leg-to-torso ratio',
    'tall 7.5-head-tall figure, long legs relative to torso',
    'very tall 8-head-tall figure, elongated limbs and narrow frame',
    'stocky 6-head-tall figure, broad shoulders and shorter limbs',
    'athletic 7-head-tall figure, broad shoulders, long legs, narrow waist',
  ]);

  const parts = [
    `${age}-year-old ${gender}`,
    row.appearance_race ? `${String(row.appearance_race)} ethnicity` : '',
    row.appearance_hair_color ? `${String(row.appearance_hair_color)} hair` : '',
    row.appearance_hair ? String(row.appearance_hair) : '',
    row.appearance_eyes ? `${String(row.appearance_eyes)} eyes` : '',
    row.appearance_face ? `${String(row.appearance_face)} face` : '',
    row.distinguishing_features ? String(row.distinguishing_features) : '',
    row.appearance_body ? `${String(row.appearance_body)} build` : '',
    `${heightCm}, ${proportionCue}`,
    row.appearance_style ? `${String(row.appearance_style)} style` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

function pick<T>(items: T[], seed = Math.random()): T {
  return items[Math.min(items.length - 1, Math.floor(seed * items.length))];
}

export function buildCompanionGenerationPrompt(
  row: Record<string, unknown>,
  options?: { action?: string; adult?: boolean; random?: number; sceneOnly?: boolean },
): CompanionGenerationResult {
  const profile = resolveCompanionProfile(row);
  const category = normalizeCompanionCategory({
    gender: profile.gender,
    style: profile.style,
    tags: row.tags,
  });
  const preset = STUDIO_PROMPTS[category];
  const action = options?.action?.trim() || pick(ACTIONS[category], options?.random);
  const identitySpecification = buildCompanionIdentitySpecification(row);
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
  const quality = category === 'anime'
    ? 'Render this as a premium anime illustration with deliberate linework, expressive eyes, rich cel shading, and a readable composition.'
    : 'Render this as a polished editorial photograph with lifelike texture, controlled light, clear eyes, and natural depth.';

  // sceneOnly: identity is controlled by reference image, prompt only describes scene+action+quality
  if (options?.sceneOnly) {
    return {
      category,
      baseInfo,
      action,
      quality,
      identitySpecification,
      positive: `Scene direction: ${action}. ${quality} ${options?.adult === false ? '' : HIGH_NSFW_PROMPT}`.trim(),
      negative: `${preset.negative}, generic face, duplicate identity, same face as another character, different person, face swap`,
    };
  }

  return {
    category,
    baseInfo,
    action,
    quality,
    identitySpecification,
    positive: `${identitySpecification} Scene direction: ${action}. ${quality} ${options?.adult === false ? '' : HIGH_NSFW_PROMPT}`.trim(),
    negative: `${preset.negative}, generic face, duplicate identity, same face as another character`,
  };
}

export function randomCompanionAction(category: CompanionCategory, random = Math.random()): string {
  return pick(ACTIONS[category], random);
}
