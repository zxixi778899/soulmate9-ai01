/**
 * 虚拟商城 v2 — 积分流水 + 余额
 * GET /api/shop/v2/credits
 *
 * 改用 pg 库直连。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { queryPgOne, queryPgMany } from '@/storage/database/supabase-client';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profile = await queryPgOne<{ credits_remaining: number }>(
    'SELECT credits_remaining FROM profiles WHERE user_id = $1',
    [user.id]
  );

  const ledger = await queryPgMany(
    `SELECT id, delta, reason, ref_id, balance_after, created_at, metadata
     FROM user_credits_ledger
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [user.id]
  );

  return NextResponse.json({
    balance: profile?.credits_remaining ?? 0,
    ledger: ledger || [],
  });
}
