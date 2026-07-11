import { NextRequest, NextResponse } from 'next/server';
import { GIRLS } from '@/lib/demo-data';
import { logger } from '@/lib/logger';
import { loadCatalogCompanions } from '@/lib/public-companions';

/**
 * GET /api/v2/girlfriends/featured
 * Public catalog for home + explore.
 * Prefer real approved girlfriends; demo only if DB is empty.
 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 24, 60);
    const { rows, source } = await loadCatalogCompanions(limit);

    if (rows.length > 0) {
      return NextResponse.json({
        featured_girlfriends: rows,
        girlfriends: rows,
        total: rows.length,
        source: 'api',
      });
    }

    // Last resort: demo seed so marketing surfaces never go blank
    logger.warn('[featured] no public girlfriends — demo fallback');
    const demo = GIRLS.slice(0, limit).map((g) => ({
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
      access_status: 'open',
    }));

    return NextResponse.json({
      featured_girlfriends: demo,
      girlfriends: demo,
      total: demo.length,
      source: 'demo',
    });
  } catch (err: unknown) {
    logger.error('[girlfriends/featured] error', {
      error: err instanceof Error ? err.message : String(err),
    });
    const demo = GIRLS.slice(0, 12).map((g) => ({
      ...g,
      image_url: g.portrait,
      portrait_url: g.portrait,
      avatar_url: g.avatar,
      short_description: g.tagline,
      is_demo: true,
      access_status: 'open',
    }));
    return NextResponse.json({
      featured_girlfriends: demo,
      girlfriends: demo,
      total: demo.length,
      source: 'demo',
    });
  }
}
