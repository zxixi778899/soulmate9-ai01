/**
 * Creator Previews Store
 *
 * Persists the face-creator preview catalog (3 genders x 3 visual styles)
 * in site_settings so admins can swap preview images without redeployment.
 *
 * Key: 'creator_previews' in site_settings table.
 *
 * The creator page shows exactly 3 preview cards (Female / Male / Transgender)
 * for the currently selected visual style (realistic / anime / 3d). Switching
 * style swaps the 3 preview images. All images are admin-configurable.
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const CREATOR_PREVIEWS_KEY = 'creator_previews';

// ─── Dimensions ──────────────────────────────────────────────

export const PREVIEW_GENDERS = ['Female', 'Male', 'Transgender'] as const;
export type PreviewGender = (typeof PREVIEW_GENDERS)[number];

export const PREVIEW_STYLES = ['realistic', 'anime', '3d'] as const;
export type PreviewStyle = (typeof PREVIEW_STYLES)[number];

export const GENDER_LABELS: Record<PreviewGender, { en: string; zh: string }> = {
  Female: { en: 'Female', zh: '女性' },
  Male: { en: 'Male', zh: '男性' },
  Transgender: { en: 'Trans', zh: '跨性别' },
};

export const STYLE_LABELS: Record<PreviewStyle, { en: string; zh: string }> = {
  realistic: { en: 'Realistic', zh: '写实' },
  anime: { en: 'Anime', zh: '二次元' },
  '3d': { en: '3D Animation', zh: '3D动画' },
};

// ─── Config Shape ────────────────────────────────────────────

export interface CreatorPreview {
  gender: PreviewGender;
  visual_style: PreviewStyle;
  thumbnail_url: string;
  is_active: boolean;
  sort_order: number;
}

export interface CreatorPreviewsConfig {
  version: number;
  updated_at: string;
  previews: CreatorPreview[];
}

// ─── Defaults (seeded from existing preset portraits) ────────

const STORAGE = 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits';

function createDefaultConfig(): CreatorPreviewsConfig {
  const preset = (name: string) => `${STORAGE}/presets/${name}.jpg`;
  const gen = (name: string) => `${STORAGE}/creator-previews/${name}.jpg`;
  const seed: Record<string, string> = {
    'Female|realistic': preset('luna'),
    'Female|anime': preset('sakura'),
    'Female|3d': gen('3d-female'),
    'Male|realistic': preset('kai'),
    'Male|anime': gen('anime-male'),
    'Male|3d': gen('3d-male'),
    'Transgender|realistic': preset('aria'),
    'Transgender|anime': preset('nova'),
    'Transgender|3d': gen('3d-transgender'),
  };

  const previews: CreatorPreview[] = [];
  let order = 0;
  for (const style of PREVIEW_STYLES) {
    for (const gender of PREVIEW_GENDERS) {
      order += 1;
      previews.push({
        gender,
        visual_style: style,
        thumbnail_url: seed[`${gender}|${style}`] || '',
        is_active: true,
        sort_order: order,
      });
    }
  }

  return { version: 1, updated_at: new Date().toISOString(), previews };
}

// ─── Persistence ─────────────────────────────────────────────

type SupabaseLike = SiteSettingsClient;

let memoryCache: { config: CreatorPreviewsConfig; at: number } | null = null;
const CACHE_MS = 15_000;

export async function loadCreatorPreviews(supabase: SupabaseLike): Promise<CreatorPreviewsConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', CREATOR_PREVIEWS_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = mergeWithDefaults(value as Partial<CreatorPreviewsConfig>);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[creator-previews] db load failed', { err: String(e) });
  }

  const config = createDefaultConfig();
  memoryCache = { config, at: Date.now() };
  return config;
}

export async function saveCreatorPreviews(
  config: CreatorPreviewsConfig,
  supabase: SupabaseLike,
): Promise<void> {
  const next: CreatorPreviewsConfig = {
    ...config,
    version: 1,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('site_settings').upsert(
    { key: CREATOR_PREVIEWS_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save creator previews');
  }
  memoryCache = { config: next, at: Date.now() };
}

export function invalidateCreatorPreviewsCache(): void {
  memoryCache = null;
}

/** Ensure all 9 gender x style slots exist (fills missing with defaults). */
function mergeWithDefaults(raw: Partial<CreatorPreviewsConfig>): CreatorPreviewsConfig {
  const defaults = createDefaultConfig();
  const incoming = Array.isArray(raw.previews) ? raw.previews : [];

  const previews = defaults.previews.map((slot) => {
    const found = incoming.find(
      (p) => p && p.gender === slot.gender && p.visual_style === slot.visual_style,
    );
    return found ? { ...slot, ...found } : slot;
  });

  return {
    version: raw.version || 1,
    updated_at: raw.updated_at || new Date().toISOString(),
    previews,
  };
}
