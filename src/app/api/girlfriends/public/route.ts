import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { loadPublicGirlfriends } from '@/lib/public-companions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/girlfriends/public
 * Public approved catalog (no auth). Uses core columns only so missing
 * access_status / rarity migrations never blank the home page.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tag = searchParams.get('tag');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

    let girlfriends = await loadPublicGirlfriends(limit);

    if (tag) {
      const t = tag.toLowerCase();
      girlfriends = girlfriends.filter((g) =>
        (g.tags || []).some((x) => String(x).toLowerCase() === t),
      );
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
