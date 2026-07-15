import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { parsePagination } from '@/lib/pagination';
import { resolveImageUrl } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // M12  limit  30 100 limit=100000  DB
  const { page, limit, offset } = parsePagination(request, { defaultLimit: 30, maxLimit: 100 });

  const { data: messages, error } = await client
    .from('chat_messages')
    .select('*')
    .eq('girlfriend_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get total count for pagination
  const { count } = await client
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('girlfriend_id', id)
    .eq('user_id', user.id);

  const resolvedMessages = await Promise.all(
    (messages || []).reverse().map(async (message) => ({
      ...message,
      media_url: message.media_url ? await resolveImageUrl(message.media_url) : message.media_url,
    })),
  );

  return NextResponse.json({
    messages: resolvedMessages,
    hasMore: count ? offset + limit < count : false,
    total: count || 0,
    page,
    limit,
  });
}
