import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { loadPresetPreviews } from '@/lib/preset-previews-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/creator/preset-previews
 * Returns the admin-configured preset card sample images (ethnicity /
 * hair_style / body_type / fashion_style) for the create page.
 * Public — catalog artwork, no auth required. Empty config = placeholders.
 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const config = await loadPresetPreviews(client as unknown as SiteSettingsClient);
    return NextResponse.json(
      { previews: config, updated_at: config.updated_at || null },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch {
    return NextResponse.json(
      { previews: {}, updated_at: null },
      { headers: { 'Cache-Control': 'public, s-maxage=30' } },
    );
  }
}
