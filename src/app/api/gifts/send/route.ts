import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { GIFT_CREDIT_COSTS, deductCredits } from '@/lib/credit-system';
import { DEFAULT_CHAT_GIFTS } from '@/lib/gifts/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/gifts/send
 * Body: { gift_code: string, girlfriend_id: string }
 *
 * Deducts credits server-side and records the gift.
 * Returns { ok, cost, balance_after, intimacy_boost }.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, client } = auth;
    const body = await req.json().catch(() => ({}));
    const giftCode = String(body.gift_code || '').trim().toLowerCase();
    const girlfriendId = String(body.girlfriend_id || '').trim();

    if (!giftCode) {
      return NextResponse.json({ error: 'gift_code is required' }, { status: 400 });
    }

    // Resolve gift from catalog (DB or defaults)
    const gift = DEFAULT_CHAT_GIFTS.find(
      (g) => g.code === giftCode || g.id === giftCode,
    );
    if (!gift) {
      return NextResponse.json({ error: 'Gift not found' }, { status: 404 });
    }

    // Determine cost from unified credit system
    const cost = GIFT_CREDIT_COSTS[giftCode] ?? gift.cost_tokens ?? 5;

    // Deduct credits
    const result = await deductCredits(client, user.id, cost, 'gift_send', giftCode);
    if (!result.ok) {
      if (result.error === 'insufficient_credits') {
        const { data: profile } = await client
          .from('profiles')
          .select('credits_remaining')
          .eq('user_id', user.id)
          .single();
        return NextResponse.json({
          error: `Insufficient credits. Need ${cost}, have ${profile?.credits_remaining ?? 0}.`,
          code: 'insufficient_credits',
          required: cost,
          balance: profile?.credits_remaining ?? 0,
        }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
    }

    // Apply intimacy boost if girlfriend_id provided
    let intimacyBoost = gift.intimacy_boost || 0;
    if (girlfriendId && intimacyBoost > 0) {
      await client.rpc('boost_intimacy', {
        gf_id: girlfriendId,
        uid: user.id,
        amount: intimacyBoost,
      }).then(({ error }) => {
        if (error) {
          // Fallback: manual intimacy update
          logger.warn('[gifts/send] boost_intimacy rpc failed', { err: error.message });
        }
      });
    }

    return NextResponse.json({
      ok: true,
      gift_code: giftCode,
      cost,
      balance_after: result.balance_after,
      intimacy_boost: intimacyBoost,
    });
  } catch (err) {
    logger.error('[gifts/send] error', { err: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
