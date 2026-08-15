/**
 * Unified generation preset catalog (gen_preset_catalog, migration 0040).
 *
 * Converges the 7 legacy preset files into one admin-maintained source.
 * The legacy files stay in place as runtime fallbacks: when the table is
 * missing (migration not applied yet) or empty, the legacy mapping serves
 * the same shape so every caller keeps working.
 *
 * Categories: scene | pose | outfit | style | mood
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { PRESET_LIBRARY, PRESET_VIBE_LABELS, type PresetVibe } from '@/lib/preset-library';
import { ADULT_SCENE_PRESETS } from '@/lib/comfy-console/adult-scene-presets';
import { GIRLFRIEND_SCENE_RECIPES } from '@/lib/prompt/girlfriend';

export type GenPresetCategory = 'scene' | 'pose' | 'outfit' | 'style' | 'mood';

export const GEN_PRESET_CATEGORIES: readonly GenPresetCategory[] = [
  'scene',
  'pose',
  'outfit',
  'style',
  'mood',
];

export function isGenPresetCategory(value: unknown): value is GenPresetCategory {
  return GEN_PRESET_CATEGORIES.includes(value as GenPresetCategory);
}

export type GenPresetTier = 'free' | 'premium';

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

// ─────────────────────────── seeding / writes ───────────────────────────

/**
 * Upsert the full legacy mapping into gen_preset_catalog. Idempotent
 * (onConflict category,slug); admins can then edit rows freely.
 */
export async function seedPresetsFromLegacy(
  client: SupabaseClient,
): Promise<{ upserted: number; error: string | null }> {
  const rows = buildLegacyCatalog().map((preset) => ({
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
    updated_at: new Date().toISOString(),
  }));

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
