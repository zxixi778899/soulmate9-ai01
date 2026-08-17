/**
 * Asset Library Store
 *
 * Persists the admin image asset library (reusable uploaded images) in
 * site_settings so any admin panel can pick from a shared pool instead of
 * re-uploading the same artwork.
 *
 * Key: 'asset_library' in site_settings table.
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const ASSET_LIBRARY_KEY = 'asset_library';

/** Hard cap so the JSONB blob stays small; oldest entries are evicted. */
export const MAX_ASSETS = 100;

export interface AssetItem {
  id: string;
  url: string;
  name: string;
  created_at: string;
}

export interface AssetLibraryConfig {
  items: AssetItem[];
  updated_at?: string;
}

/** Merge a raw JSONB value: keep valid items, newest first, capped. */
export function normalizeAssetLibrary(raw: unknown): AssetLibraryConfig {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = Array.isArray(r.items) ? r.items : [];
  const seen = new Set<string>();
  const items: AssetItem[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!id || !url || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      url,
      name: typeof row.name === 'string' ? row.name : '',
      created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    });
  }

  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return {
    items: items.slice(0, MAX_ASSETS),
    ...(typeof r.updated_at === 'string' ? { updated_at: r.updated_at } : {}),
  };
}

// ─── Persistence ─────────────────────────────────────────────

type SupabaseLike = SiteSettingsClient;

let memoryCache: { config: AssetLibraryConfig; at: number } | null = null;
const CACHE_MS = 15_000;

export async function loadAssetLibrary(supabase: SupabaseLike): Promise<AssetLibraryConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', ASSET_LIBRARY_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = normalizeAssetLibrary(value);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[asset-library] db load failed', { err: String(e) });
  }

  const config = normalizeAssetLibrary(null);
  memoryCache = { config, at: Date.now() };
  return config;
}

async function persist(
  items: AssetItem[],
  supabase: SupabaseLike,
): Promise<AssetLibraryConfig> {
  const next: AssetLibraryConfig = {
    items: items.slice(0, MAX_ASSETS),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('site_settings').upsert(
    { key: ASSET_LIBRARY_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save asset library');
  }
  memoryCache = { config: next, at: Date.now() };
  return next;
}

/** Prepend one uploaded asset (newest first). */
export async function addAssetItem(
  item: Omit<AssetItem, 'created_at'>,
  supabase: SupabaseLike,
): Promise<AssetLibraryConfig> {
  const current = await loadAssetLibrary(supabase);
  const nextItem: AssetItem = { ...item, created_at: new Date().toISOString() };
  return persist([nextItem, ...current.items], supabase);
}

/** Remove one asset by id; returns the removed item (for storage cleanup). */
export async function removeAssetItem(
  id: string,
  supabase: SupabaseLike,
): Promise<{ config: AssetLibraryConfig; removed: AssetItem | null }> {
  const current = await loadAssetLibrary(supabase);
  const removed = current.items.find((it) => it.id === id) || null;
  const config = await persist(
    current.items.filter((it) => it.id !== id),
    supabase,
  );
  return { config, removed };
}

export function invalidateAssetLibraryCache(): void {
  memoryCache = null;
}
