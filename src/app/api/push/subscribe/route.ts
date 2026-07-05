/**
 * Push 订阅管理 API
 *
 * POST   /api/push/subscribe    订阅
 * DELETE /api/push/subscribe    退订（通过 endpoint）
 * GET    /api/push/subscribe    列出当前用户所有订阅
 *
 * 鉴权：必须登录
 */

import { NextRequest, NextResponse } from 'next/server';
import { loggerFromRequest } from '@/lib/logger';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { authedFetch } from '@/lib/supabase';

async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    const res = await authedFetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const log = loggerFromRequest(req);
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: req.headers.get('user-agent') || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' });

    if (error) {
      log.error('push-subscribe: upsert failed', { error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error('push-subscribe: parse error', { err: String(e) });
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const log = loggerFromRequest(req);
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);

  if (error) {
    log.error('push-unsubscribe: delete failed', { error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, user_agent, updated_at')
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscriptions: data || [] });
}
