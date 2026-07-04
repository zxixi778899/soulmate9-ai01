/**
 * 用户数据删除 API — GDPR / CCPA 合规
 *
 * POST /api/account/delete
 *   - 用户请求删除自己的数据
 *   - scope: 'all' (全部) 或 'nsfw_only' (只删 NSFW 内容)
 *   - 异步执行（避免大用户阻塞），返回 deletion_request_id
 *
 * GET /api/account/delete
 *   - 查询当前用户的删除请求历史
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { loggerFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const log = loggerFromRequest(req);
  const auth = await getAuthUser(req);
  if (!auth?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = auth.user.id;

  let body: { scope?: 'all' | 'nsfw_only' } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const scope = body.scope === 'nsfw_only' ? 'nsfw_only' : 'all';

  const supabase = getSupabaseClient();

  // 写入删除请求记录
  const { data: reqRow, error: insertErr } = await supabase
    .from('user_deletion_requests')
    .insert({
      user_id: userId,
      scope,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !reqRow) {
    log.error('account/delete insert failed', { userId, err: insertErr?.message });
    return NextResponse.json({ error: 'create_request_failed' }, { status: 500 });
  }

  // 立即返回，异步执行删除
  // 生产应接 cron 或 queue；MVP 阶段返回后由用户手动刷新查看状态
  log.info('account/delete: request created', {
    userId,
    deletionId: reqRow.id,
    scope,
  });

  return NextResponse.json({
    ok: true,
    deletion_id: reqRow.id,
    scope,
    status: 'pending',
    message: 'Your deletion request has been queued. It will be processed within 30 days per our Privacy Policy.',
  });
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('user_deletion_requests')
    .select('id, scope, status, requested_at, completed_at')
    .eq('user_id', auth.user.id)
    .order('requested_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ requests: data || [] });
}