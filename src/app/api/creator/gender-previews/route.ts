import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { loadGenderPreviews, GENDER_PREVIEW_DEFAULTS } from '@/lib/gender-previews-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/creator/gender-previews
 * Returns the configured gender sample images for the create page.
 * Public — catalog artwork, no auth required. Empty strings mean "no image".
 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const config = await loadGenderPreviews(client as unknown as SiteSettingsClient);
    return NextResponse.json(
      {
        previews: {
          female: config.female,
          male: config.male,
          transgender: config.transgender,
        },
        updated_at: config.updated_at || null,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch {
    return NextResponse.json(
      { previews: { ...GENDER_PREVIEW_DEFAULTS }, updated_at: null },
      { headers: { 'Cache-Control': 'public, s-maxage=30' } },
    );
  }
}
