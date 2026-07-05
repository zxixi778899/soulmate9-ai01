import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/chat/regenerate
 *  AI 
 *   1.  role=assistant 
 *   2.  user  /api/chat/stream
 *
 * ""   stream 
 *  stream 
 *
 * Body: { girlfriend_id: string }
 * Returns: { ok: true, removed: { id, content } }  { error }
 *
 *  DELETE /api/chat/regenerate?message_id=xxx  user  5 
 */

const RECALL_WINDOW_MS = 5 * 60 * 1000;
const REGEN_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 }; // 30/h/user  LLM 

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  // 
  const rl = await checkRateLimitAsync(`chat-regen:${user.id}`, REGEN_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many regenerate requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, REGEN_LIMIT) },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { girlfriend_id?: string };
  const girlfriendId = typeof body.girlfriend_id === 'string' ? body.girlfriend_id : '';
  if (!girlfriendId) {
    return NextResponse.json({ error: 'girlfriend_id required' }, { status: 400 });
  }

  // 
  const { data: gf, error: gfErr } = await supabase
    .from('girlfriends')
    .select('id, user_id')
    .eq('id', girlfriendId)
    .maybeSingle();
  if (gfErr || !gf || gf.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  //  assistant 
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('id, role, content')
    .eq('girlfriend_id', girlfriendId)
    .order('created_at', { ascending: false })
    .limit(1);
  const last = msgs?.[0];
  if (!last || last.role !== 'assistant') {
    return NextResponse.json({ error: 'No assistant message to regenerate' }, { status: 404 });
  }

  const { error: delErr } = await supabase.from('chat_messages').delete().eq('id', last.id);
  if (delErr) {
    logger.error('regenerate delete failed', { err: delErr.message });
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, removed: { id: last.id, content: last.content } });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  const messageId = req.nextUrl.searchParams.get('message_id') ?? '';
  if (!messageId) return NextResponse.json({ error: 'message_id required' }, { status: 400 });

  const { data: msg } = await supabase
    .from('chat_messages')
    .select('id, role, user_id, created_at, girlfriend_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  //  user  5 
  if (msg.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (msg.role !== 'user') {
    return NextResponse.json({ error: 'Only user messages can be recalled' }, { status: 400 });
  }
  if (Date.now() - new Date(msg.created_at).getTime() > RECALL_WINDOW_MS) {
    return NextResponse.json({ error: 'Recall window expired' }, { status: 409 });
  }

  await supabase.from('chat_messages').delete().eq('id', messageId);
  return NextResponse.json({ ok: true });
}
