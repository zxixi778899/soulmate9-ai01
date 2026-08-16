import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { loadNsfwPreviews, NSFW_PREVIEW_DEFAULTS } from '@/lib/nsfw-previews-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/creator/nsfw-previews
 * Returns the configured content-level sample images for the create page.
 * Public — catalog artwork, no auth required. Falls back to built-in defaults.
 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const config = await loadNsfwPreviews(client as unknown as SiteSettingsClient);
    return NextResponse.json(
      {
        previews: {
          '1': config['1'],
          '2': config['2'],
          '3': config['3'],
          '4': config['4'],
          '5': config['5'],
        },
        updated_at: config.updated_at || null,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch {
    return NextResponse.json(
      { previews: { ...NSFW_PREVIEW_DEFAULTS }, updated_at: null },
      { headers: { 'Cache-Control': 'public, s-maxage=30' } },
    );
  }
}
