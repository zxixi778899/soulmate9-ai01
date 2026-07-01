import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * POST /api/chat/regenerate
 * 重新生成最后一条 AI 回复：
 *   1. 删除最后一条 role=assistant 的消息
 *   2. 让前端用相同的 user 消息再次调用 /api/chat/stream
 *
 * 真正"重新生成"是前端事件链：先调本接口删除 → 再调 stream 接口重出。
 * 这样可避免在后端复用 stream 逻辑造成的代码重复与会话漂移。
 *
 * Body: { girlfriend_id: string }
 * Returns: { ok: true, removed: { id, content } } 或 { error }
 *
 * 也支持 DELETE /api/chat/regenerate?message_id=xxx 单条撤回（仅本人 user 消息且 5 分钟内）。
 */

const RECALL_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  const body = (await req.json().catch(() => ({}))) as { girlfriend_id?: string };
  const girlfriendId = typeof body.girlfriend_id === 'string' ? body.girlfriend_id : '';
  if (!girlfriendId) {
    return NextResponse.json({ error: 'girlfriend_id required' }, { status: 400 });
  }

  // 鉴权：女友必须属于当前用户
  const { data: gf, error: gfErr } = await supabase
    .from('girlfriends')
    .select('id, user_id')
    .eq('id', girlfriendId)
    .maybeSingle();
  if (gfErr || !gf || gf.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 取最后一条 assistant 消息
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

  // 仅本人 user 消息且 5 分钟内可撤回
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
