/**
 * Generate-workbench custom presets store
 *
 * Admin-managed pose / outfit / scene preset cards for the /generate console
 * (preview image + bilingual label + prompt hint). Persisted in site_settings
 * so admins can create/upload/delete them at runtime without redeployment —
 * same pattern as preset-previews-store.
 *
 * Key: 'generate_custom_presets' in site_settings table.
 * Shape: { pose: Entry[], outfit: Entry[], scene: Entry[], updated_at }
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const GEN_CUSTOM_PRESETS_KEY = 'generate_custom_presets';

export const GEN_CUSTOM_PRESET_CATEGORIES = ['pose', 'outfit', 'scene'] as const;
export type GenCustomPresetCategory = (typeof GEN_CUSTOM_PRESET_CATEGORIES)[number];

export interface GenCustomPreset {
  slug: string;
  category: GenCustomPresetCategory;
  label_en: string;
  label_zh: string;
  preview_url: string;
  prompt_hint: string;
  created_at: string;
}

export type GenCustomPresetsConfig = Partial<
  Record<GenCustomPresetCategory, GenCustomPreset[]>
> & { updated_at?: string };

export function isGenCustomPresetCategory(v: unknown): v is GenCustomPresetCategory {
  return GEN_CUSTOM_PRESET_CATEGORIES.includes(v as GenCustomPresetCategory);
}

/** Merge a raw JSONB value into a normalized config (invalid entries dropped). */
export function normalizeGenCustomPresets(raw: unknown): GenCustomPresetsConfig {
  const r = (
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  ) as Record<string, unknown>;
  const config: GenCustomPresetsConfig = {};
  for (const category of GEN_CUSTOM_PRESET_CATEGORIES) {
    const list = r[category];
    if (!Array.isArray(list)) continue;
    const entries: GenCustomPreset[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      const slug = typeof e.slug === 'string' ? e.slug.trim() : '';
      const previewUrl = typeof e.preview_url === 'string' ? e.preview_url.trim() : '';
      const labelEn = typeof e.label_en === 'string' ? e.label_en.trim() : '';
      if (!slug || !previewUrl || !labelEn) continue;
      entries.push({
        slug,
        category,
        label_en: labelEn,
        label_zh: typeof e.label_zh === 'string' ? e.label_zh.trim() : '',
        preview_url: previewUrl,
        prompt_hint: typeof e.prompt_hint === 'string' ? e.prompt_hint.trim() : '',
        created_at: typeof e.created_at === 'string' ? e.created_at : '',
      });
    }
    if (entries.length) config[category] = entries;
  }
  if (typeof r.updated_at === 'string') config.updated_at = r.updated_at;
  return config;
}

// ─── Persistence ─────────────────────────────────────────────

let memoryCache: { config: GenCustomPresetsConfig; at: number } | null = null;
const CACHE_MS = 15_000;

export async function loadGenCustomPresets(
  supabase: SiteSettingsClient,
): Promise<GenCustomPresetsConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', GEN_CUSTOM_PRESETS_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = normalizeGenCustomPresets(value);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[gen-custom-presets] db load failed', { err: String(e) });
  }

  const config = normalizeGenCustomPresets(null);
  memoryCache = { config, at: Date.now() };
  return config;
}

async function persist(
  supabase: SiteSettingsClient,
  next: GenCustomPresetsConfig,
): Promise<GenCustomPresetsConfig> {
  const { error } = await supabase.from('site_settings').upsert(
    { key: GEN_CUSTOM_PRESETS_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message || 'failed to save custom presets');
  memoryCache = { config: next, at: Date.now() };
  return next;
}

/** Append one admin-created preset entry. */
export async function addGenCustomPreset(
  entry: Omit<GenCustomPreset, 'slug' | 'created_at'>,
  supabase: SiteSettingsClient,
): Promise<{ config: GenCustomPresetsConfig; entry: GenCustomPreset }> {
  const current = await loadGenCustomPresets(supabase);
  const slug = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const full: GenCustomPreset = { ...entry, slug, created_at: new Date().toISOString() };
  const bucket = [...(current[entry.category] || []), full];
  const next: GenCustomPresetsConfig = { ...current, updated_at: new Date().toISOString() };
  next[entry.category] = bucket;
  const config = await persist(supabase, next);
  return { config, entry: full };
}

/** Replace the preview image of one entry (empty url not allowed). */
export async function setGenCustomPresetPreview(
  category: GenCustomPresetCategory,
  slug: string,
  url: string,
  supabase: SiteSettingsClient,
): Promise<GenCustomPresetsConfig> {
  const current = await loadGenCustomPresets(supabase);
  const bucket = (current[category] || []).map((e) =>
    e.slug === slug ? { ...e, preview_url: url } : e,
  );
  const next: GenCustomPresetsConfig = { ...current, updated_at: new Date().toISOString() };
  next[category] = bucket;
  return persist(supabase, next);
}

/** Update editable fields of an existing entry. */
export async function updateGenCustomPreset(
  category: GenCustomPresetCategory,
  slug: string,
  updates: { label_en?: string; label_zh?: string; prompt_hint?: string; preview_url?: string },
  supabase: SiteSettingsClient,
): Promise<GenCustomPresetsConfig> {
  const current = await loadGenCustomPresets(supabase);
  if (!(category in current)) {
    throw new Error(`Preset category not found: ${category}`);
  }
  if (!current[category]?.some(e => e.slug === slug)) {
    throw new Error(`Preset not found: ${category}/${slug}`);
  }
  const bucket = (current[category] || []).map((e) =>
    e.slug === slug ? { ...e, ...updates } : e,
  );
  const next: GenCustomPresetsConfig = { ...current, updated_at: new Date().toISOString() };
  next[category] = bucket;
  return persist(supabase, next);
}

/** Remove one entry by slug. */
export async function removeGenCustomPreset(
  category: GenCustomPresetCategory,
  slug: string,
  supabase: SiteSettingsClient,
): Promise<GenCustomPresetsConfig> {
  const current = await loadGenCustomPresets(supabase);
  const bucket = (current[category] || []).filter((e) => e.slug !== slug);
  const next: GenCustomPresetsConfig = { ...current, updated_at: new Date().toISOString() };
  next[category] = bucket;
  return persist(supabase, next);
}

export function invalidateGenCustomPresetsCache(): void {
  memoryCache = null;
}
