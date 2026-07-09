import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe-server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { capture, AnalyticsEvents } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';

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
    // `subscription_details.current_period_end` is present on the raw Stripe
    // payload for subscription-mode checkout sessions but isn't always in the
    // installed SDK's type definitions across versions, so we extend narrowly
    // instead of casting the whole object to `any`.
    const session = event.data.object as Stripe.Checkout.Session & {
      subscription_details?: { current_period_end?: number };
    };
    const userId = session.metadata?.user_id || session.client_reference_id;
    const plan = session.metadata?.plan || 'pro';

    if (!userId) {
      logger.error('stripe-webhook: No user_id in Stripe session metadata', { sessionId: session.id });
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
    }

    const tierMap: Record<string, string> = { pro: 'pro', unlimited: 'unlimited' };
    const tier = tierMap[plan] || 'pro';

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

  // ── invoice.payment_failed ────────────────────────────────────────
  if (event.type === 'invoice.payment_failed') {
    try {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeCustomerId: string | undefined =
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

      // Resolve user_id: prefer subscription metadata, fall back to DB lookup
      let userId: string | undefined = invoice.metadata?.user_id;
      if (!userId && stripeCustomerId) {
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .limit(1)
          .maybeSingle();
        userId = sub?.user_id;
      }

      if (userId) {
        await supabaseAdmin
          .from('profiles')
          .update({ membership_tier: 'free', updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        if (stripeCustomerId) {
          await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_customer_id', stripeCustomerId);
        }

        logger.warn('[stripe-webhook] payment failed — downgraded to free', {
          userId,
          stripeCustomerId,
          invoiceId: invoice.id,
        });
      } else {
        logger.warn('[stripe-webhook] payment failed but could not resolve user', {
          stripeCustomerId,
          invoiceId: invoice.id,
        });
      }
    } catch (err) {
      logger.error('[stripe-webhook] error handling invoice.payment_failed', { error: String(err) });
      captureException(err, { tags: { handler: 'invoice.payment_failed' } });
    }
  }

  // ── customer.subscription.updated ─────────────────────────────────
  if (event.type === 'customer.subscription.updated') {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      const previousAttributes = event.data.previous_attributes as
        | Partial<Stripe.Subscription>
        | undefined;
      const stripeCustomerId: string =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

      // Resolve user_id
      let userId: string | undefined = subscription.metadata?.user_id;
      if (!userId && stripeCustomerId) {
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .limit(1)
          .maybeSingle();
        userId = sub?.user_id;
      }

      const currentStatus: string = subscription.status;
      const previousStatus: string | undefined = previousAttributes?.status ?? undefined;

      // If status changed to past_due, log warning but do NOT downgrade yet
      if (currentStatus === 'past_due') {
        logger.warn('[stripe-webhook] subscription is now past_due — no downgrade yet', {
          userId,
          subscriptionId: subscription.id,
          previousStatus,
        });
      }

      // If the plan/price changed, update membership_tier accordingly
      const prevItems = previousAttributes?.items?.data;
      const currItems = subscription.items?.data;
      const planChanged =
        prevItems && currItems &&
        prevItems[0]?.price?.id !== currItems[0]?.price?.id;

      if (planChanged && userId) {
        // Derive tier from the new price lookup key or product metadata
        const newPriceId: string | undefined = currItems?.[0]?.price?.id ?? undefined;
        const newLookupKey: string | undefined = currItems?.[0]?.price?.lookup_key ?? undefined;

        const tierMap: Record<string, string> = {
          pro: 'pro',
          premium: 'pro',
          unlimited: 'unlimited',
        };
        const newTier = tierMap[newLookupKey || ''] || 'pro';

        await supabaseAdmin
          .from('profiles')
          .update({ membership_tier: newTier, updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        await supabaseAdmin
          .from('subscriptions')
          .update({
            plan_id: newLookupKey || newPriceId || 'unknown',
            status: currentStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        logger.info('[stripe-webhook] subscription plan changed', {
          userId,
          newTier,
          newPriceId,
          subscriptionId: subscription.id,
        });
      }
    } catch (err) {
      logger.error('[stripe-webhook] error handling customer.subscription.updated', { error: String(err) });
      captureException(err, { tags: { handler: 'customer.subscription.updated' } });
    }
  }

  // ── customer.subscription.deleted ─────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    try {
      const subscription = event.data.object as Stripe.Subscription;
      const stripeCustomerId: string | undefined =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

      // Resolve user_id: prefer metadata, fall back to DB lookup
      let userId: string | undefined = subscription.metadata?.user_id;
      if (!userId && stripeCustomerId) {
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .limit(1)
          .maybeSingle();
        userId = sub?.user_id;
      }

      if (userId) {
        await supabaseAdmin
          .from('profiles')
          .update({ membership_tier: 'free', updated_at: new Date().toISOString() })
          .eq('user_id', userId);

        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subscription.id);

        logger.info('[stripe-webhook] subscription deleted — downgraded to free', {
          userId,
          subscriptionId: subscription.id,
        });

        capture(userId, AnalyticsEvents.SUBSCRIPTION_CANCELED, {
          stripe_subscription_id: subscription.id,
          route: 'stripe-webhook',
        });
      } else {
        logger.warn('[stripe-webhook] subscription deleted but could not resolve user', {
          stripeCustomerId,
          subscriptionId: subscription.id,
        });
      }
    } catch (err) {
      logger.error('[stripe-webhook] error handling customer.subscription.deleted', { error: String(err) });
      captureException(err, { tags: { handler: 'customer.subscription.deleted' } });
    }
  }

  return NextResponse.json({ received: true });
}
