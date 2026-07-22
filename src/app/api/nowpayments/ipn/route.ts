import { NextRequest, NextResponse } from 'next/server';
import { verifyNowPaymentsIPN } from '@/lib/nowpayments-server';
import { grantCredits } from '@/lib/credit-system';
import { logger } from '@/lib/logger';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/nowpayments/ipn
 * NOWPayments IPN (Instant Payment Notification) webhook
 * Called when payment status changes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-nowpayments-sig') || '';
    const data = JSON.parse(body);

    // Verify webhook signature
    if (!verifyNowPaymentsIPN(body, signature)) {
      logger.warn('[nowpayments/ipn] Invalid signature', { orderId: data.order_id });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { payment_id, payment_status, order_id, actually_paid, price_amount, pay_currency } = data;

    logger.info('[nowpayments/ipn] Received', { payment_id, payment_status, order_id });

    // Only process completed payments
    if (payment_status !== 'finished' && payment_status !== 'confirmed') {
      return NextResponse.json({ success: true, message: 'Status noted but not processed' });
    }

    // order_id formats:
    //   membership: np_{userId}_{plan}_{billing}_{timestamp}
    //   credit pack: np_{userId}_tokens_{totalTokens}_{timestamp}
    const orderParts = (order_id || '').split('_');
    if (orderParts.length < 4 || orderParts[0] !== 'np') {
      logger.error('[nowpayments/ipn] Invalid order_id format', { order_id });
      return NextResponse.json({ error: 'Invalid order_id' }, { status: 400 });
    }

    const userId = orderParts[1];
    const isTokenPurchase = orderParts[2] === 'tokens';
    const plan = orderParts[2];
    const billing = orderParts[3];

    // Use service role client for DB operations
    const supabase = createClient(
      process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    // Check idempotency — skip if already processed
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
      .update({
        status: 'confirmed',
        amount_received: actually_paid || price_amount,
      })
      .eq('tx_hash', payment_id);

    // ── Credit pack purchase: grant credits ─────────────────────────────────
    if (isTokenPurchase) {
      const totalTokens = parseInt(orderParts[3], 10);
      if (!Number.isSafeInteger(totalTokens) || totalTokens <= 0) {
        logger.error('[nowpayments/ipn] Invalid token amount in order_id', { order_id });
        return NextResponse.json({ error: 'Invalid token amount' }, { status: 400 });
      }

      const { data: payRow } = await supabase
        .from('crypto_payments')
        .select('plan_id')
        .eq('tx_hash', payment_id)
        .maybeSingle();
      const packageId = payRow?.plan_id || null;

      const grant = await grantCredits(supabase, userId, totalTokens, 'token_purchase', payment_id);
      if (!grant.ok) throw new Error(`credit token wallet: ${grant.error}`);

      // Keep the legacy user_tokens mirror in sync (shop balance reads it first)
      await supabase.from('user_tokens').upsert(
        { user_id: userId, balance_tokens: grant.balance_after, last_updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

      await supabase.from('purchase_history').insert({
        user_id: userId,
        item_type: 'tokens',
        item_id: packageId,
        stripe_payment_intent_id: payment_id,
        payment_event_id: `nowpayments_${payment_id}`,
        amount_cents: Math.round((price_amount || 0) * 100),
        status: 'completed',
        metadata: {
          provider: 'nowpayments',
          pay_currency,
          actually_paid: actually_paid || null,
          token_count: totalTokens,
          balance_after: grant.balance_after,
        },
      });

      logger.info('[nowpayments/ipn] Credits granted', { payment_id, userId, totalTokens, balance: grant.balance_after });
      return NextResponse.json({ success: true });
    }

    // Grant membership
    if (['basic', 'pro', 'unlimited'].includes(plan)) {
      await supabase
        .from('profiles')
        .update({ membership_tier: plan })
        .eq('user_id', userId);

      // Record subscription
      await supabase.from('subscriptions').insert({
        user_id: userId,
        stripe_subscription_id: `nowpayments_${payment_id}`,
        stripe_customer_id: `nowpayments_${userId}`,
        plan_id: plan,
        status: 'active',
        billing_interval: billing,
        current_period_end: new Date(
          Date.now() + (billing === 'yearly' ? 365 : billing === 'quarterly' ? 90 : 30) * 86400000,
        ).toISOString(),
        unit_amount_cents: Math.round((price_amount || 0) * 100),
        currency: 'usd',
      });

      // Record in purchase_history for tax tracking
      await supabase.from('purchase_history').insert({
        user_id: userId,
        item_type: 'subscription',
        item_id: plan,
        stripe_payment_intent_id: payment_id,
        payment_event_id: `nowpayments_${payment_id}`,
        amount_cents: Math.round((price_amount || 0) * 100),
        status: 'completed',
        metadata: {
          provider: 'nowpayments',
          pay_currency,
          actually_paid: actually_paid || null,
          billing,
        },
      });
    }

    logger.info('[nowpayments/ipn] Payment processed', { payment_id, userId, plan, billing });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[nowpayments/ipn] Webhook processing failed', { err });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
