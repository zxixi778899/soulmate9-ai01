/**
 * Load public catalog companions for home / explore.
 * Resilient to missing optional columns (access_status, rarity, base_*).
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl, looksLikePromptText, toPublicUrl } from '@/lib/storage';
import { safeDisplayName, extractPersonName, looksLikeFluxPrompt } from '@/lib/prompt/shared';
import { logger } from '@/lib/logger';

/** Columns that always exist on production girlfriends table */
const CORE_SELECT =
  'id, name, age, slug, tags, short_description, portrait_url, avatar_url, personality, created_at, is_public, review_status, avatar_video_url, portrait_video_url';

/** Optional catalog columns (migration 0007) — probed once */
let _optionalCols: string | null | undefined;

async function optionalSelectFragment(): Promise<string> {
  if (_optionalCols !== undefined) return _optionalCols || '';
  const sb = getSupabaseClient();
  // Probe one optional column set
  const { error } = await sb.from('girlfriends').select('access_status, rarity').limit(1);
  if (error) {
    _optionalCols = '';
    logger.warn('[public-companions] optional columns missing — using core fields only', {
      err: error.message,
    });
    return '';
  }
  _optionalCols =
    ', rarity, access_status, unlock_price_tokens, base_intimacy, base_desire, base_development, base_kink';
  return _optionalCols;
}

function sanitizeName(raw: string, slug?: string | null): string {
  const fromSlug = slug
    ? slug
        .split('-')
        .filter((p) => p && !/^[a-z0-9]{6,}$/i.test(p))
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : '';
  if (!raw?.trim()) return fromSlug || 'Companion';
  if (!looksLikeFluxPrompt(raw) && raw.length <= 48) return raw.trim();
  return (
    extractPersonName(raw) ||
    safeDisplayName(raw, fromSlug || 'Companion') ||
    fromSlug ||
    'Companion'
  );
}

async function resolveMediaUrl(
  ...candidates: Array<string | null | undefined>
): Promise<string> {
  for (const raw of candidates) {
    if (!raw) continue;
    if (looksLikePromptText(raw)) continue;
    if (
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:image/') ||
      raw.startsWith('data:video/')
    ) {
      return raw;
    }
    // bare storage key
    if (!raw.startsWith('/') && raw.includes('/')) {
      const pub = toPublicUrl(raw) || (await resolveImageUrl(raw));
      if (pub?.startsWith('http')) return pub;
    }
    // local public path like /avatars/x.jpg — keep as-is for Next static
    if (raw.startsWith('/')) return raw;
  }
  return '';
}

async function resolvePortrait(
  portrait: string | null | undefined,
  avatar: string | null | undefined,
): Promise<string> {
  return resolveMediaUrl(portrait, avatar);
}

export interface PublicCompanionRow {
  id: string;
  name: string;
  age: number | null;
  slug: string | null;
  tags: string[] | null;
  short_description: string | null;
  portrait_url: string | null;
  avatar_url: string | null;
  image_url: string;
  /** Preferred card/portrait loop video */
  video_url?: string | null;
  portrait_video_url?: string | null;
  avatar_video_url?: string | null;
  personality: string | null;
  rarity?: string | null;
  access_status?: string | null;
  unlock_price_tokens?: number | null;
  base_intimacy?: number | null;
  base_desire?: number | null;
  base_development?: number | null;
  base_kink?: number | null;
  created_at?: string | null;
  is_demo?: boolean;
  /** Homepage placement metadata from admin featured/hot lists */
  list_kind?: 'featured' | 'hot' | 'public';
  sort_order?: number | null;
  hot_score?: number | null;
  is_featured?: boolean;
  is_hot?: boolean;
}

/**
 * Primary source: approved public girlfriends from DB.
 */
export async function loadPublicGirlfriends(limit = 48): Promise<PublicCompanionRow[]> {
  const sb = getSupabaseClient();
  const opt = await optionalSelectFragment();
  const select = CORE_SELECT + opt;

  let q = sb
    .from('girlfriends')
    .select(select)
    .eq('is_public', true)
    .eq('review_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);

  // If access_status exists, hide closed
  if (opt.includes('access_status')) {
    q = q.or('access_status.is.null,access_status.neq.closed');
  }

  const { data, error } = await q;
  if (error) {
    logger.error('[public-companions] girlfriends query failed', { err: error.message });
    throw error;
  }

  const rows = (data || []) as unknown as Record<string, unknown>[];
  const out: PublicCompanionRow[] = [];

  for (const g of rows) {
    const image_url = await resolvePortrait(
      g.portrait_url as string | null,
      g.avatar_url as string | null,
    );
    const portrait_video_url = await resolveMediaUrl(
      g.portrait_video_url as string | null,
    );
    const avatar_video_url = await resolveMediaUrl(
      g.avatar_video_url as string | null,
    );
    const video_url = portrait_video_url || avatar_video_url || null;
    const name = sanitizeName(String(g.name || ''), g.slug as string | null);
    out.push({
      id: String(g.id),
      name,
      age: (g.age as number) ?? null,
      slug: (g.slug as string) ?? null,
      tags: (g.tags as string[]) ?? null,
      short_description: (g.short_description as string) ?? null,
      portrait_url: image_url || (g.portrait_url as string) || null,
      avatar_url: image_url || (g.avatar_url as string) || null,
      image_url,
      video_url,
      portrait_video_url: portrait_video_url || null,
      avatar_video_url: avatar_video_url || null,
      personality: (g.personality as string) ?? null,
      rarity: (g.rarity as string) ?? null,
      access_status: (g.access_status as string) ?? 'open',
      unlock_price_tokens: (g.unlock_price_tokens as number) ?? 0,
      base_intimacy: (g.base_intimacy as number) ?? null,
      base_desire: (g.base_desire as number) ?? null,
      base_development: (g.base_development as number) ?? null,
      base_kink: (g.base_kink as number) ?? null,
      created_at: (g.created_at as string) ?? null,
      is_demo: false,
    });
  }

  return out;
}

/**
 * Secondary: featured_girlfriends commerce table (only rows with usable images).
 */
export async function loadFeaturedTable(limit = 24): Promise<PublicCompanionRow[]> {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('featured_girlfriends')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(limit);
    if (error || !data?.length) return [];

    const out: PublicCompanionRow[] = [];
    for (const f of data as Record<string, unknown>[]) {
      const avatar = String(f.avatar_url || '');
      // Skip marketing placeholders without real storage URLs
      const image_url = await resolvePortrait(avatar, null);
      if (!image_url || image_url.startsWith('/avatars/')) {
        // try join base girlfriend
        if (f.base_girlfriend_id) {
          const { data: base } = await sb
            .from('girlfriends')
            .select(CORE_SELECT)
            .eq('id', f.base_girlfriend_id)
            .maybeSingle();
          if (base) {
            const img = await resolvePortrait(
              (base as { portrait_url?: string }).portrait_url,
              (base as { avatar_url?: string }).avatar_url,
            );
            if (img) {
              out.push({
                id: String((base as { id: string }).id),
                name: sanitizeName(
                  String(f.name || (base as { name?: string }).name || ''),
                  (base as { slug?: string }).slug,
                ),
                age: (base as { age?: number }).age ?? null,
                slug: (base as { slug?: string }).slug ?? null,
                tags:
                  (f.personality_tags as string[]) ||
                  ((base as { tags?: string[] }).tags ?? null),
                short_description:
                  (f.description as string) ||
                  (base as { short_description?: string }).short_description ||
                  null,
                portrait_url: img,
                avatar_url: img,
                image_url: img,
                personality: (base as { personality?: string }).personality ?? null,
                access_status: 'open',
                is_demo: false,
                list_kind: 'featured',
                is_featured: true,
                sort_order: Number(f.sort_order ?? 0) || 0,
                hot_score: 1000 - (Number(f.sort_order ?? 0) || 0) + Number(f.click_count ?? 0),
              });
            }
          }
        }
        continue;
      }
      out.push({
        id: String(f.base_girlfriend_id || f.id),
        name: sanitizeName(String(f.name || 'Companion')),
        age: null,
        slug: null,
        tags: (f.personality_tags as string[]) || null,
        short_description: (f.description as string) || (f.subtitle as string) || null,
        portrait_url: image_url,
        avatar_url: image_url,
        image_url,
        personality: (f.subtitle as string) || null,
        access_status: 'open',
        is_demo: false,
        list_kind: 'featured',
        is_featured: true,
        sort_order: Number(f.sort_order ?? 0) || 0,
        hot_score: 1000 - (Number(f.sort_order ?? 0) || 0) + Number(f.click_count ?? 0),
      });
    }
    return out;
  } catch (e) {
    logger.warn('[public-companions] featured table failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/**
 * Catalog for home/explore: real girlfriends first, then featured, never force demo here.
 */
export async function loadCatalogCompanions(limit = 48): Promise<{
  rows: PublicCompanionRow[];
  source: 'api' | 'empty';
  featured_count: number;
  hot_count: number;
}> {
  /**
   * Homepage priority:
   * 1) Admin featured_girlfriends (推荐/运营精选) — preserve sort_order
   * 2) Admin-marked hot public girls (is_hot / hot_score) when columns exist
   * 3) Remaining approved public girlfriends
   * Never demote admin picks behind random public rows.
   */
  const featured = await loadFeaturedTable(Math.max(limit, 24));
  for (const r of featured) {
    r.list_kind = 'featured';
    r.is_featured = true;
    r.hot_score = r.hot_score ?? (1000 - Number(r.sort_order ?? 0));
  }

  let publicRows: PublicCompanionRow[] = [];
  try {
    publicRows = await loadPublicGirlfriends(Math.max(limit * 2, 48));
  } catch (e) {
    logger.warn('[public-companions] public load failed', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // Probe optional hot flags on public rows via raw re-query if needed
  // (loadPublicGirlfriends may not select is_hot / hot_score — enrich best-effort)
  const hotById = new Map<
    string,
    { is_hot?: boolean; is_featured?: boolean; hot_score?: number; sort_order?: number }
  >();
  try {
    const sb = getSupabaseClient();
    const { data: hotRows, error: hotErr } = await sb
      .from('girlfriends')
      .select('id, is_hot, hot_score, sort_order, is_featured')
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .or('is_hot.eq.true,is_featured.eq.true,hot_score.gt.0')
      .order('hot_score', { ascending: false })
      .limit(60);
    if (!hotErr && hotRows) {
      for (const h of hotRows as Record<string, unknown>[]) {
        hotById.set(String(h.id), {
          is_hot: h.is_hot === true,
          is_featured: h.is_featured === true,
          hot_score: Number(h.hot_score ?? 0) || 0,
          sort_order: Number(h.sort_order ?? 0) || 0,
        });
      }
    }
  } catch {
    /* optional columns may not exist — ignore */
  }

  for (const r of publicRows) {
    const meta = hotById.get(r.id);
    if (meta) {
      r.is_hot = Boolean(meta.is_hot) || (meta.hot_score ?? 0) > 0;
      r.is_featured = Boolean(r.is_featured) || Boolean(meta.is_featured);
      r.hot_score = meta.hot_score ?? r.hot_score ?? null;
      r.sort_order = meta.sort_order ?? r.sort_order ?? null;
      if (r.is_featured) r.list_kind = 'featured';
      else if (r.is_hot) r.list_kind = r.list_kind || 'hot';
    }
    if (!r.list_kind) r.list_kind = 'public';
  }

  const seen = new Set<string>();
  const merged: PublicCompanionRow[] = [];

  // A) featured first (admin 推荐)
  for (const r of featured) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
  }

  // B) hot public next
  const hotPublic = publicRows
    .filter((r) => r.is_hot || (Number(r.hot_score || 0) > 0))
    .sort((a, b) => Number(b.hot_score || 0) - Number(a.hot_score || 0));
  for (const r of hotPublic) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    r.list_kind = 'hot';
    merged.push(r);
  }

  // C) remaining public
  for (const r of publicRows) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
  }

  const rows = merged.slice(0, limit);
  if (rows.length === 0) {
    return { rows: [], source: 'empty', featured_count: 0, hot_count: 0 };
  }
  return {
    rows,
    source: 'api',
    featured_count: featured.length,
    hot_count: hotPublic.length,
  };
}
