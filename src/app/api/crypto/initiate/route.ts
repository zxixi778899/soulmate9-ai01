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
    const nowPaymentsUrl = 'https://www.oxmate-ai.com'; // Fixed production URL
    
    const paymentResult = await nowPaymentsCreatePayment({
      price_amount: amountUsd,
      price_currency: 'usd',
      pay_currency: PAYMENT_CURRENCY,
      order_id: orderId,
      order_description: orderDescription,
      ipn_callback_url: `${nowPaymentsUrl}/api/crypto/webhook`,
      success_url: `${nowPaymentsUrl}/pricing?success=true`,
      cancel_url: `${nowPaymentsUrl}/pricing?canceled=true`,
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
    
    // 降级到手动支付模式（当 NOWPayments API 失败时）
    const walletAddress = process.env.CRYPTO_WALLET_TRC20;
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Payment service is temporarily unavailable. Please contact support.' }, 
        { status: 503 }
      );
    }
    
    // 返回手动支付信息（用户发送 USDT 到自己的钱包）
    return NextResponse.json({
      success: true,
      manualPayment: true, // 标记为手动支付模式
      paymentId: payment.id,
      payAddress: walletAddress, // 使用配置的钱包地址
      network: 'TRC-20',
      currency: 'USDT',
      billing: cycle,
      amountUsd,
      payAmount: amountUsd, // 固定金额
      instructions: `
        ⚠️ **Manual Payment Mode** \n\n` +
        `Please send exactly **$${amountUsd.toFixed(2)} USDT (TRC-20)** to:\n` +
        `📍 Address: ${walletAddress}\n` +
        `💰 Amount: $${amountUsd.toFixed(2)} USDT\n` +
        `🌐 Network: TRC-20 (Tether TrueLink Chain)\n\n` +
        `**Important:**\n` +
        `- Send ONLY USDT on TRC-20 network\n` +
        `- Exact amount required for automatic verification\n` +
        `- After sending, check your email for verification instructions\n\n` +
        `⏱️ Payment expires in 15 minutes\n` +
        `🔒 Order ID: ${orderId}
      `.trim(),
      orderId: orderId,
    });
  }
}
