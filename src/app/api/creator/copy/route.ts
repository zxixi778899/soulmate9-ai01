import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { loadSiteCopy } from '@/lib/copy-store';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/creator/copy
 * Returns admin text overrides for the public site.
 * Public — copy is display data, no auth required. Empty object means
 * "use built-in i18n translations".
 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const copy = await loadSiteCopy(client as unknown as SiteSettingsClient);
    return NextResponse.json(
      { copy },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch (err) {
    logger.error('[creator/copy] unexpected error', { err: String(err) });
    return NextResponse.json({ copy: {} }, { status: 500 });
  }
}
