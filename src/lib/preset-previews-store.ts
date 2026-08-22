/**
 * Preset Previews Store
 *
 * Persists admin-managed sample images for the create page preset card
 * groups (ethnicity / hair_style / body_type / fashion_style) in
 * site_settings, so admins can upload/replace/clear them at runtime without
 * redeployment — same pattern as gender-previews-store.
 *
 * Key: 'creator_preset_previews' in site_settings table.
 * Shape: { [category]: { [optionValue]: url }, updated_at }
 * A missing/empty entry means "show the emoji placeholder".
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const PRESET_PREVIEWS_KEY = 'creator_preset_previews';

export const PRESET_PREVIEW_CATEGORIES = [
  'ethnicity',
  'hair_style',
  'body_type',
  'fashion_style',
] as const;
export type PresetPreviewCategory = (typeof PRESET_PREVIEW_CATEGORIES)[number];

export type PresetPreviewsConfig = Partial<
  Record<PresetPreviewCategory, Record<string, string>>
> & { updated_at?: string };

export function isPresetPreviewCategory(v: unknown): v is PresetPreviewCategory {
  return PRESET_PREVIEW_CATEGORIES.includes(v as PresetPreviewCategory);
}

// ─── Persistence ─────────────────────────────────────────────

let memoryCache: { config: PresetPreviewsConfig; at: number } | null = null;
const CACHE_MS = 15_000;

/** Merge a raw JSONB value into a normalized config (invalid entries dropped). */
export function normalizePresetPreviews(raw: unknown): PresetPreviewsConfig {
  const r = (
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  ) as Record<string, unknown>;
  const config: PresetPreviewsConfig = {};
  for (const category of PRESET_PREVIEW_CATEGORIES) {
    const bucket = r[category];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) continue;
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(bucket as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) entries[key] = value.trim();
    }
    if (Object.keys(entries).length) config[category] = entries;
  }
  if (typeof r.updated_at === 'string') config.updated_at = r.updated_at;
  return config;
}

export async function loadPresetPreviews(
  supabase: SiteSettingsClient,
): Promise<PresetPreviewsConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', PRESET_PREVIEWS_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = normalizePresetPreviews(value);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[preset-previews] db load failed', { err: String(e) });
  }

  const config = normalizePresetPreviews(null);
  memoryCache = { config, at: Date.now() };
  return config;
}

/** Set or clear one option image. Empty url removes the entry (placeholder). */
export async function savePresetPreview(
  category: PresetPreviewCategory,
  key: string,
  url: string,
  supabase: SiteSettingsClient,
): Promise<PresetPreviewsConfig> {
  const current = await loadPresetPreviews(supabase);
  const bucket: Record<string, string> = { ...(current[category] || {}) };
  if (url.trim()) bucket[key] = url.trim();
  else delete bucket[key];

  const next: PresetPreviewsConfig = { ...current, updated_at: new Date().toISOString() };
  next[category] = bucket;

  const { error } = await supabase.from('site_settings').upsert(
    { key: PRESET_PREVIEWS_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save preset previews');
  }
  memoryCache = { config: next, at: Date.now() };
  return next;
}

export function invalidatePresetPreviewsCache(): void {
  memoryCache = null;
}
