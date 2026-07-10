import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';

/**
 * POST /api/stripe/checkout
 * Body: { plan: 'pro' | 'unlimited' | 'pro_yearly' | 'unlimited_yearly', billing?: 'monthly' | 'yearly' }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      plan?: string;
      billing?: 'monthly' | 'yearly';
    };

    let plan = body.plan || 'pro';
    let billing: 'monthly' | 'yearly' = body.billing || 'monthly';

    // Accept plan_yearly shorthand
    if (plan.endsWith('_yearly')) {
      billing = 'yearly';
      plan = plan.replace(/_yearly$/, '');
    }

    if (!['pro', 'unlimited'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const priceMap: Record<string, string> = {
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID || '',
      unlimited:
        process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID ||
        process.env.STRIPE_UNLIMITED_PRICE_ID ||
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

    const priceKey = billing === 'yearly' ? `${plan}_yearly` : plan;
    let priceId = priceMap[priceKey] || '';

    // Fallback: if yearly price missing, use monthly (Stripe still works; discount not applied server-side)
    if (!priceId && billing === 'yearly') {
      priceId = priceMap[plan] || '';
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';
    const stripe = getStripe();

    // Dynamic price_data when Price IDs are not configured (dev / bootstrap)
    const fallbackAmounts: Record<string, number> = {
      pro: billing === 'yearly' ? 19900 : 1999,
      unlimited: billing === 'yearly' ? 39900 : 3999,
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'usd',
                unit_amount: fallbackAmounts[plan],
                recurring: { interval: billing === 'yearly' ? 'year' : 'month' },
                product_data: {
                  name: `SoulMate ${plan === 'pro' ? 'Pro' : 'Unlimited'} (${billing})`,
                },
              },
              quantity: 1,
            },
          ],
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      metadata: {
        type: 'subscription',
        user_id: user.id,
        plan: billing === 'yearly' ? `${plan}_yearly` : plan,
        billing,
      },
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
