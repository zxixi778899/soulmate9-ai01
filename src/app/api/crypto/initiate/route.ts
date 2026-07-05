import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { CRYPTO_CURRENCIES, PLAN_PRICES } from '@/lib/crypto-config';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId, currencyId } = await request.json();

    // Validate plan
    if (!planId || !PLAN_PRICES[planId]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Validate currency
    const currency = CRYPTO_CURRENCIES.find((c) => c.id === currencyId);
    if (!currency) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }

    const amountUsd = PLAN_PRICES[planId];

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
      amountUsd,
      minConfirmations: currency.minConfirmations,
    });
  } catch (err) {
    logger.error('Crypto initiate error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}