import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import {
  nowPaymentsCreateInvoice,
  nowPaymentsCreatePayment,
  NOWPAYMENTS_CURRENCIES,
} from '@/lib/nowpayments-server';
import { createNexaPayPayment, NEXAPAY_PAYMENT_METHODS } from '@/lib/nexapay-server';

/** Built-in packages when token_packages table is empty / missing. */
const FALLBACK_PACKAGES = [
  { id: 'credits-500', name: 'Starter', token_count: 500, bonus_tokens: 0, price_cents: 499, sort_order: 1, is_active: true },
  { id: 'credits-1000', name: 'Popular', token_count: 1000, bonus_tokens: 100, price_cents: 999, sort_order: 2, is_active: true },
  { id: 'credits-2500', name: 'Best Value', token_count: 2500, bonus_tokens: 500, price_cents: 2499, sort_order: 3, is_active: true },
  { id: 'credits-5000', name: 'Mega', token_count: 5000, bonus_tokens: 1500, price_cents: 4999, sort_order: 4, is_active: true },
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

        // Also fetch credit products from admin shop (products table, category=credits)
    let creditProducts: Array<{ id: string; name: string; token_count: number; bonus_tokens: number; price_cents: number; sort_order: number; is_active: boolean }> = [];
    try {
      const sbAdmin = getSupabaseClient();
      const { data: cpRows } = await sbAdmin
        .from('products')
        .select('id, name, price_cents, virtual_meta, display_order, status')
        .eq('type', 'virtual')
        .eq('status', 'active')
        .filter('virtual_meta->>kind', 'eq', 'credits')
        .order('display_order', { ascending: true });
      if (cpRows?.length) {
        creditProducts = cpRows.map((r: Record<string, unknown>) => {
          const meta = (r.virtual_meta || {}) as Record<string, unknown>;
          return {
            id: String(r.id),
            name: String(r.name || 'Credit Pack'),
            token_count: Number(meta.token_amount || meta.credits || 1000),
            bonus_tokens: Number(meta.bonus_tokens || 0),
            price_cents: Number(r.price_cents || 0),
            sort_order: Number(r.display_order || 0),
            is_active: true,
          };
        });
      }
    } catch { /* non-critical */ }

    // Merge: credit products from admin shop take priority over token_packages
    const mergedPackages = creditProducts.length > 0 ? creditProducts : packages;

    return NextResponse.json({
      packages: mergedPackages,
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

    // Fallback: admin-shop credit packs live in the products table (product UUIDs),
    // not token_packages. Without this, purchasing them returns 404.
    if (!tokenPackage) {
      try {
        const sbAdmin = getSupabaseClient();
        const { data: prod } = await sbAdmin
          .from('products')
          .select('id, name, price_cents, virtual_meta, status')
          .eq('id', packageId)
          .maybeSingle();
        if (prod && prod.status === 'active') {
          const meta = (prod.virtual_meta || {}) as Record<string, unknown>;
          if (meta.kind === 'credits') {
            tokenPackage = {
              id: String(prod.id),
              name: String(prod.name || 'Credit Pack'),
              token_count: Number(meta.token_amount || meta.credits || 0),
              bonus_tokens: Number(meta.bonus_tokens || 0),
              price_cents: Number(prod.price_cents || 0),
              sort_order: 0,
              is_active: true,
            };
          }
        }
      } catch {
        // non-critical — fall through to 404 below
      }
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

    const provider = (body.provider as string | undefined) || 'stripe';
    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:5000';

    // ── NOWPayments (crypto) ────────────────────────────────────────────────
    if (provider === 'nowpayments') {
      const currency = (body.currency as string | undefined) || 'usdttrc20';
      if (!NOWPAYMENTS_CURRENCIES.some((c) => c.id === currency)) {
        return NextResponse.json({ error: 'Unsupported currency' }, { status: 400 });
      }
      // order_id encodes the grant amount: np_{userId}_tokens_{totalTokens}_{ts}
      const orderId = `np_${auth.user.id}_tokens_${totalTokens}_${Date.now()}`;
      const description = `${tokenPackage.name || 'Credit Pack'} - ${totalTokens} credits`;

      try {
        const invoice = await nowPaymentsCreateInvoice({
          price_amount: priceCents / 100,
          price_currency: 'usd',
          pay_currency: currency,
          order_id: orderId,
          order_description: description,
          ipn_callback_url: `${origin}/api/nowpayments/ipn`,
          success_url: `${origin}/shop?checkout=success&tokens=${totalTokens}&tab=tokens`,
          cancel_url: `${origin}/shop?checkout=canceled&tab=tokens`,
        });

        await auth.client.from('crypto_payments').insert({
          user_id: auth.user.id,
          plan_id: packageId,
          amount_usd: priceCents / 100,
          currency: currency.toUpperCase(),
          tx_hash: invoice.id,
          status: 'awaiting_payment',
        });

        return NextResponse.json({
          status: 'checkout_created',
          provider: 'nowpayments',
          url: invoice.invoice_url,
          package: tokenPackage,
          token_count: totalTokens,
        });
      } catch (invoiceErr) {
        // Hosted invoice unavailable → fall back to a direct payment (wallet address)
        logger.warn('[shop/tokens] NOWPayments invoice failed, using direct payment', { err: String(invoiceErr) });
        const payment = await nowPaymentsCreatePayment({
          price_amount: priceCents / 100,
          price_currency: 'usd',
          pay_currency: currency,
          order_id: orderId,
          order_description: description,
          ipn_callback_url: `${origin}/api/nowpayments/ipn`,
        });

        await auth.client.from('crypto_payments').insert({
          user_id: auth.user.id,
          plan_id: packageId,
          amount_usd: priceCents / 100,
          currency: currency.toUpperCase(),
          wallet_address: payment.pay_address,
          tx_hash: payment.payment_id,
          status: 'awaiting_payment',
        });

        return NextResponse.json({
          status: 'checkout_created',
          provider: 'nowpayments',
          type: 'payment',
          url: null,
          payAddress: payment.pay_address,
          payAmount: payment.pay_amount,
          payCurrency: payment.pay_currency,
          network: payment.network,
          package: tokenPackage,
          token_count: totalTokens,
        });
      }
    }

    // ── NexaPay (credit card / LATAM) ───────────────────────────────────────
    if (provider === 'nexapay') {
      const paymentMethod = (body.payment_method as string | undefined) || 'card_latam';
      if (!NEXAPAY_PAYMENT_METHODS.some((m) => m.id === paymentMethod)) {
        return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 });
      }
      // order_id encodes the grant amount: nxp_{userId}_tokens_{totalTokens}_{ts}
      const orderId = `nxp_${auth.user.id}_tokens_${totalTokens}_${Date.now()}`;

      const payment = await createNexaPayPayment({
        amount_cents: priceCents,
        currency: 'USD',
        payment_method: paymentMethod as never,
        order_id: orderId,
        description: `${tokenPackage.name || 'Credit Pack'} - ${totalTokens} credits`,
        customer_email: auth.user.email || '',
        success_url: `${origin}/shop?checkout=success&tokens=${totalTokens}&tab=tokens`,
        cancel_url: `${origin}/shop?checkout=canceled&tab=tokens`,
        webhook_url: `${origin}/api/nexapay/webhook`,
      });

      await auth.client.from('crypto_payments').insert({
        user_id: auth.user.id,
        plan_id: packageId,
        amount_usd: priceCents / 100,
        currency: 'BRL',
        tx_hash: payment.payment_id,
        status: 'awaiting_payment',
      });

      return NextResponse.json({
        status: 'checkout_created',
        provider: 'nexapay',
        url: payment.payment_url,
        amountBrl: payment.amount_brl,
        package: tokenPackage,
        token_count: totalTokens,
      });
    }

    // ── Stripe (default / fallback) ─────────────────────────────────────────
    // Prefer env-mapped Stripe Price IDs when present; else dynamic price_data.
    const envPriceMap: Record<string, string> = {
      'tokens-100': process.env.STRIPE_TOKENS_100_PRICE_ID || '',
      'tokens-500': process.env.STRIPE_TOKENS_500_PRICE_ID || '',
      'tokens-1000': process.env.STRIPE_TOKENS_1000_PRICE_ID || '',
    };
    const configuredPriceId = envPriceMap[packageId] || '';

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
