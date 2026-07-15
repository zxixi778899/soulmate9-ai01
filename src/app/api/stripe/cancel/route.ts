import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

const CANCEL_LIMIT = { maxRequests: 5, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/stripe/cancel
 *
 *  Stripe  cancel_at_period_end=true
 * Body: { immediate?: boolean }   true  false
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await checkRateLimitAsync(`stripe-cancel:${user.id}`, CANCEL_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many cancellation attempts. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limit, CANCEL_LIMIT) },
      );
    }

    let body: { immediate?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const immediate = body.immediate === true;

    const supabase = getSupabaseClient();
    const { data: subscriptionRecord, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) {
      throw new Error(`Failed to load subscription: ${subscriptionError.message}`);
    }
    if (!subscriptionRecord?.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    const subscriptionId = subscriptionRecord.stripe_subscription_id;
    let subscription;
    if (immediate) {
      subscription = await stripe.subscriptions.cancel(subscriptionId);
    } else {
      subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }

    // Stripe webhooks remain the source of truth for status and entitlements.

    // Stripe v2025 current_period_end  subscription.items.data[0] 
    const subAny = subscription as unknown as {
      cancel_at?: number | null;
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const currentPeriodEnd = subAny.items?.data?.[0]?.current_period_end ?? null;

    return NextResponse.json({
      success: true,
      mode: immediate ? 'immediate' : 'at_period_end',
      cancel_at: subAny.cancel_at ?? null,
      current_period_end: currentPeriodEnd,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[stripe/cancel] error', { data: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
