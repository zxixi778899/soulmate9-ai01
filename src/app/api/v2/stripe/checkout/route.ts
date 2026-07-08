import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * POST /api/v2/stripe/checkout
 * Creates a Stripe Checkout Session for token purchases or subscriptions.
 */
export async function POST(req: NextRequest) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.startsWith('placeholder') || stripeKey.startsWith('sk_test_placeholder')) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local' },
        { status: 500 },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-06-16.basil' });
    const body = await req.json().catch(() => ({}));
    const { type, package_id, price_id } = body;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000';

    if (type === 'subscription') {
      if (!price_id) {
        return NextResponse.json({ error: 'Missing price_id' }, { status: 400 });
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: price_id, quantity: 1 }],
        success_url: `${appUrl}/profile?checkout=success`,
        cancel_url: `${appUrl}/pricing?checkout=canceled`,
        metadata: { type: 'subscription' },
      });
      return NextResponse.json({ url: session.url });
    }

    if (type === 'tokens') {
      if (!package_id) {
        return NextResponse.json({ error: 'Missing package_id' }, { status: 400 });
      }
      // Map package_id to Stripe price
      const tokenPrices: Record<string, string> = {
        'tokens-100': process.env.STRIPE_TOKENS_100_PRICE_ID || '',
        'tokens-500': process.env.STRIPE_TOKENS_500_PRICE_ID || '',
        'tokens-1000': process.env.STRIPE_TOKENS_1000_PRICE_ID || '',
      };

      const priceId = tokenPrices[package_id];
      if (!priceId) {
        return NextResponse.json({ error: 'Invalid token package' }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/shop?checkout=success`,
        cancel_url: `${appUrl}/shop?checkout=canceled`,
        metadata: { type: 'tokens', package: package_id },
      });
      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: 'Invalid checkout type. Use "subscription" or "tokens".' }, { status: 400 });
  } catch (err: any) {
    console.error('[stripe/checkout] error:', err);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}