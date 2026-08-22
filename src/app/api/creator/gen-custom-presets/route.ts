/**
 * GET /api/creator/gen-custom-presets — public read of admin-managed
 * pose/outfit/scene preset cards for the /generate console.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { loadGenCustomPresets } from '@/lib/gen-custom-presets-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  try {
    const presets = await loadGenCustomPresets(client as unknown as SiteSettingsClient);
    return NextResponse.json({ presets });
  } catch {
    return NextResponse.json({ presets: {} });
  }
}
