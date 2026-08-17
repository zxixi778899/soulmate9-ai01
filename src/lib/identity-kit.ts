/**
 * Identity Kit — Character consistency anchor system.
 *
 * Generates a 30+ dimension identity specification from companion attributes
 * using deterministic hashing (same companion → same spec every time).
 * Provides the IP-Adapter anchor image, face crop, and identity prompt
 * consumed by all downstream generation stages.
 */

import { resolveCompanionProfile } from '@/lib/companion-profile';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdentitySpecification {
  // Basic demographics
  age: number;
  gender: string;
  ethnicity: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  bodyBuild: string;
  height: string;
  // Face geometry (deterministic hash-derived, stable per companion)
  faceShape: string;
  jawline: string;
  cheekbones: string;
  noseBridge: string;
  noseTip: string;
  lipShape: string;
  eyeShape: string;
  eyeSpacing: string;
  browShape: string;
  forehead: string;
  chinShape: string;
  // Distinguishing marks
  distinguishingMarks: string[];
  skinTone: string;
  skinTexture: string;
}

export interface IdentityKit {
  companionId: string;
  anchorImageUrl: string;
  faceCropUrl?: string;
  identitySpec: IdentitySpecification;
  anchorSeed: number;
  anchorPrompt: string;
  anchorTimestamp: string;
  clipEmbeddingHash?: string;
  qualityScore: number;
}

// ─── Stable Hash ──────────────────────────────────────────────────────────────

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(row: Record<string, unknown>, salt: string, options: T[]): T {
  const seed = [row.id, row.slug, row.name, row.age, row.gender, salt]
    .map((v) => String(v || ''))
    .join('|');
  return options[stableHash(seed) % options.length] || options[0];
}

function pickMulti<T>(row: Record<string, unknown>, salt: string, options: T[], count: number): T[] {
  const result: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    const idx = stableHash(`${String(row.id || '')}|${salt}|${i}`) % options.length;
    if (!used.has(idx)) {
      result.push(options[idx]);
      used.add(idx);
    }
  }
  return result.length > 0 ? result : [options[0]];
}

// ─── Identity Specification Builder ───────────────────────────────────────────

const FACE_SHAPES = [
  'oval face with high cheekbones',
  'heart-shaped face with a narrow chin',
  'soft square face with a defined jawline',
  'round face with full cheeks',
  'long face with elegant cheekbones',
  'diamond-shaped face with broad cheekbones',
];

const JAWLINES = [
  'sharp defined jawline',
  'soft rounded jawline',
  'angular structured jawline',
  'gentle tapered jawline',
  'strong squared jawline',
];

const CHEEKBONES = [
  'high prominent cheekbones',
  'medium cheekbones with soft contour',
  'low subtle cheekbones',
  'sculpted high cheekbones',
  'gentle rounded cheekbones',
];

const NOSE_BRIDGES = [
  'straight narrow nose bridge',
  'gently curved nose bridge',
  'wide flat nose bridge',
  'narrow refined nose bridge',
  'slightly arched nose bridge',
];

const NOSE_TIPS = [
  'slightly upturned nose tip',
  'neutral straight nose tip',
  'softly rounded nose tip',
  'refined pointed nose tip',
  'gently downturned nose tip',
];

const LIP_SHAPES = [
  'full naturally shaped lips with defined cupid bow',
  'medium lips with balanced upper and lower proportion',
  'heart-shaped lips with prominent upper lip',
  'wide expressive lips',
  'thin elegant lips with subtle definition',
];

const EYE_SHAPES = [
  'almond-shaped eyes with slight upward tilt',
  'large round eyes with visible iris',
  'hooded eyes with deep crease',
  'deep-set eyes with prominent brow ridge',
  'monolid eyes with clean eyelid',
  'upturned cat-like eyes',
];

const EYE_SPACINGS = ['wide-set eyes', 'average-spaced eyes', 'close-set eyes'];

const BROW_SHAPES = [
  'naturally arched eyebrows',
  'straight thick eyebrows',
  'S-curved defined eyebrows',
  'thin elegant eyebrows',
  'soft feathered eyebrows',
];

const FOREHEADS = [
  'high smooth forehead',
  'medium proportioned forehead',
  'low hairline with compact forehead',
  'broad forehead with wide temples',
];

const CHIN_SHAPES = [
  'gently pointed chin',
  'soft rounded chin',
  'square structured chin',
  'chin with subtle cleft',
  'tapered V-line chin',
];

const DISTINGUISHING_MARKS_POOL = [
  'light freckles across the nose bridge',
  'a small beauty mark on the left cheek',
  'a small beauty mark near the right eye',
  'subtle cheek dimples when smiling',
  'a faint scar on the left eyebrow',
  'prominent laugh lines',
  'a beauty mark above the upper lip',
  'delicate freckles on the shoulders',
];

const SKIN_TONES = [
  'fair porcelain skin',
  'light warm skin',
  'medium golden skin',
  'olive Mediterranean skin',
  'warm tan skin',
  'deep rich skin',
];

const SKIN_TEXTURES = [
  'smooth clear skin with natural fine pores',
  'naturally textured skin with visible pores',
  'soft dewy skin with subtle glow',
  'matte even skin with minimal texture',
  'lightly freckled skin across cheeks and nose',
];

const HEIGHTS = [
  '160cm petite',
  '165cm average',
  '168cm tall',
  '170cm above average',
  '173cm tall',
  '175cm statuesque',
  '178cm very tall',
  '180cm tall',
];

/**
 * Build a deterministic 30+ dimension identity specification from companion data.
 * Same companion always produces the exact same spec (hash-stable).
 */
export function buildIdentitySpec(row: Record<string, unknown>): IdentitySpecification {
  const profile = resolveCompanionProfile(row);
  const age = Math.max(18, Math.round(Number(row.age) || 25));

  const gender =
    profile.category === 'male'
      ? 'adult man'
      : profile.category === 'transgender'
        ? 'adult transgender woman'
        : 'adult woman';

  const ethnicity = String(row.appearance_race || '').trim() ||
    pick(row, 'eth', ['Caucasian', 'East Asian', 'South Asian', 'Latina', 'Mixed heritage', 'Middle Eastern', 'African', 'Nordic']);

  const hairColor = String(row.appearance_hair_color || '').trim() ||
    pick(row, 'hc', ['jet black', 'dark brown', 'chestnut brown', 'honey blonde', 'platinum blonde', 'auburn red', 'silver gray']);

  const hairStyle = String(row.appearance_hair || '').trim() ||
    pick(row, 'hs', ['long straight', 'long wavy', 'shoulder-length layered', 'medium curly', 'short pixie cut', 'long braided']);

  const eyeColor = String(row.appearance_eyes || '').trim() ||
    pick(row, 'ec', ['dark brown', 'warm hazel', 'green', 'steel blue', 'amber', 'gray-blue']);

  const bodyBuild = String(row.appearance_body || '').trim() ||
    pick(row, 'bb', ['slim athletic', 'curvy hourglass', 'petite slender', 'toned muscular', 'soft full-figured']);

  const height = pick(row, 'ht', HEIGHTS);
  const marks = pickMulti(row, 'marks', DISTINGUISHING_MARKS_POOL, stableHash(String(row.id || '') + '|marks_count') % 3 + 1);

  const skinTone = String(row.appearance_race || '').trim()
    ? pick(row, 'st', SKIN_TONES)
    : pick(row, 'st', SKIN_TONES);

  return {
    age,
    gender,
    ethnicity,
    hairColor,
    hairStyle,
    eyeColor,
    bodyBuild,
    height,
    faceShape: pick(row, 'face', FACE_SHAPES),
    jawline: pick(row, 'jaw', JAWLINES),
    cheekbones: pick(row, 'cheek', CHEEKBONES),
    noseBridge: pick(row, 'nbridge', NOSE_BRIDGES),
    noseTip: pick(row, 'ntip', NOSE_TIPS),
    lipShape: pick(row, 'lip', LIP_SHAPES),
    eyeShape: pick(row, 'eye', EYE_SHAPES),
    eyeSpacing: pick(row, 'esp', EYE_SPACINGS),
    browShape: pick(row, 'brow', BROW_SHAPES),
    forehead: pick(row, 'fore', FOREHEADS),
    chinShape: pick(row, 'chin', CHIN_SHAPES),
    distinguishingMarks: marks,
    skinTone,
    skinTexture: pick(row, 'stex', SKIN_TEXTURES),
  };
}

// ─── Identity Prompt Builder ──────────────────────────────────────────────────

/**
 * Compress the identity spec into a FLUX-friendly anchor text (~100-120 words).
 * This text is prepended to every generation prompt for identity consistency.
 */
export function buildIdentityPrompt(spec: IdentitySpecification): string {
  const parts = [
    `${spec.age}-year-old ${spec.gender}`,
    spec.ethnicity ? `${spec.ethnicity} ethnicity` : '',
    `${spec.hairColor} ${spec.hairStyle} hair`,
    `${spec.eyeColor} ${spec.eyeShape}`,
    spec.eyeSpacing,
    spec.browShape,
    spec.faceShape,
    spec.jawline,
    spec.cheekbones,
    `${spec.noseBridge} with ${spec.noseTip}`,
    spec.lipShape,
    spec.forehead,
    spec.chinShape,
    spec.skinTone,
    spec.skinTexture,
    spec.bodyBuild,
    spec.height,
    spec.distinguishingMarks.join(', '),
  ].filter(Boolean);

  return `Consistent identity: ${parts.join('; ')}. Maintain this exact face geometry, skin, hair, body and features in every view; never replace with a generic face.`;
}

// ─── Identity Kit Resolution ──────────────────────────────────────────────────

/**
 * Resolve or build an Identity Kit for a companion.
 * Queries the database for the best existing anchor image, or builds from attributes.
 */
export async function resolveIdentityKit(
  companionId: string,
  supabase: { from: (table: string) => { select: (cols: string) => { eq: (col: string, val: string) => { order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }> } } } } },
  companion: Record<string, unknown>,
): Promise<IdentityKit | null> {
  const identitySpec = buildIdentitySpec(companion);

  // Query best anchor image from companion_assets or generation_assets
  let anchorImageUrl = '';
  let anchorSeed = -1;
  let anchorPrompt = '';
  let anchorTimestamp = new Date().toISOString();
  let qualityScore = 0;

  try {
    // Try companion_assets first (explicit anchors)
    const { data: anchorRows, error: anchorErr } = await supabase
      .from('companion_assets')
      .select('url, meta, created_at')
      .eq('girlfriend_id', companionId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (anchorErr) {
      logger.warn('[identity-kit] companion_assets query failed', { error: anchorErr.message });
    }

    if (anchorRows && Array.isArray(anchorRows)) {
      // Prefer identity-anchor role, then avatar-closeup
      const anchor = anchorRows.find((row) => {
        const r = row as Record<string, unknown>;
        const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>;
        return String(meta.asset_role || '') === 'identity-anchor' && typeof r.url === 'string' && r.url;
      }) || anchorRows.find((row) => {
        const r = row as Record<string, unknown>;
        const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>;
        return String(meta.asset_role || '') === 'avatar-closeup' && typeof r.url === 'string' && r.url;
      });

      if (anchor) {
        const a = anchor as Record<string, unknown>;
        anchorImageUrl = String(a.url || '');
        const meta = (a.meta && typeof a.meta === 'object' ? a.meta : {}) as Record<string, unknown>;
        anchorSeed = Number(meta.seed ?? -1);
        anchorPrompt = String(meta.prompt || '');
        anchorTimestamp = String(a.created_at || new Date().toISOString());
        qualityScore = Number(meta.quality_score ?? 85);
      }
    }

    // Fallback to generation_assets
    if (!anchorImageUrl) {
      const { data: genRows, error: genErr } = await supabase
        .from('generation_assets')
        .select('url, meta, created_at')
        .eq('girlfriend_id', companionId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!genErr && genRows && Array.isArray(genRows)) {
        const avatar = genRows.find((row) => {
          const r = row as Record<string, unknown>;
          const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>;
          return String(meta.asset_role || '') === 'avatar-closeup' && typeof r.url === 'string' && r.url;
        });
        if (avatar) {
          const a = avatar as Record<string, unknown>;
          anchorImageUrl = String(a.url || '');
          const meta = (a.meta && typeof a.meta === 'object' ? a.meta : {}) as Record<string, unknown>;
          anchorSeed = Number(meta.seed ?? -1);
          anchorPrompt = String(meta.prompt || '');
          anchorTimestamp = String(a.created_at || new Date().toISOString());
          qualityScore = Number(meta.quality_score ?? 75);
        }
      }
    }

    // Final fallback: portrait_url / avatar_url from girlfriends table
    if (!anchorImageUrl) {
      const portraitUrl = String(companion.portrait_url || companion.avatar_url || companion.card_url || '').trim();
      if (portraitUrl) {
        anchorImageUrl = portraitUrl;
        qualityScore = 60;
      }
    }
  } catch (err) {
    logger.warn('[identity-kit] resolve failed', {
      companionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!anchorImageUrl) {
    // No reference image available — return spec only
    return {
      companionId,
      anchorImageUrl: '',
      identitySpec,
      anchorSeed,
      anchorPrompt,
      anchorTimestamp,
      qualityScore: 0,
    };
  }

  return {
    companionId,
    anchorImageUrl,
    identitySpec,
    anchorSeed,
    anchorPrompt,
    anchorTimestamp,
    qualityScore,
  };
}

// ─── IP-Adapter Weight Resolver ───────────────────────────────────────────────

/**
 * Resolve the optimal IP-Adapter weight based on asset role and task context.
 * Higher weight = stronger face lock, lower = more creative freedom.
 */
export function resolveIpAdapterWeight(
  assetRole: string,
  studioTask?: string,
  modelFamily?: string,
): number {
  if (modelFamily !== 'flux') return 0.65; // Non-FLUX fallback

  // Identity reference sheets: strong lock
  if (assetRole.startsWith('identity-')) return 0.85;
  if (assetRole === 'avatar-closeup') return 0.78;

  // Final products: balanced (identity + creative freedom)
  if (assetRole === 'character-art') return 0.72;
  if (assetRole === 'album') return 0.68;
  if (assetRole === 'scene') return 0.65;

  // Task-based adjustments
  if (studioTask === 'outfit') return 0.78; // Lock face, free wardrobe
  if (studioTask === 'pose') return 0.72;  // Lock face, free pose
  if (studioTask === 'background') return 0.75; // Lock face, free scene
  if (studioTask === 'portrait') return 0.80; // Strong face lock for portraits

  return 0.70;
}

/**
 * Resolve IP-Adapter scheduling (start/end percent) for ComfyUI.
 * Determines which diffusion steps receive identity conditioning.
 */
export function resolveIpAdapterSchedule(assetRole: string): { start: number; end: number } {
  // Identity assets: strong early + late anchoring
  if (assetRole.startsWith('identity-') || assetRole === 'avatar-closeup') {
    return { start: 0.02, end: 0.90 };
  }
  // Final products: skip early noise, release late for creative composition
  if (assetRole === 'character-art' || assetRole === 'album' || assetRole === 'scene') {
    return { start: 0.05, end: 0.82 };
  }
  // Default: balanced
  return { start: 0.05, end: 0.85 };
}
