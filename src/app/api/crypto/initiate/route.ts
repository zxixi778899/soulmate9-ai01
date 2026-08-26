import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { nowPaymentsCreatePayment, getNowPaymentsPriceCents } from '@/lib/nowpayments-server';
import { logger } from '@/lib/logger';

/** Membership checkout is USDT TRC-20 only */
const PAYMENT_CURRENCY = 'usdttrc20'; // NOWPayments currency code

export async function POST(request: Request) {
  const { user, error } = await getAuthUser(request);
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  logger.info('[crypto/initiate] Received request:', { 
    planId: body.planId, 
    billing: body.billing,
    userId: user.id.slice(-8) // Last 8 chars for privacy
  });

  // Validate plan
  if (!body.planId || !['pro', 'premium', 'unlimited'].includes(body.planId)) {
    logger.warn('[crypto/initiate] Invalid plan:', { planId: body.planId });
    return NextResponse.json({ error: 'Invalid plan. Must be: pro, premium, unlimited' }, { status: 400 });
  }

  const { planId, billing } = body;
  
  // Get price in cents based on plan and billing cycle
  const amountCents = getNowPaymentsPriceCents(planId, billing);
  if (!amountCents) {
    logger.warn('[crypto/initiate] No price found:', { planId, billing });
    return NextResponse.json(
      { error: `No price found for ${planId}/${billing}` }, 
      { status: 400 }
    );
  }
  
  // amount_usd is numeric(12,2) storing dollars (e.g. 9.99)
  const amountUsd = amountCents / 100;

  // Determine billing cycle
  const cycle: 'monthly' | 'yearly' = billing === 'yearly' ? 'yearly' : 'monthly';

  // Create NOWPayments payment
  const cycleLabel = cycle === 'yearly' ? 'Yearly' : 'Monthly';
  const planName = planId.charAt(0).toUpperCase() + planId.slice(1);
  const orderDescription = `${planName} ${cycleLabel} Membership`;
  const orderId = `soulmate_${planId}_${cycle}_${Date.now()}`;

  // Create pending payment record in DB for tracking
  const supabase = getSupabaseClient();
  const { data: payment, error: dbError } = await supabase
    .from('crypto_payments')
    .insert({
      user_id: user.id,
      plan_id: planId,
      amount_usd: amountUsd,
      currency: 'USDT',
      // network and expires_at columns may not exist yet - will be added via migration
      // For NowPayments hosted invoices, we store the pay_address in wallet_address temporarily
      wallet_address: '', // Will be filled by webhook when payment received
      status: 'awaiting_payment',
    })
    .select('id')
    .single();

  if (dbError || !payment) {
    logger.error('Failed to create crypto payment record:', { error: dbError });
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
  }

  try {
    // Create NOWPayments payment
    const paymentResult = await nowPaymentsCreatePayment({
      price_amount: amountUsd,
      price_currency: 'usd',
      pay_currency: PAYMENT_CURRENCY,
      order_id: orderId,
      order_description: orderDescription,
      ipn_callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/crypto/webhook`,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
    });

    return NextResponse.json({
      success: true,
      paymentId: paymentResult.payment_id,
      payAddress: paymentResult.pay_address,
      network: paymentResult.network || 'TRC-20',
      currency: 'USDT',
      billing: cycle,
      amountUsd,
      payAmount: paymentResult.pay_amount,
      expirationTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    logger.error('NOWPayments API call failed:', { 
      err: err instanceof Error ? err.message : 'Unknown error',
      planId,
      billing,
      amountUsd,
    });
    
    // Provide user-friendly error message
    if (err instanceof Error && err.message.includes('misconfigured')) {
      return NextResponse.json(
        { error: 'Payment service is temporarily unavailable. Please contact support.' }, 
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create payment with NOWPayments', details: err instanceof Error ? err.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}
