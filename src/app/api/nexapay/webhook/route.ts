import { NextRequest, NextResponse } from 'next/server';
import { verifyNexaPayWebhook } from '@/lib/nexapay-server';
import { logger } from '@/lib/logger';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/nexapay/webhook
 * NexaPay payment webhook
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-nexapay-signature') || '';
    const data = JSON.parse(body);

    if (!verifyNexaPayWebhook(body, signature)) {
      logger.warn('[nexapay/webhook] Invalid signature', { orderId: data.order_id });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { payment_id, status, order_id, amount_usd, amount_brl, payment_method } = data;

    logger.info('[nexapay/webhook] Received', { payment_id, status, order_id });

    if (status !== 'completed') {
      return NextResponse.json({ success: true, message: 'Status noted but not processed' });
    }

    // Extract user_id from order_id (format: nxp_{userId}_{plan}_{billing}_{timestamp})
    const orderParts = (order_id || '').split('_');
    if (orderParts.length < 4 || orderParts[0] !== 'nxp') {
      logger.error('[nexapay/webhook] Invalid order_id format', { order_id });
      return NextResponse.json({ error: 'Invalid order_id' }, { status: 400 });
    }

    const userId = orderParts[1];
    const plan = orderParts[2];
    const billing = orderParts[3];

    const supabase = createClient(
      process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    // Idempotency check
    const { data: existing } = await supabase
      .from('crypto_payments')
      .select('id')
      .eq('tx_hash', payment_id)
      .eq('status', 'confirmed')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, message: 'Already processed' });
    }

    // Update payment record
    await supabase
      .from('crypto_payments')
      .update({ status: 'confirmed', amount_received: amount_usd })
      .eq('tx_hash', payment_id);

    // Grant membership
    if (['basic', 'pro', 'unlimited'].includes(plan)) {
      await supabase
        .from('profiles')
        .update({ membership_tier: plan })
        .eq('user_id', userId);

      await supabase.from('subscriptions').insert({
        user_id: userId,
        stripe_subscription_id: `nexapay_${payment_id}`,
        stripe_customer_id: `nexapay_${userId}`,
        plan_id: plan,
        status: 'active',
        billing_interval: billing,
        current_period_end: new Date(
          Date.now() + (billing === 'yearly' ? 365 : billing === 'quarterly' ? 90 : 30) * 86400000,
        ).toISOString(),
        unit_amount_cents: Math.round((amount_usd || 0) * 100),
        currency: 'usd',
      });

      // Record in purchase_history for tax tracking
      await supabase.from('purchase_history').insert({
        user_id: userId,
        item_type: 'subscription',
        item_id: plan,
        stripe_payment_intent_id: payment_id,
        payment_event_id: `nexapay_${payment_id}`,
        amount_cents: Math.round((amount_usd || 0) * 100),
        status: 'completed',
        metadata: {
          provider: 'nexapay',
          payment_method,
          amount_brl: amount_brl || null,
          billing,
        },
      });
    }

    logger.info('[nexapay/webhook] Payment processed', { payment_id, userId, plan, billing });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[nexapay/webhook] Webhook processing failed', { err });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
