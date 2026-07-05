import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 *  Stripe Billing Portal session URL
 *  checkoutprofile.stripe_customer_id 
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();
  if (error || !profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer. Please subscribe first.' },
      { status: 400 },
    );
  }

  const stripe = new Stripe(stripeKey);
  const origin =
    req.headers.get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    `http://localhost:${process.env.DEPLOY_RUN_PORT ?? 5000}`;

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/profile`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    logger.error('stripe portal create failed', { err: String(e) });
    return NextResponse.json({ error: 'Failed to open portal' }, { status: 500 });
  }
}
