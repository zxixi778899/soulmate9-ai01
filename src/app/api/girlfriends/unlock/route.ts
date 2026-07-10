import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/girlfriends/unlock
 * Unlock a locked catalog girlfriend with tokens (or free if price=0).
 * Body: { girlfriend_id: string }
 */
export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const girlfriendId = body.girlfriend_id as string;
    if (!girlfriendId) {
      return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
    }

    // Already unlocked?
    const { data: existing } = await client
      .from('user_girlfriend_unlocks')
      .select('id')
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriendId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ unlocked: true, already: true });
    }

    // Load girlfriend
    const { data: gf, error: gfErr } = await client
      .from('girlfriends')
      .select('id, name, access_status, unlock_price_tokens, is_public, review_status')
      .eq('id', girlfriendId)
      .single();

    if (gfErr || !gf) {
      return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
    }

    if (gf.access_status === 'closed') {
      return NextResponse.json({ error: 'This companion is closed' }, { status: 403 });
    }

    // open = free access; locked needs unlock; private owners already have
    if (gf.access_status === 'open') {
      return NextResponse.json({ unlocked: true, already: true, free: true });
    }

    const price = Math.max(0, Number(gf.unlock_price_tokens) || 0);

    if (price > 0) {
      // Deduct tokens if user_tokens table exists
      const { data: tokens } = await client
        .from('user_tokens')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      const balance = Number(tokens?.balance ?? 0);
      if (balance < price) {
        return NextResponse.json(
          { error: 'Insufficient tokens', required: price, balance },
          { status: 402 },
        );
      }

      const { error: debitErr } = await client
        .from('user_tokens')
        .update({ balance: balance - price, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (debitErr) {
        logger.error('unlock: debit failed', { debitErr });
        return NextResponse.json({ error: 'Failed to debit tokens' }, { status: 500 });
      }

      try {
        await client.from('token_transactions').insert({
          user_id: user.id,
          amount: -price,
          type: 'unlock_girlfriend',
          description: `Unlock ${gf.name}`,
          meta: { girlfriend_id: girlfriendId },
        });
      } catch {
        /* optional table */
      }
    }

    const { error: unlockErr } = await client.from('user_girlfriend_unlocks').insert({
      user_id: user.id,
      girlfriend_id: girlfriendId,
      unlock_method: price > 0 ? 'purchase' : 'free',
      tokens_spent: price,
    });

    if (unlockErr) {
      // Unique race — treat as already unlocked
      if (String(unlockErr.code) === '23505') {
        return NextResponse.json({ unlocked: true, already: true });
      }
      logger.error('unlock: insert failed', { unlockErr });
      return NextResponse.json({ error: unlockErr.message }, { status: 500 });
    }

    return NextResponse.json({
      unlocked: true,
      already: false,
      tokens_spent: price,
      girlfriend_id: girlfriendId,
    });
  } catch (e) {
    logger.error('unlock error', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unlock failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/girlfriends/unlock?ids=a,b,c
 * Returns which of the given girlfriend ids the user has unlocked.
 */
export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ unlocks: [] });
  }

  const ids = (request.nextUrl.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let query = client
    .from('user_girlfriend_unlocks')
    .select('girlfriend_id, unlock_method, tokens_spent, created_at')
    .eq('user_id', user.id);

  if (ids.length) {
    query = query.in('girlfriend_id', ids);
  }

  const { data } = await query.limit(500);
  return NextResponse.json({ unlocks: data || [] });
}
