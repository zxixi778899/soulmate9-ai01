import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { nowPaymentsCreatePayment, getNowPaymentsPriceCents } from '@/lib/nowpayments-server';
import { logger } from '@/lib/logger';

/** Membership checkout is USDT TRC-20 only */
const PAYMENT_CURRENCY = 'usdttrc20'; // NOWPayments currency code

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { planId, billing } = await request.json();

    // Validate plan
    if (!planId || !['pro', 'premium', 'unlimited'].includes(planId)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Get price in cents based on plan and billing cycle
    const amountCents = getNowPaymentsPriceCents(planId, billing);
    if (!amountCents) {
      return NextResponse.json(
        { error: `No price found for ${planId}/${billing}` }, 
        { status: 400 }
      );
    }
    
    // amount_usd is numeric(12,2) storing dollars (e.g. 9.99)
    const amountUsd = amountCents / 100;

    // Create NOWPayments payment
    const cycleLabel = billing === 'yearly' ? 'Yearly' : 'Monthly';
    const planName = planId.charAt(0).toUpperCase() + planId.slice(1);
    const orderDescription = `${planName} ${cycleLabel} Membership`;
    const orderId = `soulmate_${planId}_${billing}_${Date.now()}`;

    // Create pending payment record in DB for tracking
    const supabase = getSupabaseClient();
    const { data: payment, error: dbError } = await supabase
      .from('crypto_payments')
      .insert({
        user_id: user.id,
        plan_id: planId,
        amount_usd: amountUsd,
        currency: 'USDT',
        network: 'TRC-20',
        status: 'awaiting_payment',
        expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from NOW
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
      logger.error('NOWPayments API call failed:', { err });
      return NextResponse.json(
        { error: 'Failed to create payment with NOWPayments' }, 
        { status: 500 }
      );
  }
}