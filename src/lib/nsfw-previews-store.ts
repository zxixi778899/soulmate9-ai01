/**
 * NSFW Level Previews Store
 *
 * Persists the five content-level sample images (level 1-5) shown on the
 * create page's 内容级别 cards in site_settings, so admins can swap them at
 * runtime without redeployment. Mirrors style-previews-store.ts.
 *
 * Key: 'creator_nsfw_previews' in site_settings table.
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const NSFW_PREVIEWS_KEY = 'creator_nsfw_previews';

export const NSFW_PREVIEW_KEYS = ['1', '2', '3', '4', '5'] as const;
export type NsfwPreviewKey = (typeof NSFW_PREVIEW_KEYS)[number];

/** Fallback artwork (the originally uploaded level samples). */
export const NSFW_PREVIEW_DEFAULTS: Record<NsfwPreviewKey, string> = {
  '1': 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-1.png',
  '2': 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-2.png',
  '3': 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-3.png',
  '4': 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-4.png',
  '5': 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/nsfw-previews/level-5.png',
};

export type NsfwPreviewsConfig = Record<NsfwPreviewKey, string> & { updated_at?: string };

// ─── Persistence ─────────────────────────────────────────────

type SupabaseLike = SiteSettingsClient;

let memoryCache: { config: NsfwPreviewsConfig; at: number } | null = null;
const CACHE_MS = 15_000;

/** Merge a raw JSONB value over the built-in defaults (empty/invalid → default). */
export function normalizeNsfwPreviews(raw: unknown): NsfwPreviewsConfig {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const pick = (k: NsfwPreviewKey): string => {
    const v = r[k];
    return typeof v === 'string' && v.trim() ? v.trim() : NSFW_PREVIEW_DEFAULTS[k];
  };
  return {
    '1': pick('1'),
    '2': pick('2'),
    '3': pick('3'),
    '4': pick('4'),
    '5': pick('5'),
    ...(typeof r.updated_at === 'string' ? { updated_at: r.updated_at } : {}),
  };
}

export async function loadNsfwPreviews(supabase: SupabaseLike): Promise<NsfwPreviewsConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', NSFW_PREVIEWS_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = normalizeNsfwPreviews(value);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[nsfw-previews] db load failed', { err: String(e) });
  }

  const config = normalizeNsfwPreviews(null);
  memoryCache = { config, at: Date.now() };
  return config;
}

export async function saveNsfwPreviews(
  patch: Partial<Record<NsfwPreviewKey, string>>,
  supabase: SupabaseLike,
): Promise<NsfwPreviewsConfig> {
  const current = await loadNsfwPreviews(supabase);
  const next: NsfwPreviewsConfig = {
    '1': patch['1'] || current['1'],
    '2': patch['2'] || current['2'],
    '3': patch['3'] || current['3'],
    '4': patch['4'] || current['4'],
    '5': patch['5'] || current['5'],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('site_settings').upsert(
    { key: NSFW_PREVIEWS_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save nsfw previews');
  }
  memoryCache = { config: next, at: Date.now() };
  return next;
}

export function invalidateNsfwPreviewsCache(): void {
  memoryCache = null;
}
