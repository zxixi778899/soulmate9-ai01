import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { capture, AnalyticsEvents } from '@/lib/analytics';

function getAdminClient(): SupabaseClient {
  return getSupabaseClient();
}

async function tryRecordEvent(
  admin: SupabaseClient,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const { error } = await admin
    .from('stripe_webhook_events')
    .insert({ event_id: eventId, event_type: eventType, processed_at: new Date().toISOString() });
  if (!error) return true;
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('duplicate') || msg.includes('unique') || error.code === '23505') {
    return false;
  }
  if (msg.includes('does not exist') || msg.includes('not found')) {
    logger.warn('stripe-webhook: stripe_webhook_events table missing, skipping dedupe');
    return true;
  }
  logger.error('stripe-webhook: dedupe insert error', { error });
  return true;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') || '';

  let event;
  try {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('stripe-webhook: STRIPE_WEBHOOK_SECRET not configured, ignoring event to avoid retry storm');
      return NextResponse.json({ received: true, ignored: true, reason: 'webhook_secret_not_configured' });
    }
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!event) {
    return NextResponse.json({ error: 'Failed to construct event' }, { status: 400 });
  }

  const supabaseAdmin = getAdminClient();
  const isFirst = await tryRecordEvent(supabaseAdmin, event.id, event.type);
  if (!isFirst) {
    logger.info('stripe-webhook: duplicate event ignored', { eventId: event.id });
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const userId = session.metadata?.user_id || session.client_reference_id;
    const plan = session.metadata?.plan || 'pro';

    if (!userId) {
      logger.error('stripe-webhook: No user_id in Stripe session metadata', { sessionId: session.id });
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    const tierMap: Record<string, string> = { pro: 'premium', unlimited: 'unlimited' };
    const tier = tierMap[plan] || 'premium';

    await supabaseAdmin
      .from('profiles')
      .update({ membership_tier: tier, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        stripe_subscription_id: session.subscription,
        stripe_customer_id: session.customer,
        plan_id: plan,
        status: 'active',
        current_period_end: session.subscription_details?.current_period_end
          ? new Date(session.subscription_details.current_period_end * 1000).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });

    await supabaseAdmin
      .from('purchase_history')
      .insert({
        user_id: userId,
        item_type: 'subscription',
        stripe_payment_intent_id: session.payment_intent,
        amount_cents: session.amount_total || 0,
        status: 'completed',
        metadata: { plan, session_id: session.id },
      });

    logger.info('stripe-webhook: user upgraded', { userId, tier, sessionId: session.id });
    capture(userId, AnalyticsEvents.SUBSCRIPTION_STARTED, {
      plan,
      tier,
      amount_cents: session.amount_total || 0,
      stripe_session_id: session.id,
      route: 'stripe-webhook',
    });
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any;
    const userId = subscription.metadata?.user_id;

    if (userId) {
      await supabaseAdmin
        .from('profiles')
        .update({ membership_tier: 'free', updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subscription.id);

      capture(userId, AnalyticsEvents.SUBSCRIPTION_CANCELED, {
        stripe_subscription_id: subscription.id,
        route: 'stripe-webhook',
      });
    }
  }

  return NextResponse.json({ received: true });
}
