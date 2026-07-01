/**
 * 虚拟商城 v2 — 积分流水 + 余额
 * GET /api/shop/v2/credits
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1) 当前余额
  const { data: profile, error: profErr } = await client
    .from('profiles')
    .select('credits_remaining')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  // 2) 最近流水
  const { data: ledger, error: ledErr } = await client
    .from('user_credits_ledger')
    .select('id, delta, reason, ref_id, balance_after, created_at, metadata')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (ledErr) {
    return NextResponse.json({ error: ledErr.message }, { status: 500 });
  }

  return NextResponse.json({
    balance: profile?.credits_remaining ?? 0,
    ledger: ledger || [],
  });
}
