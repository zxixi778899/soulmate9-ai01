import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { loadStylePreviews, STYLE_PREVIEW_DEFAULTS } from '@/lib/style-previews-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/creator/style-previews
 * Returns the configured visual-style sample images for the create page.
 * Public — catalog artwork, no auth required. Falls back to built-in defaults.
 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const config = await loadStylePreviews(client);
    return NextResponse.json(
      {
        previews: {
          realistic: config.realistic,
          anime: config.anime,
          '3d': config['3d'],
        },
        updated_at: config.updated_at || null,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch {
    return NextResponse.json(
      { previews: { ...STYLE_PREVIEW_DEFAULTS }, updated_at: null },
      { headers: { 'Cache-Control': 'public, s-maxage=30' } },
    );
  }
}
