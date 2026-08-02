import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { CRYPTO_CURRENCIES, PLAN_PRICES, getPlanPriceCents } from '@/lib/crypto-config';
import { logger } from '@/lib/logger';

/** Membership checkout is USDT-only — map common client aliases to the config id. */
const CURRENCY_ALIASES: Record<string, string> = {
  USDT: 'usdt-trc20',
  usdt: 'usdt-trc20',
  'USDT-TRC20': 'usdt-trc20',
  'usdt-trc20': 'usdt-trc20',
};

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId, currencyId, billing } = await request.json();

    // Validate plan
    if (!planId || !PLAN_PRICES[planId]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Validate currency (membership purchases are USDT-only)
    const normalizedId = CURRENCY_ALIASES[currencyId] ?? currencyId;
    const currency = CRYPTO_CURRENCIES.find((c) => c.id === normalizedId);
    if (!currency || currency.id !== 'usdt-trc20') {
      return NextResponse.json(
        { error: 'Only USDT (TRC-20) is accepted for membership' },
        { status: 400 },
      );
    }

    // Billing cycle — yearly pays the discounted yearly price
    const cycle: 'monthly' | 'yearly' = billing === 'yearly' ? 'yearly' : 'monthly';
    const amountCents = getPlanPriceCents(planId, cycle);
    if (!amountCents) {
      return NextResponse.json({ error: 'Invalid plan price' }, { status: 400 });
    }
    // amount_usd is numeric(12,2) storing dollars (e.g. 9.99)
    const amountUsd = amountCents / 100;

    // Create pending payment record in DB
    const supabase = getSupabaseClient();
    const { data: payment, error: dbError } = await supabase
      .from('crypto_payments')
      .insert({
        user_id: user.id,
        plan_id: planId,
        amount_usd: amountUsd,
        currency: currency.symbol,
        wallet_address: currency.address,
        billing: cycle,
        status: 'awaiting_payment',
      })
      .select('id')
      .single();

    if (dbError || !payment) {
      logger.error('Failed to create crypto payment record:', { data: dbError });
      return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      walletAddress: currency.address,
      network: currency.network,
      currency: currency.symbol,
      billing: cycle,
      amountUsd,
      minConfirmations: currency.minConfirmations,
    });
  } catch (err) {
    logger.error('Crypto initiate error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}