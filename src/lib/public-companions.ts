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
  'id, name, age, slug, tags, short_description, portrait_url, avatar_url, personality, created_at, is_public, review_status';

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

async function resolvePortrait(
  portrait: string | null | undefined,
  avatar: string | null | undefined,
): Promise<string> {
  for (const raw of [portrait, avatar]) {
    if (!raw) continue;
    if (looksLikePromptText(raw)) continue;
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/')) {
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
}> {
  // 1) Real public girlfriends
  try {
    const girls = await loadPublicGirlfriends(limit);
    if (girls.length > 0) {
      return { rows: girls, source: 'api' };
    }
  } catch (e) {
    logger.warn('[public-companions] primary load failed', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // 2) Featured table (usable images only)
  const featured = await loadFeaturedTable(limit);
  if (featured.length > 0) {
    return { rows: featured, source: 'api' };
  }

  return { rows: [], source: 'empty' };
}
