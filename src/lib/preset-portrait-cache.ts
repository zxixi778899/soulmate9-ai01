/**
 * Shared preset portrait cache (M3 — 降本核心).
 *
 * Every library preset owns ONE canonical portrait at a fixed storage key
 * `preset-portraits/{slug}.png`. Creations from an unmodified preset reuse it
 * instead of burning a FLUX GPU run; misses fall back to normal generation and
 * lazily write the result back so the next creator gets a hit.
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  publicObjectExists,
  uploadFixedKeyFile,
  toPublicUrl,
  decodeImagePayload,
  deleteFile,
} from '@/lib/storage';
import { logger } from '@/lib/logger';
import type { CreatorPreset } from '@/lib/creator-presets';

export const PRESET_PORTRAIT_FOLDER = 'preset-portraits';

/** Fixed, deterministic storage key for a preset's shared portrait. */
export function presetPortraitKey(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  return `${PRESET_PORTRAIT_FOLDER}/${safe}.png`;
}

/** Public URL of the cached portrait, or null when absent. */
export async function findCachedPresetPortrait(slug: string): Promise<string | null> {
  if (!slug) return null;
  const key = presetPortraitKey(slug);
  const exists = await publicObjectExists(key);
  if (!exists) return null;
  return toPublicUrl(key) || null;
}

/** Best-effort hit/miss telemetry (drives the cache hit-rate dashboard). */
export async function recordPresetPortraitStat(
  slug: string,
  kind: 'hit' | 'miss',
  portraitUrl?: string | null,
): Promise<void> {
  try {
    const client = getSupabaseClient();
    const { data: existing } = await client
      .from('preset_portrait_stats')
      .select('hits, misses')
      .eq('slug', slug)
      .maybeSingle();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      patch.hits = Number((existing as { hits?: number }).hits || 0) + (kind === 'hit' ? 1 : 0);
      patch.misses = Number((existing as { misses?: number }).misses || 0) + (kind === 'miss' ? 1 : 0);
      if (portraitUrl) {
        patch.cached = true;
        patch.portrait_url = portraitUrl;
      }
      await client.from('preset_portrait_stats').update(patch).eq('slug', slug);
    } else {
      await client.from('preset_portrait_stats').insert({
        slug,
        hits: kind === 'hit' ? 1 : 0,
        misses: kind === 'miss' ? 1 : 0,
        cached: Boolean(portraitUrl),
        portrait_url: portraitUrl || null,
        ...patch,
      });
    }
  } catch (e) {
    logger.warn('[preset-portrait-cache] stat recording failed', {
      slug,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Mark the cache row as filled (after a successful writeback). */
export async function markPresetPortraitCached(slug: string, url: string): Promise<void> {
  try {
    const client = getSupabaseClient();
    const { data: existing } = await client
      .from('preset_portrait_stats')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();
    const row = {
      cached: true,
      portrait_url: url,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      await client.from('preset_portrait_stats').update(row).eq('slug', slug);
    } else {
      await client.from('preset_portrait_stats').insert({ slug, hits: 0, misses: 0, ...row });
    }
  } catch (e) {
    logger.warn('[preset-portrait-cache] markCached failed', {
      slug,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Write a freshly generated portrait back into the shared cache.
 * Accepts raw base64 / data-URL payloads from the image worker.
 * Returns the public URL on success, null otherwise.
 */
export async function writebackPresetPortrait(
  slug: string,
  imagePayload: string,
): Promise<string | null> {
  try {
    const buffer = decodeImagePayload(imagePayload);
    const { url } = await uploadFixedKeyFile(buffer, presetPortraitKey(slug), 'image/png');
    await markPresetPortraitCached(slug, url);
    logger.info('[preset-portrait-cache] writeback complete', { slug, url: url.slice(0, 120) });
    return url;
  } catch (e) {
    logger.warn('[preset-portrait-cache] writeback failed', {
      slug,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Remove a preset's shared portrait from the cache (admin 删除图片).
 * Deletes the storage object and marks the stats row uncached so the
 * creator page stops serving it. Best-effort: never throws.
 */
export async function clearPresetPortraitCache(slug: string): Promise<void> {
  if (!slug) return;
  try {
    const key = presetPortraitKey(slug);
    try {
      await deleteFile(key);
    } catch (e) {
      logger.warn('[preset-portrait-cache] storage remove failed', {
        slug,
        err: e instanceof Error ? e.message : String(e),
      });
    }
    const client = getSupabaseClient();
    await client
      .from('preset_portrait_stats')
      .update({ cached: false, portrait_url: null, updated_at: new Date().toISOString() })
      .eq('slug', slug);
    logger.info('[preset-portrait-cache] portrait cleared', { slug });
  } catch (e) {
    logger.warn('[preset-portrait-cache] clear failed', {
      slug,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * True when the submitted appearance is unchanged from the preset —
 * only then is the shared portrait a faithful representation (cache-safe).
 * Empty/missing body fields are treated as "not customized".
 */
export function visualMatchesPreset(
  preset: CreatorPreset,
  body: Record<string, unknown>,
): boolean {
  const str = (v: unknown): string => String(v ?? '').trim().toLowerCase();
  const pairs: Array<[string, string]> = [
    [str(body.gender), str(preset.gender)],
    [str(body.visual_style), str(preset.visual_style)],
    [str(body.ethnicity), str(preset.ethnicity)],
    [str(body.face_shape), str(preset.face_shape)],
    [str(body.hair_style), str(preset.hair_style)],
    [str(body.hair_color), str(preset.hair_color)],
    [str(body.eye_color), str(preset.eye_color)],
    [str(body.body_type), str(preset.body_type)],
    [str(body.fashion_style), str(preset.fashion_style)],
  ];
  return pairs.every(([submitted, fromPreset]) => !submitted || submitted === fromPreset);
}
