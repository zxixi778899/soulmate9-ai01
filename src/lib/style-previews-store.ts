/**
 * Style Previews Store
 *
 * Persists the three visual-style sample images (realistic / anime / 3d)
 * shown on the create page's 外观设定 style cards in site_settings, so the
 * preset-library admin page can swap them at runtime without redeployment.
 *
 * Key: 'creator_style_previews' in site_settings table.
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const STYLE_PREVIEWS_KEY = 'creator_style_previews';

export const STYLE_PREVIEW_KEYS = ['realistic', 'anime'] as const;
export type StylePreviewKey = (typeof STYLE_PREVIEW_KEYS)[number];

/** Fallback artwork (the originally uploaded static samples). */
export const STYLE_PREVIEW_DEFAULTS: Record<StylePreviewKey, string> = {
  realistic:
    'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/style-previews/realistic.png',
  anime:
    'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/style-previews/anime.png',
};

export interface StylePreviewsConfig {
  realistic: string;
  anime: string;
  updated_at?: string;
}

// ─── Persistence ─────────────────────────────────────────────

type SupabaseLike = SiteSettingsClient;

let memoryCache: { config: StylePreviewsConfig; at: number } | null = null;
const CACHE_MS = 15_000;

/** Merge a raw JSONB value over the built-in defaults (empty/invalid → default). */
export function normalizeStylePreviews(raw: unknown): StylePreviewsConfig {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const pick = (k: StylePreviewKey): string => {
    const v = r[k];
    return typeof v === 'string' && v.trim() ? v.trim() : STYLE_PREVIEW_DEFAULTS[k];
  };
  return {
    realistic: pick('realistic'),
    anime: pick('anime'),
    ...(typeof r.updated_at === 'string' ? { updated_at: r.updated_at } : {}),
  };
}

export async function loadStylePreviews(supabase: SupabaseLike): Promise<StylePreviewsConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', STYLE_PREVIEWS_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = normalizeStylePreviews(value);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[style-previews] db load failed', { err: String(e) });
  }

  const config = normalizeStylePreviews(null);
  memoryCache = { config, at: Date.now() };
  return config;
}

export async function saveStylePreviews(
  patch: Partial<Record<StylePreviewKey, string>>,
  supabase: SupabaseLike,
): Promise<StylePreviewsConfig> {
  const current = await loadStylePreviews(supabase);
  const next: StylePreviewsConfig = {
    realistic: patch.realistic || current.realistic,
    anime: patch.anime || current.anime,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('site_settings').upsert(
    { key: STYLE_PREVIEWS_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save style previews');
  }
  memoryCache = { config: next, at: Date.now() };
  return next;
}

export function invalidateStylePreviewsCache(): void {
  memoryCache = null;
}
