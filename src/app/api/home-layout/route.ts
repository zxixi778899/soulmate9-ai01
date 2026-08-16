import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { loadHomeLayout } from '@/lib/home-layout-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/home-layout — public homepage layout config.
 * Consumed by the homepage client to render sections in admin-defined order.
 */
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const layout = await loadHomeLayout(supabase as unknown as SiteSettingsClient);
    return NextResponse.json(
      { layout },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch {
    return NextResponse.json({ layout: { sections: [] } });
  }
}
