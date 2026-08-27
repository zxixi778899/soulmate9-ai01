import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { jangoPayCreatePayment } from '@/lib/jangopay-server';
import { logger } from '@/lib/logger';

/** Membership checkout via JangoPay */
export async function POST(request: NextRequest) {
  const { user, error } = await getAuthUser(request);
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  logger.info('[jangopay/initiate] Received request:', { 
    planId: body.planId, 
    billing: body.billing,
    userId: user.id.slice(-8),
  });

  // Validate plan
  if (!body.planId || !['pro', 'premium', 'unlimited'].includes(body.planId)) {
    logger.warn('[jangopay/initiate] Invalid plan:', { planId: body.planId });
    return NextResponse.json(
      { error: 'Invalid plan. Must be: pro, premium, unlimited' }, 
      { status: 400 }
    );
  }

  const { planId, billing } = body;
  
  // Get price (simplified - use fixed values for now)
  const prices: Record<string, number> = {
    pro: 9.99,
    premium: 19.99,
    unlimited: 34.99,
  };
  
  const amountUsd = prices[planId] * (billing === 'yearly' ? 0.75 : 1); // 25% yearly discount

  // Determine billing cycle
  const cycle: 'monthly' | 'yearly' = billing === 'yearly' ? 'yearly' : 'monthly';

  // Create payment record in DB
  const supabase = getSupabaseClient();
  const orderId = `jangopay_${planId}_${cycle}_${Date.now()}`;
  
  const { data: payment, error: dbError } = await supabase
    .from('crypto_payments')
    .insert({
      user_id: user.id,
      plan_id: planId,
      amount_usd: amountUsd,
      currency: 'USD',
      wallet_address: '',
      status: 'awaiting_payment',
      order_id: orderId, // Add new field for JangoPay transaction tracking
    })
    .select('id')
    .single();

  if (dbError || !payment) {
    logger.error('Failed to create crypto payment record:', { error: dbError });
    return NextResponse.json(
      { error: 'Failed to initiate payment' }, 
      { status: 500 }
    );
  }

  try {
    // Create JangoPay payment
    const paymentResult = await jangoPayCreatePayment({
      amount: amountUsd,
      currency: 'USD',
      recipientId: process.env.JANGOPAY_RECIPIENT_ID || '',
      description: `SoulMate ${planId.charAt(0).toUpperCase() + planId.slice(1)} ${cycle} Membership`,
      reference: orderId,
    });

    if (!paymentResult.redirectUrl) {
      throw new Error('JangoPay did not return redirect URL');
    }

    logger.info('[jangopay/initiate] Payment redirect URL generated:', {
      orderId,
      redirectUrl: paymentResult.redirectUrl,
    });

    return NextResponse.json({
      success: true,
      redirectUrl: paymentResult.redirectUrl,
      orderId: paymentResult.merchantReference || orderId,
      paymentId: paymentResult.transactionId,
    });
  } catch (err) {
    logger.error('JangoPay payment creation failed:', { 
      err: err instanceof Error ? err.message : 'Unknown error',
      planId,
      billing,
      amountUsd,
    });

    return NextResponse.json(
      { error: 'Failed to create payment with JangoPay' }, 
      { status: 500 }
    );
  }
}
