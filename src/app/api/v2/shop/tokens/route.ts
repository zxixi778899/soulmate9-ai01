import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe-server';
import { logger } from '@/lib/logger';

/** Built-in packages when token_packages table is empty / missing. */
const FALLBACK_PACKAGES = [
  { id: 'tokens-100', name: 'Starter', token_count: 100, bonus_tokens: 0, price_cents: 499, sort_order: 1, is_active: true },
  { id: 'tokens-500', name: 'Popular', token_count: 500, bonus_tokens: 50, price_cents: 1999, sort_order: 2, is_active: true },
  { id: 'tokens-1000', name: 'Best Value', token_count: 1000, bonus_tokens: 200, price_cents: 3499, sort_order: 3, is_active: true },
];

/**
 * GET /api/v2/shop/tokens — list packages + balance
 * POST /api/v2/shop/tokens — create Stripe Checkout for a package
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = auth.client;
    let packages = FALLBACK_PACKAGES;

    const { data, error } = await supabase
      .from('token_packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && data?.length) {
      packages = data as typeof FALLBACK_PACKAGES;
    }

    const { data: userTokens } = await supabase
      .from('user_tokens')
      .select('balance_tokens')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    // Also surface credits_remaining as a secondary balance signal
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits_remaining')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    return NextResponse.json({
      packages,
      user_balance: userTokens?.balance_tokens ?? profile?.credits_remaining ?? 0,
    });
  } catch (err: unknown) {
    logger.error('[shop/tokens] GET error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to fetch token packages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const packageId = body.package_id as string | undefined;
    if (!packageId) {
      return NextResponse.json({ error: 'Missing package_id' }, { status: 400 });
    }

    let tokenPackage =
      FALLBACK_PACKAGES.find((p) => p.id === packageId) || null;

    const { data: dbPkg } = await auth.client
      .from('token_packages')
      .select('*')
      .eq('id', packageId)
      .maybeSingle();

    if (dbPkg) {
      tokenPackage = dbPkg as typeof FALLBACK_PACKAGES[number];
    }

    if (!tokenPackage) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const totalTokens =
      Number(tokenPackage.token_count || 0) + Number((tokenPackage as { bonus_tokens?: number }).bonus_tokens || 0);
    const priceCents = Number(tokenPackage.price_cents || 0);
    if (priceCents <= 0 || totalTokens <= 0) {
      return NextResponse.json({ error: 'Invalid package pricing' }, { status: 400 });
    }

    // Prefer env-mapped Stripe Price IDs when present; else dynamic price_data.
    const envPriceMap: Record<string, string> = {
      'tokens-100': process.env.STRIPE_TOKENS_100_PRICE_ID || '',
      'tokens-500': process.env.STRIPE_TOKENS_500_PRICE_ID || '',
      'tokens-1000': process.env.STRIPE_TOKENS_1000_PRICE_ID || '',
    };
    const configuredPriceId = envPriceMap[packageId] || '';

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:5000';

    const stripe = getStripe();
    const lineItems = configuredPriceId
      ? [{ price: configuredPriceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: 'usd',
              unit_amount: priceCents,
              product_data: {
                name: `${tokenPackage.name || 'Token Pack'} - ${totalTokens} tokens`,
                description: `${totalTokens} SoulMate tokens`,
                tax_code: 'txcd_10000000',
              },
              tax_behavior: 'exclusive',
            },
            quantity: 1,
          },
        ];

    // Listed token prices are tax-exclusive; customer pays tax via Stripe Tax.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems as never,
      customer_email: auth.user.email || undefined,
      client_reference_id: auth.user.id,
      metadata: {
        type: 'tokens',
        user_id: auth.user.id,
        package_id: packageId,
        token_count: String(totalTokens),
        price_cents: String(priceCents),
      },
      success_url: `${origin}/shop?checkout=success&tokens=${totalTokens}`,
      cancel_url: `${origin}/shop?checkout=canceled`,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
    });

    return NextResponse.json({
      status: 'checkout_created',
      url: session.url,
      package: tokenPackage,
      token_count: totalTokens,
    });
  } catch (err: unknown) {
    logger.error('[shop/tokens] POST error', { error: String(err) });
    const msg = err instanceof Error ? err.message : 'Failed to purchase tokens';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
