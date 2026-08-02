import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/media/recent
 * Recent generated media across all chats (videos by default) for the profile showcase.
 * Query params:
 *   - type: media_type filter (default 'video')
 *   - limit: max rows (default 12, capped at 24)
 */
export async function GET(req: NextRequest) {
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get('type') || 'video').slice(0, 20);
  const limit = Math.min(24, Math.max(1, Number(searchParams.get('limit') || 12) || 12));

  try {
    const { data, error } = await client
      .from('chat_media')
      .select('id, girlfriend_id, media_type, url, thumbnail_url, created_at')
      .eq('user_id', user.id)
      .eq('media_type', type)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn('[media/recent] query failed', { err: error.message });
      return NextResponse.json({ media: [] });
    }

    return NextResponse.json({ media: data || [] });
  } catch (e) {
    logger.error('[media/recent] GET failed', { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ media: [] });
  }
}
