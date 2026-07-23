import { STUDIO_PROMPTS, normalizeCompanionCategory, type CompanionCategory } from '@/lib/companion-category';
import { resolveCompanionProfile } from '@/lib/companion-profile';
import { assembleGirlfriendFromRow } from '@/lib/prompt/girlfriend';

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
  positive: string;
  negative: string;
};

function pick<T>(items: T[], seed = Math.random()): T {
  return items[Math.min(items.length - 1, Math.floor(seed * items.length))];
}

export function buildCompanionGenerationPrompt(
  row: Record<string, unknown>,
  options?: { action?: string; adult?: boolean; random?: number },
): CompanionGenerationResult {
  const profile = resolveCompanionProfile(row);
  const category = normalizeCompanionCategory({
    gender: profile.gender,
    style: profile.style,
    tags: row.tags,
  });
  const preset = STUDIO_PROMPTS[category];
  const action = options?.action?.trim() || pick(ACTIONS[category], options?.random);
  const assembled = assembleGirlfriendFromRow(row, action, {
    adult: options?.adult !== false,
    useEmptyNegative: false,
  });
  const baseInfo = [
    String(row.name || 'adult companion'),
    String(row.age ? `age ${row.age}` : 'age 25+'),
    String(row.personality || ''),
    String(row.appearance_race || ''),
    String(row.appearance_hair || ''),
    String(row.appearance_hair_color || ''),
    String(row.appearance_eyes || ''),
    String(row.appearance_body || ''),
    String(row.appearance_style || profile.style),
  ].filter(Boolean).join(', ');
  const quality = preset.prompt.split(', ').slice(-5).join(', ');
  return {
    category,
    baseInfo,
    action,
    quality,
    positive: `${assembled.positive}, ${quality}`,
    negative: `${assembled.negative}, ${preset.negative}`,
  };
}

export function randomCompanionAction(category: CompanionCategory, random = Math.random()): string {
  return pick(ACTIONS[category], random);
}
