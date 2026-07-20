import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';
import { getStripeCheckoutGate, stripeGateMessage } from '@/lib/payment-compliance';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

const CHECKOUT_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };

/**
 * POST /api/stripe/checkout
 * Body: { plan: 'basic' | 'pro' | 'unlimited' | 'basic_yearly' | ..., billing?: 'monthly' | 'quarterly' | 'yearly' }
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

    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await checkRateLimitAsync(`stripe-checkout:${user.id}`, CHECKOUT_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limit, CHECKOUT_LIMIT) },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      plan?: string;
      billing?: 'monthly' | 'quarterly' | 'yearly';
    };

    let plan = body.plan || 'pro';
    let billing: 'monthly' | 'quarterly' | 'yearly' = body.billing || 'monthly';

    // Accept plan_yearly shorthand
    if (plan.endsWith('_yearly')) {
      billing = 'yearly';
      plan = plan.replace(/_yearly$/, '');
    }

    if (!['basic', 'pro', 'unlimited'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const priceMap: Record<string, string> = {
      basic: process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID || process.env.STRIPE_BASIC_PRICE_ID || '',
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID || '',
      unlimited:
        process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID ||
        process.env.STRIPE_UNLIMITED_PRICE_ID ||
        '',
      basic_quarterly:
        process.env.NEXT_PUBLIC_STRIPE_BASIC_QUARTERLY_PRICE_ID ||
        process.env.STRIPE_BASIC_QUARTERLY_PRICE_ID ||
        '',
      pro_quarterly:
        process.env.NEXT_PUBLIC_STRIPE_PRO_QUARTERLY_PRICE_ID ||
        process.env.STRIPE_PRO_QUARTERLY_PRICE_ID ||
        '',
      unlimited_quarterly:
        process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_QUARTERLY_PRICE_ID ||
        process.env.STRIPE_UNLIMITED_QUARTERLY_PRICE_ID ||
        '',
      basic_yearly:
        process.env.NEXT_PUBLIC_STRIPE_BASIC_YEARLY_PRICE_ID ||
        process.env.STRIPE_BASIC_YEARLY_PRICE_ID ||
        '',
      pro_yearly:
        process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID ||
        process.env.STRIPE_PRO_YEARLY_PRICE_ID ||
        '',
      unlimited_yearly:
        process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_YEARLY_PRICE_ID ||
        process.env.STRIPE_UNLIMITED_YEARLY_PRICE_ID ||
        '',
    };

    const priceKey = billing === 'yearly' ? `${plan}_yearly` : billing === 'quarterly' ? `${plan}_quarterly` : plan;
    const priceId = priceMap[priceKey] || '';

    if (!priceId && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: `Stripe price is not configured for ${priceKey}` },
        { status: 503 },
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const stripe = getStripe();

    // Dynamic price_data when Price IDs are not configured (dev / bootstrap)
    const fallbackAmounts: Record<string, Record<string, number>> = {
      basic: { monthly: 999, quarterly: 2547, yearly: 8392 },
      pro: { monthly: 1999, quarterly: 5097, yearly: 16792 },
      unlimited: { monthly: 2999, quarterly: 7647, yearly: 25192 },
    };

    // Listed prices are tax-exclusive; Stripe Tax adds tax at checkout (customer pays).
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'usd',
                unit_amount: fallbackAmounts[plan][billing],
                recurring: billing === 'yearly'
                  ? { interval: 'year' }
                  : billing === 'quarterly'
                    ? { interval: 'month', interval_count: 3 }
                    : { interval: 'month' },
                product_data: {
                  name: `SoulMate ${plan === 'basic' ? 'Basic' : plan === 'pro' ? 'Pro' : 'Unlimited'} (${billing})`,
                  tax_code: 'txcd_10000000', // General - Electronically Supplied Services
                },
                tax_behavior: 'exclusive',
              },
              quantity: 1,
            },
          ],
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      metadata: {
        type: 'subscription',
        user_id: user.id,
        plan: billing === 'yearly' ? `${plan}_yearly` : billing === 'quarterly' ? `${plan}_quarterly` : plan,
        billing,
      },
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      // Collect billing address so Stripe Tax can calculate jurisdiction correctly.
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
