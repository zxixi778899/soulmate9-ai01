/**
 * GET /api/chat/unread-count
 * Returns per-companion unread proactive message counts.
 *
 * "Unread" = proactive messages with is_read = false. Messages are marked
 * read when the user opens the conversation (POST /api/chat/mark-read) or
 * replies to the companion (handled server-side in the chat stream route).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Count unread proactive messages per companion (is_read = false).
    const { data: unreadMsgs, error: unreadErr } = await client
      .from('chat_messages')
      .select('girlfriend_id')
      .eq('user_id', user.id)
      .eq('is_proactive', true)
      .eq('is_read', false);

    if (unreadErr) throw unreadErr;
    if (!unreadMsgs?.length) {
      return NextResponse.json({ counts: {}, total: 0 });
    }

    const counts: Record<string, number> = {};
    let total = 0;
    for (const msg of unreadMsgs) {
      counts[msg.girlfriend_id] = (counts[msg.girlfriend_id] || 0) + 1;
      total++;
    }

    return NextResponse.json({ counts, total });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, counts: {}, total: 0 }, { status: 500 });
  }
}
