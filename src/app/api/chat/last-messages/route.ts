import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get last message for each girlfriend using RPC
  const { data: messages, error } = await client
    .rpc('get_last_messages_per_girlfriend', {
      p_user_id: user.id
    });

  if (error) {
    // Fallback: get using raw query
    const { data: fallback } = await client
      .from('chat_messages')
      .select('girlfriend_id, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fallback) {
      // Deduplicate: keep only latest per girlfriend
      const seen = new Set<string>();
      const deduped = fallback.filter((m: { girlfriend_id: string }) => {
        if (seen.has(m.girlfriend_id)) return false;
        seen.add(m.girlfriend_id);
        return true;
      });
      return NextResponse.json({ messages: deduped });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: messages || [] });
}
