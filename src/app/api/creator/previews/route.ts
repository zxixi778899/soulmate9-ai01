import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { loadCreatorPreviews } from '@/lib/creator-previews-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/creator/previews
 * Returns the active creator preview catalog (3 genders x 3 visual styles).
 * Public — preview images are catalog data, no auth required.
 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const config = await loadCreatorPreviews(client as unknown as SiteSettingsClient);

    const previews = config.previews
      .filter((p) => p.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);

    return NextResponse.json(
      { previews },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch (err) {
    logger.error('[creator/previews] unexpected error', { err: String(err) });
    return NextResponse.json({ previews: [] }, { status: 500 });
  }
}
