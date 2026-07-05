import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

/**
 * POST /api/stripe/change-plan
 *
 * Pro <-> Unlimited proration 
 * Body: { plan: 'pro' | 'unlimited' }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthUser(req);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, membership_tier')
      .eq('user_id', user.id)
      .single();

    if (!profile?.stripe_subscription_id) {
      return NextResponse.json({ error: 'No active subscription' }, { status: 404 });
    }
    if (profile.membership_tier === plan) {
      return NextResponse.json({ error: `Already on ${plan}` }, { status: 409 });
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id as string);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json({ error: 'Subscription item not found' }, { status: 500 });
    }

    const updated = await stripe.subscriptions.update(profile.stripe_subscription_id as string, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
      metadata: { user_id: user.id, plan },
    });

    //  webhook 
    await supabase
      .from('profiles')
      .update({ membership_tier: plan })
      .eq('user_id', user.id);

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
