/**
 * POST /api/chat/mark-read
 * Body: { girlfriend_id: string }
 *
 * Marks all unread proactive messages from a companion as read.
 * Called when the user opens a conversation (viewing = read).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const girlfriendId = (body as { girlfriend_id?: string }).girlfriend_id;
    if (!girlfriendId || typeof girlfriendId !== 'string') {
      return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
    }

    const { error } = await client
      .from('chat_messages')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriendId)
      .eq('is_proactive', true)
      .eq('is_read', false);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
