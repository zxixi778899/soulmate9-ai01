import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/[id]/media
 * List media items for a specific chat conversation.
 * The chat ID maps to girlfriend_id (chat ID IS the girlfriend_id).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: rows, error } = await client
      .from('chat_media')
      .select('*')
      .eq('user_id', user.id)
      .eq('girlfriend_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      logger.warn('[chat/media] query failed', {
        err: error.message,
        girlfriendId: id,
      });
      return NextResponse.json({ media: [], total: 0 });
    }

    return NextResponse.json({
      media: rows || [],
      total: (rows || []).length,
    });
  } catch (e) {
    logger.error('[chat/media] GET failed', {
      err: e instanceof Error ? e.message : String(e),
      girlfriendId: id,
    });
    return NextResponse.json({ media: [], total: 0 });
  }
}

/**
 * POST /api/chat/[id]/media
 * Save a new media item (image/video) to the chat.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  const { user, client } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.girlfriend_id || !body?.media_type || !body?.url) {
    return NextResponse.json(
      { error: 'girlfriend_id, media_type, and url are required' },
      { status: 400 },
    );
  }

  const { girlfriend_id, message_id, media_type, url, thumbnail_url, metadata } = body as {
    girlfriend_id: string;
    message_id?: string;
    media_type: 'image' | 'video';
    url: string;
    thumbnail_url?: string;
    metadata?: object;
  };

  // Validate media_type
  if (media_type !== 'image' && media_type !== 'video') {
    return NextResponse.json(
      { error: 'media_type must be "image" or "video"' },
      { status: 400 },
    );
  }

  try {
    const { data: inserted, error } = await client
      .from('chat_media')
      .insert({
        user_id: user.id,
        girlfriend_id,
        message_id: message_id || null,
        media_type,
        url,
        thumbnail_url: thumbnail_url || null,
        metadata: metadata || null,
      })
      .select('id')
      .single();

    if (error) {
      logger.error('[chat/media] insert failed', {
        err: error.message,
        girlfriendId: girlfriend_id,
      });
      return NextResponse.json(
        { error: 'Failed to save media item' },
        { status: 500 },
      );
    }

    logger.info('[chat/media] saved', {
      userId: user.id,
      girlfriendId: girlfriend_id,
      mediaType: media_type,
    });

    return NextResponse.json({
      success: true,
      id: inserted?.id,
    });
  } catch (e) {
    logger.error('[chat/media] POST failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
