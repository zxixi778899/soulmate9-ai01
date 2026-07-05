import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

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

    let body: { immediate?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const immediate = body.immediate === true;

    const supabase = getSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, stripe_customer_id, membership_tier')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile?.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 },
      );
    }

    const stripe = getStripe();
    let subscription;
    if (immediate) {
      subscription = await stripe.subscriptions.cancel(profile.stripe_subscription_id as string);
    } else {
      subscription = await stripe.subscriptions.update(profile.stripe_subscription_id as string, {
        cancel_at_period_end: true,
      });
    }

    //  cancel  webhook customer.subscription.deleted
    await supabase
      .from('profiles')
      .update({
        subscription_cancel_at_period_end: !immediate,
        // immediate webhook 
        ...(immediate ? { membership_tier: 'free' } : {}),
      })
      .eq('user_id', user.id);

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
