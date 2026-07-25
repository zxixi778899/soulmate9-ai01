import { NextRequest, NextResponse } from 'next/server';
import { loadPublicGirlfriends } from '@/lib/public-companions';
import { mapToDemoGirl } from '@/lib/companions';
import { COMPANION_CATEGORIES, type CompanionCategory } from '@/lib/companion-category';
import { logger } from '@/lib/logger';

/**
 * GET /api/girlfriends/category?category=male|female|transgender|anime
 *
 * Independent category catalog. Pulls approved public companions from the DB
 * and narrows to a single browsing category so each 独立展示页 shows only real
 * backend rows for that category (instead of client-side filtering a small
 * home catalog that may contain none of them).
 */
export async function GET(req: NextRequest) {
  try {
    const raw = String(req.nextUrl.searchParams.get('category') || '').toLowerCase();
    const category = (COMPANION_CATEGORIES as readonly string[]).includes(raw)
      ? (raw as CompanionCategory)
      : null;

    if (!category) {
      return NextResponse.json(
        { error: 'Invalid category', categories: COMPANION_CATEGORIES },
        { status: 400 },
      );
    }

    // Fetch a generous slice (newest first) then narrow by category. Newly
    // seeded male / transgender / anime rows surface at the top by created_at.
    const rows = await loadPublicGirlfriends(150);
    const girls = rows
      .map((r, i) => mapToDemoGirl(r as unknown as Record<string, unknown>, i))
      .filter((g) => g.category === category && !!g.portrait);

    return NextResponse.json(
      {
        category,
        girlfriends: girls,
        total: girls.length,
        source: 'api',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch (err: unknown) {
    logger.error('[girlfriends/category] error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load category' },
      { status: 500 },
    );
  }
}
