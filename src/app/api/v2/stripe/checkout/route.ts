import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { getStripeCheckoutGate, stripeGateMessage } from '@/lib/payment-compliance';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';

const CHECKOUT_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };
type CheckoutBody = {
  type?: 'subscription' | 'tokens';
  package_id?: string;
};

/**
 * Legacy v2 checkout endpoint. It remains for compatibility, but all prices,
 * identity metadata and entitlements are now resolved on the server.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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

    const limit = await checkRateLimitAsync(`stripe-checkout:${user.id}`, CHECKOUT_LIMIT);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limit, CHECKOUT_LIMIT) },
      );
    }

    const body = (await req.json().catch(() => ({}))) as CheckoutBody;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const stripe = getStripe();

    if (body.type === 'subscription') {
      const subscriptionPrices: Record<string, string> = {
        pro: process.env.STRIPE_PRO_PRICE_ID || '',
        unlimited: process.env.STRIPE_UNLIMITED_PRICE_ID || '',
      };
      const priceId = body.package_id ? subscriptionPrices[body.package_id] : '';
      if (!priceId) {
        return NextResponse.json({ error: 'Invalid subscription package' }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/pricing?checkout=canceled`,
        client_reference_id: user.id,
        customer_email: user.email || undefined,
        metadata: { type: 'subscription', user_id: user.id, plan: body.package_id || '' },
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
      });
      return NextResponse.json({ url: session.url });
    }

    if (body.type === 'tokens') {
      const tokenPackages: Record<string, { priceId: string; tokenCount: number }> = {
        'tokens-100': { priceId: process.env.STRIPE_TOKENS_100_PRICE_ID || '', tokenCount: 100 },
        'tokens-500': { priceId: process.env.STRIPE_TOKENS_500_PRICE_ID || '', tokenCount: 500 },
        'tokens-1000': { priceId: process.env.STRIPE_TOKENS_1000_PRICE_ID || '', tokenCount: 1000 },
      };
      const selected = body.package_id ? tokenPackages[body.package_id] : undefined;
      if (!selected?.priceId) {
        return NextResponse.json({ error: 'Invalid token package' }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: selected.priceId, quantity: 1 }],
        success_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/shop?checkout=canceled`,
        client_reference_id: user.id,
        customer_email: user.email || undefined,
        metadata: {
          type: 'tokens',
          user_id: user.id,
          package_id: body.package_id || '',
          token_count: String(selected.tokenCount),
        },
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
      });
      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json(
      { error: 'Invalid checkout type. Use "subscription" or "tokens".' },
      { status: 400 },
    );
  } catch (err: unknown) {
    logger.error('[stripe/checkout-v2] checkout failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { tags: { route: 'stripe-checkout-v2' } });
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
