import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/credits/history?page=1&limit=20
 *
 * Returns paginated credit transaction history for the authenticated user.
 * Each entry: { delta, reason, ref_id, balance_after, created_at }
 * Also returns today's summary: earned / spent / net.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, client } = auth;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    // Fetch paginated ledger
    const { data: ledger, error, count } = await client
      .from('user_credits_ledger')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.warn('[credits/history] ledger query failed', { err: error.message });
      return NextResponse.json({ transactions: [], total: 0, today: { earned: 0, spent: 0, net: 0 } });
    }

    // Today's summary
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: todayEntries } = await client
      .from('user_credits_ledger')
      .select('delta')
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString());

    let earnedToday = 0;
    let spentToday = 0;
    if (todayEntries) {
      for (const e of todayEntries) {
        if (e.delta > 0) earnedToday += e.delta;
        else spentToday += Math.abs(e.delta);
      }
    }

    // Current balance
    const { data: profile } = await client
      .from('profiles')
      .select('credits_remaining')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      transactions: (ledger || []).map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        ref_id: row.ref_id,
        balance_after: row.balance_after,
        created_at: row.created_at,
      })),
      total: count || 0,
      page,
      limit,
      balance: profile?.credits_remaining ?? 0,
      today: {
        earned: earnedToday,
        spent: spentToday,
        net: earnedToday - spentToday,
      },
    });
  } catch (err) {
    logger.error('[credits/history] error', { err: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
