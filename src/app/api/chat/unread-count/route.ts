/**
 * GET /api/chat/unread-count
 * Returns per-companion unread proactive message counts.
 * "Unread" = proactive messages sent after the user's last reply to that companion.
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
    // 1. Get all proactive messages for this user
    const { data: proactiveMsgs, error: proactiveErr } = await client
      .from('chat_messages')
      .select('girlfriend_id, created_at')
      .eq('user_id', user.id)
      .eq('is_proactive', true)
      .order('created_at', { ascending: false });

    if (proactiveErr) throw proactiveErr;
    if (!proactiveMsgs?.length) {
      return NextResponse.json({ counts: {}, total: 0 });
    }

    // 2. Get user's last reply time per companion
    const { data: userMsgs } = await client
      .from('chat_messages')
      .select('girlfriend_id, created_at')
      .eq('user_id', user.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false });

    const lastUserReply: Record<string, string> = {};
    for (const m of userMsgs || []) {
      if (!lastUserReply[m.girlfriend_id]) {
        lastUserReply[m.girlfriend_id] = m.created_at;
      }
    }

    // 3. Count unread proactive messages per companion
    const counts: Record<string, number> = {};
    let total = 0;

    for (const msg of proactiveMsgs) {
      const lastReply = lastUserReply[msg.girlfriend_id];
      // Unread if user never replied to this companion, or proactive was sent after last reply
      if (!lastReply || msg.created_at > lastReply) {
        counts[msg.girlfriend_id] = (counts[msg.girlfriend_id] || 0) + 1;
        total++;
      }
    }

    return NextResponse.json({ counts, total });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, counts: {}, total: 0 }, { status: 500 });
  }
}
