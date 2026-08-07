import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { checkCompanionAccess } from '@/lib/companion-access';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/generate-image/persist
 * Body: { girlfriend_id, image_url, caption? }
 * 候选模式选图后调用：把选中的图片写入聊天与资料库。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser(request);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, client } = auth;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const girlfriend_id = String(body.girlfriend_id || '').trim();
    const image_url = String(body.image_url || '').trim();
    if (!girlfriend_id || !image_url) {
      return NextResponse.json(
        { error: 'girlfriend_id and image_url are required' },
        { status: 400 },
      );
    }

    const access = await checkCompanionAccess(client, user.id, girlfriend_id);
    if (!access.allowed) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }

    const caption = String(body.caption || '').slice(0, 300) || 'New photo for you 📸';
    const { data: message, error: msgErr } = await client
      .from('chat_messages')
      .insert({
        user_id: user.id,
        girlfriend_id,
        role: 'assistant',
        content: caption,
        media_url: image_url,
        media_type: 'image',
      })
      .select('id')
      .maybeSingle();
    if (msgErr) throw msgErr;

    const { error: mediaErr } = await client.from('chat_media').insert({
      user_id: user.id,
      girlfriend_id,
      message_id: message?.id || null,
      media_type: 'image',
      url: image_url,
      metadata: { source: 'chat_candidate', selected: true },
    });
    if (mediaErr) throw mediaErr;

    return NextResponse.json({ success: true, message: caption });
  } catch (e) {
    logger.error('[persist] error', { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Failed to save photo' }, { status: 500 });
  }
}
