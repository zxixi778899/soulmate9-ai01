/**
 * Site Copy Store
 *
 * Persists admin-managed text overrides (site copy) in site_settings so the
 * admin copywriting panel can adjust homepage wording at runtime without
 * redeployment. Empty values fall back to the built-in i18n translations.
 *
 * Key: 'site_copy' in site_settings table.
 */

import { logger } from '@/lib/logger';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import type { TranslationKey } from '@/lib/i18n/types';

export const SITE_COPY_KEY = 'site_copy';

export const COPY_KEYS = [
  'heroTitleLead',
  'heroTitleRest',
  'heroTaglineLead',
  'heroTaglineRest',
  'liveTitle',
  'hotTitle',
  'leaderboardTitle',
  'modulesTitle',
  'promoTopupTitle',
  'promoQuestTitle',
  'guestTitle',
  'guestCta',
  'bannerBadge',
  'bannerTitle',
  'bannerSub',
  'bannerChip1',
  'bannerChip2',
  'bannerChip3',
  'bannerCta',
] as const;
export type CopyKey = (typeof COPY_KEYS)[number];

/** Admin-facing metadata: Chinese position label + fallback i18n key. */
export const COPY_META: Record<CopyKey, { label: string; i18nKey: TranslationKey }> = {
  heroTitleLead: { label: 'Hero 主标题（前半）', i18nKey: 'home.chooseYour' },
  heroTitleRest: { label: 'Hero 主标题（后半）', i18nKey: 'home.obsession' },
  heroTaglineLead: { label: 'Hero 副标题（前半）', i18nKey: 'home.heroTaglineLead' },
  heroTaglineRest: { label: 'Hero 副标题（后半）', i18nKey: 'home.heroTaglineRest' },
  liveTitle: { label: 'LIVE 区标题', i18nKey: 'home.liveNow' },
  hotTitle: { label: '热门推荐区标题', i18nKey: 'home.hotTitle' },
  leaderboardTitle: { label: '排行榜区标题', i18nKey: 'community.topCreatorRanking' },
  modulesTitle: { label: '功能模块区标题', i18nKey: 'home.modulesTitle' },
  promoTopupTitle: { label: '推广横幅 · 充值标题', i18nKey: 'home.promoTopup' },
  promoQuestTitle: { label: '推广横幅 · 任务标题', i18nKey: 'home.promoQuest' },
  guestTitle: { label: '游客条 · 标题', i18nKey: 'home.guestTitle' },
  guestCta: { label: '游客条 · 副文案', i18nKey: 'home.guestCta' },
  bannerBadge: { label: '广告横幅 · 角标', i18nKey: 'ads.weekly.badge' },
  bannerTitle: { label: '广告横幅 · 主标题', i18nKey: 'ads.weekly.title' },
  bannerSub: { label: '广告横幅 · 副标题（无则留空）', i18nKey: 'ads.sale.sub' },
  bannerChip1: { label: '广告横幅 · 卖点 1', i18nKey: 'ads.weekly.f1' },
  bannerChip2: { label: '广告横幅 · 卖点 2', i18nKey: 'ads.weekly.f2' },
  bannerChip3: { label: '广告横幅 · 卖点 3', i18nKey: 'ads.weekly.f3' },
  bannerCta: { label: '广告横幅 · 按钮文案', i18nKey: 'ads.weekly.cta' },
};

export type SiteCopy = Partial<Record<CopyKey, string>>;

export function isCopyKey(v: unknown): v is CopyKey {
  return COPY_KEYS.includes(v as CopyKey);
}

/** Keep only known keys with non-empty string values. */
export function normalizeSiteCopy(raw: unknown): SiteCopy {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const copy: SiteCopy = {};
  for (const key of COPY_KEYS) {
    const value = r[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) copy[key] = trimmed;
    }
  }
  return copy;
}

// ─── Persistence ─────────────────────────────────────────────

type SupabaseLike = SiteSettingsClient;

let memoryCache: { copy: SiteCopy; at: number } | null = null;
const CACHE_MS = 15_000;

export async function loadSiteCopy(supabase: SupabaseLike): Promise<SiteCopy> {
  if (memoryCache && Date.now() - memoryCache.at < CACHE_MS) {
    return memoryCache.copy;
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SITE_COPY_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const value = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const copy = normalizeSiteCopy(value);
      memoryCache = { copy, at: Date.now() };
      return copy;
    }
  } catch (e) {
    logger.warn('[site-copy] db load failed', { err: String(e) });
  }

  const copy: SiteCopy = {};
  memoryCache = { copy, at: Date.now() };
  return copy;
}

/** Set one copy value ('' removes the override → falls back to i18n). */
export async function setSiteCopyValue(
  key: CopyKey,
  value: string,
  supabase: SupabaseLike,
): Promise<SiteCopy> {
  const current = normalizeSiteCopy(await loadSiteCopy(supabase));
  const trimmed = value.trim();
  const next: SiteCopy = { ...current };
  if (trimmed) next[key] = trimmed;
  else delete next[key];

  const updated_at = new Date().toISOString();
  const { error } = await supabase.from('site_settings').upsert(
    { key: SITE_COPY_KEY, value: next, updated_at },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(error.message || 'failed to save site copy');
  }
  memoryCache = { copy: next, at: Date.now() };
  return next;
}

export function invalidateSiteCopyCache(): void {
  memoryCache = null;
}
