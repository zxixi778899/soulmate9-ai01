/**
 * Gender Previews Store
 *
 * Persists the gender sample images (female / male / transgender) shown on
 * the create page's 风格步 gender cards in site_settings, so admins can
 * upload/replace/clear them at runtime without redeployment — same pattern
 * as style-previews-store.
 *
 * Key: 'creator_gender_previews' in site_settings table.
 * Defaults are empty strings (cards fall back to a symbol placeholder until
 * an admin uploads artwork).
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const GENDER_PREVIEWS_KEY = 'creator_gender_previews';

export const GENDER_PREVIEW_KEYS = ['female', 'male', 'transgender'] as const;
export type GenderPreviewKey = (typeof GENDER_PREVIEW_KEYS)[number];

/** No built-in artwork — empty means "show placeholder". */
export const GENDER_PREVIEW_DEFAULTS: Record<GenderPreviewKey, string> = {
  female: '',
  male: '',
  transgender: '',
};

export interface GenderPreviewsConfig {
  female: string;
  male: string;
  transgender: string;
  updated_at?: string;
}

// ─── Persistence ─────────────────────────────────────────────

type SupabaseLike = SiteSettingsClient;

let memoryCache: { config: GenderPreviewsConfig; at: number } | null = null;
const CACHE_MS = 15_000;

/** Merge a raw JSONB value over the built-in defaults (invalid → default ''). */
export function normalizeGenderPreviews(raw: unknown): GenderPreviewsConfig {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const pick = (k: GenderPreviewKey): string => {
    const v = r[k];
    return typeof v === 'string' ? v.trim() : GENDER_PREVIEW_DEFAULTS[k];
  };
  return {
    female: pick('female'),
    male: pick('male'),
    transgender: pick('transgender'),
    ...(typeof r.updated_at === 'string' ? { updated_at: r.updated_at } : {}),
  };
}

export async function loadGenderPreviews(supabase: SupabaseLike): Promise<GenderPreviewsConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', GENDER_PREVIEWS_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = normalizeGenderPreviews(value);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[gender-previews] db load failed', { err: String(e) });
  }

  const config = normalizeGenderPreviews(null);
  memoryCache = { config, at: Date.now() };
  return config;
}

/**
 * Patch one or more genders. Empty-string values are honored (clear/reset),
 * unlike style previews where '' falls back to the current value.
 */
export async function saveGenderPreviews(
  patch: Partial<Record<GenderPreviewKey, string>>,
  supabase: SupabaseLike,
): Promise<GenderPreviewsConfig> {
  const current = await loadGenderPreviews(supabase);
  const next: GenderPreviewsConfig = {
    female: 'female' in patch ? (patch.female || '') : current.female,
    male: 'male' in patch ? (patch.male || '') : current.male,
    transgender: 'transgender' in patch ? (patch.transgender || '') : current.transgender,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('site_settings').upsert(
    { key: GENDER_PREVIEWS_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save gender previews');
  }
  memoryCache = { config: next, at: Date.now() };
  return next;
}

export function invalidateGenderPreviewsCache(): void {
  memoryCache = null;
}
