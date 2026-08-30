/**
 * Unified generation preset catalog (gen_preset_catalog, migration 0040/0044).
 *
 * Converges ALL preset systems into one admin-maintained source with 3
 * unified categories: prompt | pose | scene.
 *
 * - **prompt**: FLUX/SDXL prompt presets (migrated from site_settings)
 * - **pose**:   pose / action references
 * - **scene**:  scene environments + outfits + styles + moods (converged)
 *
 * Legacy files stay as runtime fallbacks when the table is missing or empty.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { PRESET_LIBRARY, PRESET_VIBE_LABELS, type PresetVibe } from '@/lib/preset-library';
import { ADULT_SCENE_PRESETS } from '@/lib/comfy-console/adult-scene-presets';
import { GIRLFRIEND_SCENE_RECIPES } from '@/lib/prompt/girlfriend';
import { DEFAULT_PROMPT_PRESETS } from '@/lib/prompt-presets-store';

export type GenPresetCategory = 'prompt' | 'pose' | 'scene' | 'outfit' | 'style' | 'mood';

/** The 3 main UI categories — outfit/style/mood are legacy sub-groups of scene. */
export const UNIFIED_PRESET_CATEGORIES = ['prompt', 'pose', 'scene'] as const;
export type UnifiedPresetCategory = (typeof UNIFIED_PRESET_CATEGORIES)[number];

export const GEN_PRESET_CATEGORIES: readonly GenPresetCategory[] = [
  'prompt',
  'pose',
  'scene',
  'outfit',
  'style',
  'mood',
];

/** Map legacy categories into the unified 'scene' bucket for the new UI. */
export function toUnifiedCategory(cat: string): UnifiedPresetCategory {
  if (cat === 'prompt') return 'prompt';
  if (cat === 'pose') return 'pose';
  return 'scene'; // scene | outfit | style | mood → scene
}

export function isGenPresetCategory(value: unknown): value is GenPresetCategory {
  return GEN_PRESET_CATEGORIES.includes(value as GenPresetCategory);
}

export type GenPresetTier = 'free' | 'premium';

export type PresetGender = 'female' | 'male' | 'trans' | 'all';
export type PresetStyleFamily = 'realistic' | 'anime';

export interface GenPreset {
  id: string;
  category: GenPresetCategory;
  slug: string;
  label_en: string;
  label_zh: string;
  preview_url: string | null;
  prompt_fragment: string;
  negative_fragment: string;
  lora_hints: unknown[];
  nsfw_level: number;
  tier: GenPresetTier;
  model_family: string | null;
  sort_order: number;
  is_active: boolean;
  // ── Model matrix capability fields (migration 0042)
  gender?: PresetGender;
  style_family?: PresetStyleFamily;
  pose_reference?: string | null;
  workflow_flags?: { face_fix?: boolean; upscale?: number; identity_image?: boolean };
  // ── Unified preset library fields (migration 0044)
  preset_group?: string;
  extra_params?: Record<string, unknown>;
  // ========== ControlNet Multi-Unit Resources ==========
  openpose_json?: string | null;
  body_depth_url?: string | null;
  canny_edge_url?: string | null;
  bg_mask_url?: string | null;
  ip_adapter_face?: string | null;
  person_mask_url?: string | null;
  depth_url?: string | null; // Legacy field for backward compatibility
}

/** Defensive row → GenPreset mapping (missing columns degrade gracefully). */
export function presetFromRow(row: unknown): GenPreset | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const category = r.category as GenPresetCategory;
  if (!isGenPresetCategory(category) || !r.slug) return null;
  return {
    id: String(r.id || `catalog-${category}-${r.slug}`),
    category,
    slug: String(r.slug),
    label_en: String(r.label_en || ''),
    label_zh: String(r.label_zh || ''),
    preview_url: r.preview_url != null ? String(r.preview_url) : null,
    prompt_fragment: String(r.prompt_fragment || ''),
    negative_fragment: String(r.negative_fragment || ''),
    lora_hints: Array.isArray(r.lora_hints) ? r.lora_hints : [],
    nsfw_level: Math.min(5, Math.max(0, Number(r.nsfw_level || 0))),
    tier: r.tier === 'premium' ? 'premium' : 'free',
    model_family: r.model_family != null ? String(r.model_family) : null,
    sort_order: Number(r.sort_order || 0),
    is_active: r.is_active !== false,
    gender: (['female', 'male', 'trans', 'all'].includes(r.gender as string)) ? (r.gender as PresetGender) : undefined,
    style_family: (['realistic', 'anime'].includes(r.style_family as string)) ? (r.style_family as PresetStyleFamily) : undefined,
    pose_reference: r.pose_reference != null ? String(r.pose_reference) : null,
    workflow_flags: r.workflow_flags != null && typeof r.workflow_flags === 'object' ? (r.workflow_flags as { face_fix?: boolean; upscale?: number; identity_image?: boolean }) : undefined,
    preset_group: r.preset_group != null ? String(r.preset_group) : '',
    extra_params: r.extra_params != null && typeof r.extra_params === 'object' ? (r.extra_params as Record<string, unknown>) : {},
    // ========== ControlNet Multi-Unit Resources ==========
    openpose_json: r.openpose_json != null ? String(r.openpose_json) : null,
    body_depth_url: r.body_depth_url != null ? String(r.body_depth_url) : null,
    canny_edge_url: r.canny_edge_url != null ? String(r.canny_edge_url) : null,
    bg_mask_url: r.bg_mask_url != null ? String(r.bg_mask_url) : null,
    ip_adapter_face: r.ip_adapter_face != null ? String(r.ip_adapter_face) : null,
    person_mask_url: r.person_mask_url != null ? String(r.person_mask_url) : null,
    depth_url: r.depth_url != null ? String(r.depth_url) : null, // Legacy field
  };
}

/** True when an error means the gen_preset_catalog table does not exist yet. */
export function isMissingPresetTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const msg = String(e?.message || e || '').toLowerCase();
  return (
    e?.code === '42P01' ||
    (msg.includes('gen_preset_catalog') &&
      (msg.includes('does not exist') || msg.includes('could not find')))
  );
}

function describeError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  return e?.message || e?.code || String(err || 'unknown');
}

// ─────────────────────────── legacy mapping ───────────────────────────

const SCENE_LABEL_ZH: Record<string, string> = {
  rooftop_night: '天台夜色',
  mirror_selfie: '镜前自拍',
  city_apartment: '都市公寓',
  window_sunlight: '窗边光影',
  pink_bedroom: '温馨卧室',
  gothic_throne: '暗夜大片',
  cafe_day: '午后咖啡馆',
  car_night: '夜色车内',
  beach_breeze: '海滩微风',
  kitchen_morning: '清晨厨房',
  studio_clean: '纯净影棚',
  golden_hour: '黄金时刻',
};

const VIBE_PROMPT_FRAGMENT: Record<PresetVibe, string> = {
  sweet: 'sweet healing atmosphere, warm soft light, gentle smile',
  cool: 'cool reserved mood, dramatic soft light, composed elegant expression',
  flirty: 'flirty teasing mood, warm golden light, playful confident gaze',
  obsessive: 'intense captivating mood, dim moody light, fixated mesmerizing stare',
  energetic: 'energetic vibrant mood, bright sunny light, lively dynamic pose',
  fantasy: 'mystical fantasy mood, ethereal glow, magical particles in air',
  sensual: 'sensual mature mood, low warm light, slow relaxed body language',
  dominant: 'dominant powerful mood, strong key light, commanding posture',
  intellectual: 'gentle intellectual mood, soft window light, calm thoughtful expression',
  playful: 'playful mischievous mood, bright cheerful light, candid laughing moment',
};

function titleFromSlug(slug: string): string {
  return slug
    .replace(/^nsfw-\d+-/, '')
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

let legacyCatalogCache: GenPreset[] | null = null;

/**
 * 内置姿势批次（LLM 精选）：legacy 来源中没有 'pose' 类目，
 * 此批次保证工作台的姿势槽位选择器开箱即用；
 * 后台往 gen_preset_catalog 插入同类目行后自动接管覆盖。
 */
const BUILTIN_POSE_PRESETS: Array<{
  slug: string;
  en: string;
  zh: string;
  prompt: string;
  nsfw: number;
  tier: GenPresetTier;
}> = [
  { slug: 'pose-over-shoulder', en: 'Over-shoulder Glance', zh: '回眸一瞥', prompt: 'looking back over shoulder, soft candid glance, relaxed natural posture', nsfw: 0, tier: 'free' },
  { slug: 'pose-window-lean', en: 'Window Lean', zh: '倚窗而立', prompt: 'leaning against the window frame, arms loosely crossed, soft daylight on face', nsfw: 0, tier: 'free' },
  { slug: 'pose-coffee-sip', en: 'Coffee Sip', zh: '轻啜咖啡', prompt: 'seated with a coffee cup near lips, gentle eyes-up gaze, cozy cafe posture', nsfw: 0, tier: 'free' },
  { slug: 'pose-morning-stretch', en: 'Morning Stretch', zh: '清晨伸展', prompt: 'stretching arms overhead, eyes half closed, relaxed morning yawn posture', nsfw: 0, tier: 'free' },
  { slug: 'pose-crossed-sit', en: 'Elegant Sit', zh: '优雅端坐', prompt: 'sitting with legs crossed, hands resting on knee, upright confident posture', nsfw: 0, tier: 'free' },
  { slug: 'pose-hair-flip', en: 'Hair Flip', zh: '撩发瞬间', prompt: 'one hand flipping hair, dynamic motion, playful half-smile', nsfw: 0, tier: 'free' },
  { slug: 'pose-wall-lean', en: 'Street Wall Lean', zh: '倚墙街拍', prompt: 'back against a wall, one knee slightly bent, casual editorial street pose', nsfw: 0, tier: 'free' },
  { slug: 'pose-dress-twirl', en: 'Dress Twirl', zh: '旋身裙摆', prompt: 'mid-twirl with dress flowing outward, joyful laughing expression', nsfw: 0, tier: 'free' },
  { slug: 'pose-bed-lounge', en: 'Bed Lounge', zh: '慵懒卧床', prompt: 'lounging on a soft bed, propped on one elbow, relaxed inviting gaze', nsfw: 2, tier: 'free' },
  { slug: 'pose-mirror-gaze', en: 'Mirror Gaze', zh: '镜前顾盼', prompt: 'standing before a mirror, one hand on hip, admiring self-reflection pose', nsfw: 2, tier: 'free' },
  { slug: 'pose-boudoir-recline', en: 'Boudoir Recline', zh: '闺房斜倚', prompt: 'reclined on silk sheets, soft arched back, intimate bedroom posture', nsfw: 3, tier: 'premium' },
  { slug: 'pose-towel-drop', en: 'Fresh from Shower', zh: '出浴披发', prompt: 'fresh from shower, wet hair over shoulders, towel loosely held, steamy soft light', nsfw: 3, tier: 'premium' },
];

/**
 * Map all legacy preset files into the catalog shape.
 * - GIRLFRIEND_SCENE_RECIPES      → category 'scene' (SFW)
 * - ADULT_SCENE_PRESETS (lvl 3-5) → category 'scene' (nsfw_level 3/4/5)
 * - PRESET_LIBRARY portrait_outfit → category 'outfit' (SFW)
 * - PRESET_VIBE_LABELS             → category 'mood' (SFW)
 */
export function buildLegacyCatalog(): GenPreset[] {
  if (legacyCatalogCache) return legacyCatalogCache;
  const rows: GenPreset[] = [];
  const push = (row: Omit<GenPreset, 'id'>) =>
    rows.push({ ...row, id: `legacy-${row.category}-${row.slug}` });

  // Built-in pose batch (LLM-curated) — no legacy source covers poses.
  BUILTIN_POSE_PRESETS.forEach((preset, index) => {
    push({
      category: 'pose',
      slug: preset.slug,
      label_en: preset.en,
      label_zh: preset.zh,
      preview_url: null,
      prompt_fragment: preset.prompt,
      negative_fragment: '',
      lora_hints: [],
      nsfw_level: preset.nsfw,
      tier: preset.tier,
      model_family: null,
      sort_order: index * 10,
      is_active: true,
    });
  });

  // SFW scenes from the companion scene recipes.
  GIRLFRIEND_SCENE_RECIPES.forEach((recipe, index) => {
    push({
      category: 'scene',
      slug: recipe.id,
      label_en: recipe.label,
      label_zh: SCENE_LABEL_ZH[recipe.id] || recipe.label,
      preview_url: null,
      prompt_fragment: `${recipe.env}, ${recipe.light}`,
      negative_fragment: '',
      lora_hints: [],
      nsfw_level: 0,
      tier: 'free',
      model_family: null,
      sort_order: index * 10,
      is_active: true,
    });
  });

  // NSFW scenes from the curated adult packs (levels 3-5).
  for (const level of [3, 4, 5] as const) {
    ADULT_SCENE_PRESETS[level].forEach((preset, index) => {
      push({
        category: 'scene',
        slug: preset.id,
        label_en: titleFromSlug(preset.id),
        label_zh: preset.label,
        preview_url: null,
        prompt_fragment: preset.scene,
        negative_fragment: '',
        lora_hints: [],
        nsfw_level: level,
        tier: 'premium',
        model_family: null,
        sort_order: 1000 + level * 100 + index,
        is_active: true,
      });
    });
  }

  // Outfits from the companion preset library.
  PRESET_LIBRARY.forEach((entry, index) => {
    if (!entry.portrait_outfit) return;
    push({
      category: 'outfit',
      slug: `fit-${entry.slug}`.slice(0, 64),
      label_en: `${entry.name} Outfit`,
      label_zh: `${entry.name_zh}造型`,
      preview_url: null,
      prompt_fragment: entry.portrait_outfit,
      negative_fragment: '',
      lora_hints: [],
      nsfw_level: 0,
      tier: 'free',
      model_family: null,
      sort_order: index * 10,
      is_active: true,
    });
  });

  // Moods from the preset vibe taxonomy.
  (Object.keys(PRESET_VIBE_LABELS) as PresetVibe[]).forEach((vibe, index) => {
    push({
      category: 'mood',
      slug: vibe,
      label_en: PRESET_VIBE_LABELS[vibe].en,
      label_zh: PRESET_VIBE_LABELS[vibe].zh,
      preview_url: null,
      prompt_fragment: VIBE_PROMPT_FRAGMENT[vibe],
      negative_fragment: '',
      lora_hints: [],
      nsfw_level: 0,
      tier: 'free',
      model_family: null,
      sort_order: index * 10,
      is_active: true,
    });
  });

  // Prompt presets from DEFAULT_PROMPT_PRESETS (site_settings fallback).
  DEFAULT_PROMPT_PRESETS.forEach((pp, index) => {
    push({
      category: 'prompt',
      slug: pp.id,
      label_en: pp.label,
      label_zh: pp.label,
      preview_url: null,
      prompt_fragment: pp.positivePrompt,
      negative_fragment: pp.negativePrompt || '',
      lora_hints: [],
      nsfw_level: 0,
      tier: 'free',
      model_family: 'flux',
      sort_order: index * 10,
      is_active: true,
      preset_group: 'flux',
      extra_params: {},
    });
  });

  legacyCatalogCache = rows;
  return rows;
}

// ─────────────────────────── queries ───────────────────────────

export interface GetGenPresetsOptions {
  /** Filter presets above this level out entirely (admin passes 5). */
  maxNsfwLevel?: number;
  /** Admin view: include inactive rows. */
  includeInactive?: boolean;
  limit?: number;
}

interface CatalogCacheEntry {
  at: number;
  rows: GenPreset[];
}
const catalogCache = new Map<string, CatalogCacheEntry>();
const CATALOG_CACHE_TTL_MS = 30_000;

async function loadCategoryRows(
  client: SupabaseClient,
  category: GenPresetCategory,
  includeInactive: boolean,
): Promise<GenPreset[]> {
  const cacheKey = `${category}|${includeInactive ? 'all' : 'active'}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CATALOG_CACHE_TTL_MS) return cached.rows;

  let query = client
    .from('gen_preset_catalog')
    .select('*')
    .eq('category', category)
    .order('sort_order', { ascending: true })
    .order('slug', { ascending: true })
    .limit(500);
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  let rows: GenPreset[];
  if (error) {
    if (!isMissingPresetTableError(error)) {
      logger.warn('[gen-presets] catalog query failed', {
        category,
        err: describeError(error),
      });
    }
    rows = [];
  } else {
    rows = ((data as unknown[]) || [])
      .map(presetFromRow)
      .filter((row): row is GenPreset => row !== null);
  }

  // Legacy fallback: table missing or never seeded.
  if (rows.length === 0) {
    rows = buildLegacyCatalog().filter(
      (row) => row.category === category && (includeInactive || row.is_active),
    );
  }

  catalogCache.set(cacheKey, { at: Date.now(), rows });
  return rows;
}

/** Active presets for one category, capped by the caller's NSFW allowance. */
export async function getGenPresets(
  client: SupabaseClient,
  category: GenPresetCategory,
  options: GetGenPresetsOptions = {},
): Promise<GenPreset[]> {
  const rows = await loadCategoryRows(client, category, Boolean(options.includeInactive));
  const maxLevel = Math.min(5, Math.max(0, options.maxNsfwLevel ?? 5));
  const limit = Math.min(500, Math.max(1, options.limit ?? 200));
  return rows.filter((row) => row.nsfw_level <= maxLevel).slice(0, limit);
}

/** Fetch one preset by (category, slug) — null when missing/invalid. */
export async function getPresetBySlug(
  client: SupabaseClient,
  category: GenPresetCategory,
  slug: string,
): Promise<GenPreset | null> {
  const rows = await loadCategoryRows(client, category, true);
  return rows.find((row) => row.slug === slug) || null;
}

/**
 * Resolve a preset's prompt fragment for generation, capped by the caller's
 * effective NSFW level. Returns null when the preset is missing or above the
 * cap — callers then fall back to their default prompt assembly (never
 * escalate content beyond the intimacy gate).
 */
export async function resolveCatalogPromptFragment(
  client: SupabaseClient,
  category: GenPresetCategory,
  slug: string,
  maxNsfwLevel: number,
): Promise<GenPreset | null> {
  const preset = await getPresetBySlug(client, category, slug);
  if (!preset || !preset.is_active) return null;
  if (preset.nsfw_level > maxNsfwLevel) return null;
  return preset;
}

/** Load ALL presets and group by the 3 unified categories (prompt/pose/scene).
 *  Legacy categories (outfit/style/mood) are merged into 'scene'. */
export async function getUnifiedPresets(
  client: SupabaseClient,
  options: GetGenPresetsOptions = {},
): Promise<Record<UnifiedPresetCategory, GenPreset[]>> {
  const result: Record<UnifiedPresetCategory, GenPreset[]> = {
    prompt: [],
    pose: [],
    scene: [],
  };

  for (const category of GEN_PRESET_CATEGORIES) {
    const rows = await loadCategoryRows(client, category, Boolean(options.includeInactive));
    const maxLevel = Math.min(5, Math.max(0, options.maxNsfwLevel ?? 5));
    const filtered = rows.filter((r) => r.nsfw_level <= maxLevel);
    const unified = toUnifiedCategory(category);
    result[unified].push(...filtered);
  }

  // Sort each group by sort_order
  for (const key of Object.keys(result) as UnifiedPresetCategory[]) {
    result[key].sort((a, b) => a.sort_order - b.sort_order);
  }

  return result;
}

// ─────────────────────────── seeding / writes ───────────────────────────

/** One template-pack preset row (category 'scene'), fully typed for upsert. */
interface MatrixTemplateRow {
  category: 'scene';
  slug: string;
  label_en: string;
  label_zh: string;
  preview_url: null;
  prompt_fragment: string;
  negative_fragment: string;
  lora_hints: unknown[];
  nsfw_level: number;
  tier: GenPresetTier;
  model_family: string;
  sort_order: number;
  is_active: boolean;
  gender: PresetGender;
  style_family: PresetStyleFamily;
  pose_reference: null;
  workflow_flags: { face_fix: boolean; upscale: number };
}

/**
 * 模板包（migration 0042）：按模型矩阵逐题材 × SFW/NSFW 配置场景模板。
 * prompt_fragment 使用各底模的原生提示词协议：
 *   - pony 写实：自然语言描述
 *   - illustrious 二次元：danbooru tag 协议
 * 每条模板默认开启 face_fix + 2x 高清放大（workflow_flags），Studio 可覆盖。
 */
export function buildMatrixTemplatePack(): MatrixTemplateRow[] {
  const rows: MatrixTemplateRow[] = [];
  let order = 2000;
  const push = (row: Omit<MatrixTemplateRow, 'category' | 'sort_order' | 'is_active' | 'preview_url' | 'pose_reference' | 'workflow_flags'>) => {
    rows.push({
      category: 'scene',
      ...row,
      sort_order: order,
      is_active: true,
      preview_url: null,
      pose_reference: null,
      workflow_flags: { face_fix: true, upscale: 2 },
    });
    order += 10;
  };

  // ── pony 写实（自然语言协议） ──
  const realisticBase = 'score_9, score_8_up, score_7_up, photorealistic, masterpiece, detailed skin texture, natural lighting';
  push({
    slug: 'tpl-real-female-sfw',
    label_en: 'Realistic Woman — Classic Portrait',
    label_zh: '写实女·经典人像',
    prompt_fragment: `${realisticBase}, elegant woman, three-quarter body portrait, soft studio light`,
    negative_fragment: 'cartoon, anime, deformed, bad anatomy',
    lora_hints: [],
    nsfw_level: 0,
    tier: 'free',
    model_family: 'pony',
    gender: 'female',
    style_family: 'realistic',
  });
  push({
    slug: 'tpl-real-female-nsfw',
    label_en: 'Realistic Woman — Intimate',
    label_zh: '写实女·亲密',
    prompt_fragment: `${realisticBase}, intimate boudoir scene, sensual pose, warm dim lighting`,
    negative_fragment: 'cartoon, anime, deformed, bad anatomy',
    lora_hints: [],
    nsfw_level: 4,
    tier: 'premium',
    model_family: 'pony',
    gender: 'female',
    style_family: 'realistic',
  });
  push({
    slug: 'tpl-real-male-sfw',
    label_en: 'Realistic Man — Editorial',
    label_zh: '写实男·时尚大片',
    prompt_fragment: `${realisticBase}, handsome man, sharp jawline, editorial fashion pose, dramatic key light`,
    negative_fragment: 'feminine, cartoon, anime, deformed, bad anatomy',
    lora_hints: [],
    nsfw_level: 0,
    tier: 'free',
    model_family: 'pony',
    gender: 'male',
    style_family: 'realistic',
  });
  push({
    slug: 'tpl-real-male-nsfw',
    label_en: 'Realistic Man — Intimate',
    label_zh: '写实男·亲密',
    prompt_fragment: `${realisticBase}, muscular man, intimate scene, low warm light, confident gaze`,
    negative_fragment: 'feminine, cartoon, anime, deformed, bad anatomy',
    lora_hints: [],
    nsfw_level: 4,
    tier: 'premium',
    model_family: 'pony',
    gender: 'male',
    style_family: 'realistic',
  });
  push({
    slug: 'tpl-real-trans-sfw',
    label_en: 'Trans — Glamour Portrait',
    label_zh: '跨性别·魅力人像',
    prompt_fragment: `${realisticBase}, beautiful trans woman, glamorous pose, studio lighting`,
    negative_fragment: 'cartoon, anime, deformed, bad anatomy',
    lora_hints: [],
    nsfw_level: 0,
    tier: 'free',
    model_family: 'pony',
    gender: 'trans',
    style_family: 'realistic',
  });
  push({
    slug: 'tpl-real-trans-nsfw',
    label_en: 'Trans — Intimate',
    label_zh: '跨性别·亲密',
    prompt_fragment: `${realisticBase}, trans woman, intimate sensual scene, warm mood lighting`,
    negative_fragment: 'cartoon, anime, deformed, bad anatomy',
    lora_hints: [],
    nsfw_level: 4,
    tier: 'premium',
    model_family: 'pony',
    gender: 'trans',
    style_family: 'realistic',
  });

  // ── illustrious 二次元（danbooru tag 协议） ──
  const animeBase = 'masterpiece, best quality, amazing quality, very awa, detailed illustration';
  push({
    slug: 'tpl-anime-sfw',
    label_en: 'Anime — Idol Portrait',
    label_zh: '二次元·偶像立绘',
    prompt_fragment: `${animeBase}, 1girl, solo, smile, idol, stage light, sparkles`,
    negative_fragment: 'worst quality, lowres, bad anatomy, bad hands',
    lora_hints: [],
    nsfw_level: 0,
    tier: 'free',
    model_family: 'illustrious',
    gender: 'female',
    style_family: 'anime',
  });
  push({
    slug: 'tpl-anime-nsfw',
    label_en: 'Anime — Mature',
    label_zh: '二次元·成熟',
    prompt_fragment: `${animeBase}, 1girl, solo, mature female, sensual, detailed eyes`,
    negative_fragment: 'worst quality, lowres, bad anatomy, bad hands, child, loli',
    lora_hints: [],
    nsfw_level: 4,
    tier: 'premium',
    model_family: 'illustrious',
    gender: 'female',
    style_family: 'anime',
  });

  return rows;
}

/** Upsert the full legacy mapping into gen_preset_catalog. Idempotent
 * (onConflict category,slug); admins can then edit rows freely.
 * 
 * Migration 0042+: seed also inserts "template pack" presets for each
 * model family lane (pony realistic / illustrious anime) so Studio can
 * show preset thumbnails and drive model routing.
 */
export async function seedPresetsFromLegacy(
  client: SupabaseClient,
): Promise<{ upserted: number; error: string | null }> {
  const legacyRows = buildLegacyCatalog().map((preset) => ({
    category: preset.category,
    slug: preset.slug,
    label_en: preset.label_en,
    label_zh: preset.label_zh,
    preview_url: preset.preview_url,
    prompt_fragment: preset.prompt_fragment,
    negative_fragment: preset.negative_fragment,
    lora_hints: preset.lora_hints,
    nsfw_level: preset.nsfw_level,
    tier: preset.tier,
    model_family: preset.model_family,
    sort_order: preset.sort_order,
    is_active: preset.is_active,
    // 0042 fields: default on legacy import, admin overrides later.
    gender: preset.model_family === 'illustrious' ? 'female' : 'female',
    style_family: preset.model_family === 'illustrious' ? 'anime' : 'realistic',
    pose_reference: null,
    workflow_flags: {},
    // 0044 unified preset library fields.
    preset_group: preset.preset_group || '',
    extra_params: preset.extra_params || {},
    updated_at: new Date().toISOString(),
  }));

  // Template pack (model matrix lanes) — merged so one seed call covers both.
  const packRows = buildMatrixTemplatePack().map((row) => ({
    ...row,
    updated_at: new Date().toISOString(),
  }));
  const rows = [...legacyRows, ...packRows];

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await client
      .from('gen_preset_catalog')
      .upsert(chunk, { onConflict: 'category,slug' });
    if (error) {
      if (!isMissingPresetTableError(error)) {
        logger.warn('[gen-presets] seed upsert failed', {
          offset: i,
          err: describeError(error),
        });
      }
      return { upserted, error: describeError(error) };
    }
    upserted += chunk.length;
  }
  catalogCache.clear();
  return { upserted, error: null };
}

/** Invalidate the in-process cache after admin writes. */
export function invalidatePresetCache(): void {
  catalogCache.clear();
}

// ─────────────────────────── preview thumbnails ───────────────────────────

export const PRESET_THUMB_FOLDER = 'presets/thumbs';

/** Deterministic storage key: presets/thumbs/{category}-{slug}.{ext} */
export function presetThumbKey(
  category: GenPresetCategory,
  slug: string,
  ext: 'png' | 'jpeg' | 'webp',
): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  return `${PRESET_THUMB_FOLDER}/${category}-${safe}.${ext}`;
}

/** Sniff image magic bytes so the stored mime matches the payload. */
export function detectImageExt(buffer: Buffer): 'png' | 'jpeg' | 'webp' {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return 'png';
}

/** Persist a freshly uploaded preview URL onto the catalog row. */
export async function updatePresetPreview(
  client: SupabaseClient,
  category: GenPresetCategory,
  slug: string,
  previewUrl: string,
): Promise<boolean> {
  const { error } = await client
    .from('gen_preset_catalog')
    .update({ preview_url: previewUrl, updated_at: new Date().toISOString() })
    .eq('category', category)
    .eq('slug', slug);
  if (error) {
    if (!isMissingPresetTableError(error)) {
      logger.warn('[gen-presets] preview update failed', {
        category,
        slug,
        err: describeError(error),
      });
    }
    return false;
  }
  catalogCache.clear();
  return true;
}
