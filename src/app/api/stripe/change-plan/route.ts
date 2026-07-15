import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { getStripeCheckoutGate, stripeGateMessage } from '@/lib/payment-compliance';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

const CHANGE_PLAN_LIMIT = { maxRequests: 5, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/stripe/change-plan
 *
 * Pro <-> Unlimited proration 
 * Body: { plan: 'pro' | 'unlimited' }
 */
export async function POST(req: NextRequest) {
  try {
    const paymentGate = getStripeCheckoutGate();
    if (!paymentGate.allowed) {
      return NextResponse.json(
        { error: stripeGateMessage(paymentGate), code: paymentGate.code },
        { status: 503 },
      );
    }

    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await checkRateLimitAsync(`stripe-change-plan:${user.id}`, CHANGE_PLAN_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many plan changes. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limit, CHANGE_PLAN_LIMIT) },
      );
    }

    const { plan } = (await req.json()) as { plan?: string };
    if (plan !== 'pro' && plan !== 'unlimited') {
      return NextResponse.json({ error: 'Invalid plan, must be pro|unlimited' }, { status: 400 });
    }

    const priceMap: Record<string, string> = {
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID || '',
      unlimited:
        process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID || process.env.STRIPE_UNLIMITED_PRICE_ID || '',
    };
    const newPriceId = priceMap[plan];
    if (!newPriceId) {
      return NextResponse.json({ error: 'Stripe price not configured' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('membership_tier')
      .eq('user_id', user.id)
      .single();
    if (profileError) {
      throw new Error(`Failed to load membership: ${profileError.message}`);
    }
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
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }
    if (profile.membership_tier === plan) {
      return NextResponse.json({ error: `Already on ${plan}` }, { status: 409 });
    }

    const stripe = getStripe();
    const subscriptionId = subscriptionRecord.stripe_subscription_id;
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json({ error: 'Subscription item not found' }, { status: 500 });
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
      metadata: { user_id: user.id, plan },
    });

    // Stripe v2025: current_period_end  items.data[0]
    const updatedAny = updated as unknown as {
      items?: { data?: Array<{ current_period_end?: number }> };
    };
    const currentPeriodEnd = updatedAny.items?.data?.[0]?.current_period_end ?? null;

    return NextResponse.json({
      success: true,
      new_plan: plan,
      current_period_end: currentPeriodEnd,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[stripe/change-plan] error', { data: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
