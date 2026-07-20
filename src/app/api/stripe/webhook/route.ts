import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { capture, AnalyticsEvents } from '@/lib/analytics';
import { captureException } from '@/lib/sentry';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

type DatabaseError = { message: string; code?: string } | null;
type ClaimResult = { claimed: boolean; attempts: number };
type WalletResult = { applied: boolean; balance: number; ledger_id: string };
type SeatResult = { applied: boolean; total_bonus_seats: number };
const WEBHOOK_EVENT_LIMIT = { maxRequests: 20, windowMs: 60 * 60 * 1000 };

function assertDatabaseSuccess(error: DatabaseError, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function stripeId(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function claimEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<boolean> {
  const { data, error } = await admin.rpc('claim_stripe_webhook_event', {
    p_event_id: event.id,
    p_event_type: event.type,
  });
  assertDatabaseSuccess(error, 'claim Stripe webhook event');
  const result = (data as ClaimResult[] | null)?.[0];
  if (!result) throw new Error('claim Stripe webhook event returned no result');
  return result.claimed;
}

async function setEventComplete(admin: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await admin.rpc('complete_stripe_webhook_event', {
    p_event_id: eventId,
  });
  assertDatabaseSuccess(error, 'complete Stripe webhook event');
}

async function setEventFailed(
  admin: SupabaseClient,
  eventId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await admin.rpc('fail_stripe_webhook_event', {
    p_event_id: eventId,
    p_error: errorMessage,
  });
  if (error) {
    logger.error('stripe-webhook: failed to persist event failure', {
      eventId,
      error: error.message,
    });
  }
}

async function recordPurchase(
  admin: SupabaseClient,
  eventId: string,
  purchase: {
    user_id: string;
    item_type: 'tokens' | 'subscription';
    stripe_payment_intent_id: string | null;
    amount_cents: number;
    metadata: Record<string, string | number | null | undefined>;
  },
): Promise<void> {
  const { error } = await admin.from('purchase_history').upsert(
    {
      ...purchase,
      payment_event_id: eventId,
      status: 'completed',
    },
    { onConflict: 'payment_event_id', ignoreDuplicates: true },
  );
  assertDatabaseSuccess(error, 'record purchase history');
}

async function handleCheckoutCompleted(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session & {
    subscription_details?: { current_period_end?: number };
  };
  const userId = session.metadata?.user_id || session.client_reference_id;
  if (!userId) throw new Error('checkout session is missing trusted user_id metadata');

  const metaType = session.metadata?.type || 'subscription';
  if (metaType === 'companion_seats') {
    const seatCount = Number(session.metadata?.seats || 0);
    if (!Number.isSafeInteger(seatCount) || seatCount <= 0) {
      throw new Error('companion seat checkout has an invalid quantity');
    }
    const { data, error } = await admin.rpc('grant_companion_seats_idempotent', {
      p_user_id: userId,
      p_seats: seatCount,
      p_idempotency_key: `stripe:${event.id}:companion_seats`,
      p_metadata: {
        session_id: session.id,
        package_id: session.metadata?.package_id,
      },
    });
    assertDatabaseSuccess(error, 'grant companion seats');
    const result = (data as SeatResult[] | null)?.[0];
    if (!result) throw new Error('grant companion seats returned no result');
    logger.info('stripe-webhook: companion seats fulfilled', {
      userId,
      seatCount,
      totalBonusSeats: result.total_bonus_seats,
      applied: result.applied,
      eventId: event.id,
    });
    return;
  }

  if (metaType === 'tokens') {
    const tokenCount = Number(session.metadata?.token_count || 0);
    if (!Number.isSafeInteger(tokenCount) || tokenCount <= 0) {
      throw new Error('token checkout has an invalid quantity');
    }
    const { data, error } = await admin.rpc('apply_wallet_ledger', {
      p_user_id: userId,
      p_amount: tokenCount,
      p_reason: 'Stripe token pack purchase',
      p_reference_type: 'stripe_checkout',
      p_reference_id: session.id,
      p_idempotency_key: `stripe:${event.id}:tokens`,
      p_metadata: {
        session_id: session.id,
        package_id: session.metadata?.package_id,
      },
    });
    assertDatabaseSuccess(error, 'credit token wallet');
    const result = (data as WalletResult[] | null)?.[0];
    if (!result) throw new Error('credit token wallet returned no result');

    await recordPurchase(admin, event.id, {
      user_id: userId,
      item_type: 'tokens',
      stripe_payment_intent_id: stripeId(session.payment_intent),
      amount_cents: session.amount_total || 0,
      metadata: {
        package_id: session.metadata?.package_id,
        token_count: tokenCount,
        session_id: session.id,
        ledger_id: result.ledger_id,
      },
    });
    logger.info('stripe-webhook: tokens fulfilled', {
      userId,
      tokenCount,
      balance: result.balance,
      applied: result.applied,
      eventId: event.id,
    });
    capture(userId, AnalyticsEvents.SUBSCRIPTION_STARTED, {
      plan: 'tokens',
      token_count: tokenCount,
      amount_cents: session.amount_total || 0,
      stripe_session_id: session.id,
      route: 'stripe-webhook',
    });
    return;
  }

  const plan = session.metadata?.plan || 'pro';
  const billing = session.metadata?.billing || 'monthly';
  const tierMap: Record<string, 'basic' | 'pro' | 'unlimited'> = {
    basic: 'basic',
    basic_quarterly: 'basic',
    basic_yearly: 'basic',
    pro: 'pro',
    pro_quarterly: 'pro',
    pro_yearly: 'pro',
    premium: 'pro',
    unlimited: 'unlimited',
    unlimited_quarterly: 'unlimited',
    unlimited_yearly: 'unlimited',
  };
  const tier = tierMap[plan];
  if (!tier) throw new Error(`unsupported subscription plan: ${plan}`);
  const subscriptionId = stripeId(session.subscription);
  if (!subscriptionId) throw new Error('subscription checkout is missing subscription id');
  const periodDays = billing === 'yearly' || plan.endsWith('_yearly') ? 365 : billing === 'quarterly' || plan.endsWith('_quarterly') ? 90 : 30;
  const stripeSubscription = await getStripe().subscriptions.retrieve(subscriptionId);
  const subscriptionPrice = stripeSubscription.items.data[0]?.price;
  const recurring = subscriptionPrice?.recurring;

  const { error: profileError } = await admin
    .from('profiles')
    .update({ membership_tier: tier, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  assertDatabaseSuccess(profileError, 'upgrade profile membership');

  const { error: subscriptionError } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: stripeId(session.customer),
      stripe_price_id: subscriptionPrice?.id || null,
      unit_amount_cents: subscriptionPrice?.unit_amount || null,
      currency: subscriptionPrice?.currency || null,
      billing_interval: recurring?.interval || null,
      billing_interval_count: recurring?.interval_count || null,
      plan_id: plan,
      status: 'active',
      current_period_end: session.subscription_details?.current_period_end
        ? new Date(session.subscription_details.current_period_end * 1000).toISOString()
        : new Date(Date.now() + periodDays * 86_400_000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );
  assertDatabaseSuccess(subscriptionError, 'upsert subscription');

  await recordPurchase(admin, event.id, {
    user_id: userId,
    item_type: 'subscription',
    stripe_payment_intent_id: stripeId(session.payment_intent),
    amount_cents: session.amount_total || 0,
    metadata: { plan, billing, session_id: session.id },
  });
  capture(userId, AnalyticsEvents.SUBSCRIPTION_STARTED, {
    plan,
    tier,
    billing,
    amount_cents: session.amount_total || 0,
    stripe_session_id: session.id,
    route: 'stripe-webhook',
  });
  logger.info('stripe-webhook: subscription checkout fulfilled', {
    userId,
    tier,
    plan,
    eventId: event.id,
  });
}

async function resolveSubscriptionUser(
  admin: SupabaseClient,
  metadataUserId: string | undefined,
  stripeCustomerId: string | null,
): Promise<string | undefined> {
  if (metadataUserId) return metadataUserId;
  if (!stripeCustomerId) return undefined;
  const { data, error } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .limit(1)
    .maybeSingle();
  assertDatabaseSuccess(error, 'resolve subscription user');
  return data?.user_id;
}

async function handlePaymentFailed(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = stripeId(invoice.customer);
  const userId = await resolveSubscriptionUser(admin, invoice.metadata?.user_id, customerId);
  if (!userId) {
    logger.warn('stripe-webhook: payment failed for unresolved user', {
      customerId,
      invoiceId: invoice.id,
    });
    return;
  }
  if (customerId) {
    const { error } = await admin
      .from('subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('stripe_customer_id', customerId);
    assertDatabaseSuccess(error, 'mark subscription past due');
  }
  logger.warn('stripe-webhook: payment failed; grace access retained', {
    userId,
    customerId,
    invoiceId: invoice.id,
  });
}

function tierFromSubscription(subscription: Stripe.Subscription): 'basic' | 'pro' | 'unlimited' {
  const price = subscription.items.data[0]?.price;
  const configuredUnlimited = new Set([
    process.env.STRIPE_UNLIMITED_PRICE_ID,
    process.env.STRIPE_UNLIMITED_YEARLY_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID,
  ].filter((value): value is string => Boolean(value)));
  const configuredBasic = new Set([
    process.env.STRIPE_BASIC_PRICE_ID,
    process.env.STRIPE_BASIC_YEARLY_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID,
  ].filter((value): value is string => Boolean(value)));
  const planHint = `${subscription.metadata?.plan || ''} ${price?.lookup_key || ''}`.toLowerCase();
  if (configuredUnlimited.has(price?.id || '') || planHint.includes('unlimited')) return 'unlimited';
  if (configuredBasic.has(price?.id || '') || planHint.includes('basic')) return 'basic';
  return 'pro';
}

async function handleSubscriptionUpdated(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = stripeId(subscription.customer);
  const userId = await resolveSubscriptionUser(admin, subscription.metadata?.user_id, customerId);
  if (!userId) throw new Error('subscription update could not resolve user');

  const tier = tierFromSubscription(subscription);
  const shouldDowngrade = subscription.status === 'canceled' || subscription.status === 'unpaid';
  const shouldUpgrade = subscription.status === 'active' || subscription.status === 'trialing';
  const { error: subscriptionError } = await admin
    .from('subscriptions')
    .update({
      plan_id: subscription.items.data[0]?.price?.lookup_key || subscription.items.data[0]?.price?.id || tier,
      stripe_price_id: subscription.items.data[0]?.price?.id || null,
      unit_amount_cents: subscription.items.data[0]?.price?.unit_amount || null,
      currency: subscription.items.data[0]?.price?.currency || null,
      billing_interval: subscription.items.data[0]?.price?.recurring?.interval || null,
      billing_interval_count: subscription.items.data[0]?.price?.recurring?.interval_count || null,
      status: subscription.status,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);
  assertDatabaseSuccess(subscriptionError, 'update subscription status');

  if (shouldDowngrade || shouldUpgrade) {
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        membership_tier: shouldDowngrade ? 'free' : tier,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    assertDatabaseSuccess(profileError, 'synchronize membership tier');
  }
  logger.info('stripe-webhook: subscription synchronized', {
    userId,
    subscriptionId: subscription.id,
    status: subscription.status,
    tier,
  });
}

async function handleSubscriptionDeleted(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = stripeId(subscription.customer);
  const userId = await resolveSubscriptionUser(admin, subscription.metadata?.user_id, customerId);
  if (!userId) throw new Error('deleted subscription could not resolve user');

  const { error: profileError } = await admin
    .from('profiles')
    .update({ membership_tier: 'free', updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  assertDatabaseSuccess(profileError, 'downgrade canceled subscription');
  const { error: subscriptionError } = await admin
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscription.id);
  assertDatabaseSuccess(subscriptionError, 'mark subscription canceled');
  capture(userId, AnalyticsEvents.SUBSCRIPTION_CANCELED, {
    stripe_subscription_id: subscription.id,
    route: 'stripe-webhook',
  });
}

async function processEvent(admin: SupabaseClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(admin, event);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(admin, event);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(admin, event);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(admin, event);
      break;
    default:
      logger.info('stripe-webhook: event acknowledged without handler', {
        eventId: event.id,
        eventType: event.type,
      });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('stripe-webhook: STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook unavailable' }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    logger.warn('stripe-webhook: invalid signature', {
      error: error instanceof Error ? error.message : 'unknown signature error',
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const limit = await checkRateLimitAsync(`stripe-webhook:${event.id}`, WEBHOOK_EVENT_LIMIT);
  if (!limit.allowed) {
    logger.warn('stripe-webhook: event retry limit reached', { eventId: event.id });
    return NextResponse.json(
      { error: 'Too many webhook retries' },
      { status: 429, headers: rateLimitHeaders(limit, WEBHOOK_EVENT_LIMIT) },
    );
  }

  const admin = getSupabaseClient();
  try {
    const claimed = await claimEvent(admin, event);
    if (!claimed) {
      logger.info('stripe-webhook: completed duplicate ignored', { eventId: event.id });
      return NextResponse.json({ received: true, duplicate: true });
    }
    await processEvent(admin, event);
    await setEventComplete(admin, event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown webhook error';
    await setEventFailed(admin, event.id, message);
    logger.error('stripe-webhook: processing failed', {
      eventId: event.id,
      eventType: event.type,
      error: message,
    });
    captureException(error, {
      tags: { handler: 'stripe-webhook', eventType: event.type },
      extra: { eventId: event.id },
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
