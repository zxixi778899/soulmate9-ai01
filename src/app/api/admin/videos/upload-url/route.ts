import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import {
  createVideoSignedUpload,
  isAllowedVideoContentType,
  VIDEO_CONTENT_TYPES,
} from '@/lib/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LIMIT = { maxRequests: 40, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/admin/videos/upload-url
 * Body: { fileName, contentType, folder?, girlfriendId?, field? }
 * Returns signed PUT URL for direct browser → Supabase upload.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const rl = await checkRateLimitAsync(`admin-video-sign:${guard.user!.id}`, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many video upload requests' },
      { status: 429, headers: rateLimitHeaders(rl, LIMIT) },
    );
  }

  try {
    const body = await req.json();
    const fileName = String(body.fileName || body.name || 'clip.mp4');
    const contentType = String(body.contentType || body.type || 'video/mp4');
    const folder = String(body.folder || 'admin/videos').replace(/[^a-zA-Z0-9/_-]/g, '');

    if (!isAllowedVideoContentType(contentType)) {
      return NextResponse.json(
        {
          error: `Unsupported type ${contentType}`,
          allowed: VIDEO_CONTENT_TYPES,
        },
        { status: 400 },
      );
    }

    const signed = await createVideoSignedUpload({
      fileName,
      contentType,
      folder: folder || 'admin/videos',
    });

    return NextResponse.json({
      success: true,
      ...signed,
      // client: PUT signedUrl with body=File and Content-Type
      method: 'PUT',
      maxBytes: 50 * 1024 * 1024,
      girlfriendId: body.girlfriendId || body.id || null,
      field:
        body.field === 'avatar_video_url' ? 'avatar_video_url' : 'portrait_video_url',
    });
  } catch (e) {
    logger.error('[admin/videos/upload-url]', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create upload URL' },
      { status: 500 },
    );
  }
}
