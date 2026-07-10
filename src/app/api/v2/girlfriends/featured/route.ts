import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { queryPg } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { GIRLS } from '@/lib/demo-data';
import { logger } from '@/lib/logger';

/**
 * GET /api/v2/girlfriends/featured
 * Public-friendly featured catalog for home + explore.
 * Does not require auth. Falls back: featured table → public girlfriends → demo.
 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 24, 60);
    let rows: Record<string, unknown>[] = [];

    // 1) featured_girlfriends table (commerce seed)
    try {
      const auth = await getAuthUser(req).catch(() => null);
      const supabase = auth?.client;
      if (supabase) {
        const { data } = await supabase
          .from('featured_girlfriends')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .limit(limit);
        if (data?.length) rows = data as Record<string, unknown>[];
      }
    } catch (err) {
      logger.warn('[featured] featured_girlfriends query failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2) Public approved girlfriends via SQL (works without user session)
    if (rows.length === 0) {
      try {
        const { rows: pub } = await queryPg<{
          id: string;
          name: string;
          age: number | null;
          slug: string | null;
          tags: string[] | null;
          short_description: string | null;
          portrait_url: string | null;
          avatar_url: string | null;
          personality: string | null;
          rarity: string | null;
          access_status: string | null;
          unlock_price_tokens: number | null;
          base_intimacy: number | null;
          base_desire: number | null;
          base_development: number | null;
          base_kink: number | null;
        }>(
          `SELECT id, name, age, slug, tags, short_description, portrait_url, avatar_url, personality,
                  rarity, access_status, unlock_price_tokens,
                  base_intimacy, base_desire, base_development, base_kink
             FROM girlfriends
            WHERE is_public = true
              AND review_status = 'approved'
              AND COALESCE(access_status, 'open') <> 'closed'
            ORDER BY created_at DESC
            LIMIT $1`,
          [limit],
        );
        if (pub?.length) {
          rows = await Promise.all(
            pub.map(async (g) => {
              const raw = g.portrait_url || g.avatar_url || null;
              const image_url = await resolveImageUrl(raw);
              return { ...g, image_url, portrait_url: image_url || g.portrait_url };
            }),
          );
        }
      } catch (err) {
        logger.warn('[featured] public girlfriends query failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3) Demo seed — never return empty for marketing surfaces
    if (rows.length === 0) {
      rows = GIRLS.slice(0, limit).map((g) => ({
        id: g.id,
        name: g.name,
        age: g.age,
        tags: g.tags,
        short_description: g.tagline,
        portrait_url: g.portrait,
        avatar_url: g.avatar,
        image_url: g.portrait,
        personality: g.personality,
        rarity: g.rarity,
        element: g.element,
        intimacy: g.intimacy,
        rarity_quote: g.rarity_quote,
        is_demo: true,
      }));
    }

    return NextResponse.json({
      featured_girlfriends: rows,
      girlfriends: rows,
      total: rows.length,
      source: rows[0] && (rows[0] as { is_demo?: boolean }).is_demo ? 'demo' : 'api',
    });
  } catch (err: unknown) {
    logger.error('[girlfriends/featured] error', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Hard fallback so UI never 500s empty
    const demo = GIRLS.slice(0, 12).map((g) => ({
      ...g,
      image_url: g.portrait,
      portrait_url: g.portrait,
      avatar_url: g.avatar,
      short_description: g.tagline,
      is_demo: true,
    }));
    return NextResponse.json({
      featured_girlfriends: demo,
      girlfriends: demo,
      total: demo.length,
      source: 'demo',
    });
  }
}
