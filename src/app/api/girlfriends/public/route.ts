import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { loadPublicGirlfriends } from '@/lib/public-companions';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/girlfriends/public
 * Public approved catalog (no auth). Uses core columns only so missing
 * access_status / rarity migrations never blank the home page.
 * Filters: ?tag=<personality tag> and ?vibe=<preset vibe key> (M4, backed by
 * girlfriend_categories rows written when companions are created from presets).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get('tag');
    const vibe = searchParams.get('vibe');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

    let girlfriends = await loadPublicGirlfriends(limit);

    if (tag) {
      const t = tag.toLowerCase();
      girlfriends = girlfriends.filter((g) =>
        (g.tags || []).some((x) => String(x).toLowerCase() === t),
      );
    }

    if (vibe) {
      const v = vibe.toLowerCase().trim();
      try {
        const sb = getSupabaseClient();
        const { data: catRows, error: catErr } = await sb
          .from('girlfriend_categories')
          .select('girlfriend_id')
          .eq('category_type', 'vibe')
          .eq('category_value', v);
        if (!catErr && catRows) {
          const ids = new Set((catRows as Array<{ girlfriend_id: string }>).map((r) => String(r.girlfriend_id)));
          girlfriends = girlfriends.filter(
            (g) => ids.has(g.id) || (g.tags || []).some((x) => String(x).toLowerCase() === v),
          );
        }
      } catch (e) {
        logger.warn('girlfriends/public vibe filter failed', {
          data: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      girlfriends,
      total: girlfriends.length,
      source: 'api',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('girlfriends/public error:', { data: msg });
    return NextResponse.json(
      {
        error: msg,
        girlfriends: [],
        total: 0,
        hint: 'Check COZE_SUPABASE_URL + service role key; ensure is_public + review_status columns exist',
      },
      { status: 500 },
    );
  }
}
