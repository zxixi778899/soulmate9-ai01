import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { resolveImageUrl, toPublicUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 };

const VIDEO_FIELDS = new Set(['portrait_video_url', 'avatar_video_url']);

/**
 * POST /api/admin/videos/complete
 * After client PUT to signed URL:
 * { key | url, girlfriendId?, field? }
 * Optionally binds video to girlfriend and returns public URL.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-video-complete:${guard.user!.id}`, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, LIMIT) },
    );
  }

  try {
    const body = await req.json();
    const key = String(body.key || '').trim();
    let url = String(body.url || body.publicUrl || '').trim();

    if (!url && key) {
      url = toPublicUrl(key) || (await resolveImageUrl(key)) || '';
    }
    if (url && !url.startsWith('http')) {
      url = toPublicUrl(url) || (await resolveImageUrl(url)) || url;
    }
    if (!url.startsWith('http')) {
      return NextResponse.json(
        { error: 'Missing valid key or public url after upload' },
        { status: 400 },
      );
    }

    const girlfriendId = (body.girlfriendId || body.id || '') as string;
    const field = VIDEO_FIELDS.has(String(body.field))
      ? (body.field as string)
      : 'portrait_video_url';

    if (girlfriendId) {
      const { error } = await guard.supabase
        .from('girlfriends')
        .update({ [field]: url })
        .eq('id', girlfriendId);
      if (error) {
        logger.error('[admin/videos/complete] db', { error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      url,
      key: key || null,
      field,
      girlfriendId: girlfriendId || null,
      bound: !!girlfriendId,
    });
  } catch (e) {
    logger.error('[admin/videos/complete]', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Complete failed' },
      { status: 500 },
    );
  }
}
