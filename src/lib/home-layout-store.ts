/**
 * Home Layout Store
 *
 * Persists the homepage section layout (order / visibility / image overrides)
 * in site_settings so the in-page admin panel can rearrange the homepage at
 * runtime without redeployment.
 *
 * Key: 'home_layout' in site_settings table.
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';

export const HOME_LAYOUT_KEY = 'home_layout';

export const HOME_SECTION_IDS = [
  'adsBanner',
  'announcement',
  'hero',
  'liveRail',
  'guestStrip',
  'filters',
  'hotGrid',
  'leaderboard',
  'modules',
  'promo',
  'footer',
] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

/** Sections that support an admin-uploaded image override. */
export const IMAGE_SECTION_IDS: readonly HomeSectionId[] = ['adsBanner', 'hero', 'promo'];

/** Background artwork variants for the two in-grid promo cards (hotGrid). */
export interface GridPromoImages {
  recharge: string;
  firstTopup: string;
}

export const GRID_PROMO_DEFAULTS: GridPromoImages = { recharge: '', firstTopup: '' };

export type GridPromoVariant = keyof GridPromoImages;

export function isGridPromoVariant(v: unknown): v is GridPromoVariant {
  return v === 'recharge' || v === 'firstTopup';
}

export interface HomeSectionConfig {
  id: HomeSectionId;
  visible: boolean;
  /** Optional image override URL ('' = none). Only consumed by IMAGE_SECTION_IDS. */
  image: string;
}

export interface HomeLayoutConfig {
  sections: HomeSectionConfig[];
  /** Background images for the two grid promo cards ('' = gradient default). */
  gridPromo: GridPromoImages;
  updated_at?: string;
}

export const HOME_LAYOUT_DEFAULTS: HomeSectionConfig[] = HOME_SECTION_IDS.map((id) => ({
  id,
  visible: true,
  image: '',
}));

export function isHomeSectionId(v: unknown): v is HomeSectionId {
  return HOME_SECTION_IDS.includes(v as HomeSectionId);
}

/**
 * Merge a raw JSONB value over the built-in defaults:
 * keep the stored order for known sections, drop unknown ids, and append any
 * newly introduced sections at the end (default visible, no image).
 */
export function normalizeHomeLayout(raw: unknown): HomeLayoutConfig {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = Array.isArray(r.sections) ? r.sections : [];
  const seen = new Set<HomeSectionId>();
  const sections: HomeSectionConfig[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    if (!isHomeSectionId(id) || seen.has(id)) continue;
    seen.add(id);
    sections.push({
      id,
      visible: row.visible !== false,
      image: typeof row.image === 'string' ? row.image.trim() : '',
    });
  }

  for (const id of HOME_SECTION_IDS) {
    if (!seen.has(id)) sections.push({ id, visible: true, image: '' });
  }

  const gp = (r.gridPromo && typeof r.gridPromo === 'object' ? r.gridPromo : {}) as Record<
    string,
    unknown
  >;
  const gridPromo: GridPromoImages = {
    recharge: typeof gp.recharge === 'string' ? gp.recharge.trim() : '',
    firstTopup: typeof gp.firstTopup === 'string' ? gp.firstTopup.trim() : '',
  };

  return {
    sections,
    gridPromo,
    ...(typeof r.updated_at === 'string' ? { updated_at: r.updated_at } : {}),
  };
}

// ─── Persistence ─────────────────────────────────────────────

type SupabaseLike = SiteSettingsClient;

let memoryCache: { config: HomeLayoutConfig; at: number } | null = null;
const CACHE_MS = 15_000;

export async function loadHomeLayout(supabase: SupabaseLike): Promise<HomeLayoutConfig> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.config;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', HOME_LAYOUT_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const config = normalizeHomeLayout(value);
      memoryCache = { config, at: Date.now() };
      return config;
    }
  } catch (e) {
    logger.warn('[home-layout] db load failed', { err: String(e) });
  }

  const config = normalizeHomeLayout(null);
  memoryCache = { config, at: Date.now() };
  return config;
}

/** Overwrite the whole layout (section order / visibility / images). */
export async function saveHomeLayout(
  sections: HomeSectionConfig[],
  supabase: SupabaseLike,
  gridPromo?: GridPromoImages,
): Promise<HomeLayoutConfig> {
  const current = gridPromo ? null : await loadHomeLayout(supabase);
  const next: HomeLayoutConfig = {
    sections: normalizeHomeLayout({ sections }).sections,
    gridPromo: gridPromo || (current ? current.gridPromo : { ...GRID_PROMO_DEFAULTS }),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('site_settings').upsert(
    { key: HOME_LAYOUT_KEY, value: next, updated_at: next.updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save home layout');
  }
  memoryCache = { config: next, at: Date.now() };
  return next;
}

/** Patch one section's image override ('' clears it). */
export async function setHomeSectionImage(
  id: HomeSectionId,
  image: string,
  supabase: SupabaseLike,
): Promise<HomeLayoutConfig> {
  const current = await loadHomeLayout(supabase);
  const sections = current.sections.map((s) => (s.id === id ? { ...s, image } : s));
  return saveHomeLayout(sections, supabase, current.gridPromo);
}

/** Patch one grid promo card's background image ('' clears it). */
export async function setGridPromoImage(
  variant: GridPromoVariant,
  image: string,
  supabase: SupabaseLike,
): Promise<HomeLayoutConfig> {
  const current = await loadHomeLayout(supabase);
  return saveHomeLayout(current.sections, supabase, {
    ...current.gridPromo,
    [variant]: image,
  });
}

export function invalidateHomeLayoutCache(): void {
  memoryCache = null;
}
