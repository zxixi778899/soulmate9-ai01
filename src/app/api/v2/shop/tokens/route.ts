import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import {
  nowPaymentsCreateInvoice,
  nowPaymentsCreatePayment,
  NOWPAYMENTS_CURRENCIES,
} from '@/lib/nowpayments-server';

/** Built-in packages when token_packages table is empty / missing.
 *  Base rate: 1000 credits = $9.99 (synced with credit-system.ts TOKEN_PACKAGES). */
const FALLBACK_PACKAGES = [
  { id: 'credits-500', name: 'Starter', token_count: 500, bonus_tokens: 0, price_cents: 599, sort_order: 1, is_active: true },
  { id: 'credits-1000', name: 'Popular', token_count: 1000, bonus_tokens: 0, price_cents: 999, sort_order: 2, is_active: true },
  { id: 'credits-2500', name: 'Best Value', token_count: 2500, bonus_tokens: 0, price_cents: 2299, sort_order: 3, is_active: true },
  { id: 'credits-5000', name: 'Power User', token_count: 5000, bonus_tokens: 0, price_cents: 3999, sort_order: 4, is_active: true },
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

    // Canonical balance lives on profiles.credits_remaining (single source of truth).
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits_remaining')
      .eq('user_id', auth.user.id)
      .maybeSingle();

        // Also fetch credit products from admin shop (products table, category=credits)
    let creditProducts: Array<{ id: string; name: string; token_count: number; bonus_tokens: number; price_cents: number; sort_order: number; is_active: boolean; video_url: string; image_url: string }> = [];
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
            video_url: String(meta.video_url || ''),
            image_url: String(meta.image_url || ''),
          };
        });
      }
    } catch { /* non-critical */ }

    // Merge: credit products from admin shop take priority over token_packages
    const mergedPackages = creditProducts.length > 0 ? creditProducts : packages;

    return NextResponse.json({
      packages: mergedPackages,
      user_balance: profile?.credits_remaining ?? 0,
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

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:5000';

    // ── NOWPayments Crypto Payment ─────────────────────────────────────────────
    const paymentMethod = (body.payment_method as string | undefined) || 'BTC';
    
    const currency = Object.keys(NOWPAYMENTS_CURRENCIES).includes(paymentMethod.toUpperCase())
      ? paymentMethod.toUpperCase()
      : 'BTC';

    // Create NOWPayments invoice for fixed amount payment
    const invoice = await nowPaymentsCreateInvoice({
      amount: (priceCents / 100).toString(),
      currency: 'USD',
      pay_currency: currency,
      order_id: `np_${auth.user.id}_${packageId}_${Date.now()}`,
      description: `${tokenPackage.name || 'Credit Pack'} - ${totalTokens} tokens`,
      success_url: `${origin}/shop?checkout=success&tokens=${totalTokens}&tab=tokens`,
      cancel_url: `${origin}/shop?checkout=canceled&tab=tokens`,
    });

    if (!invoice?.id) {
      throw new Error('Failed to create NOWPayments invoice');
    }

    await auth.client.from('crypto_payments').insert({
      user_id: auth.user.id,
      plan_id: packageId,
      amount_usd: priceCents / 100,
      currency: currency,
      tx_hash: invoice.id,
      status: 'awaiting_payment',
    });

    return NextResponse.json({
      status: 'invoice_created',
      provider: 'nowpayments',
      invoice_id: invoice.id,
      pay_address: invoice.pay_address,
      pay_amount: invoice.pay_amount,
      amount_usd: priceCents / 100,
      pay_currency: currency,
      package: tokenPackage,
      token_count: totalTokens,
    });
  } catch (err: unknown) {
    logger.error('[shop/tokens] POST error', { error: String(err) });
    const msg = err instanceof Error ? err.message : 'Failed to purchase tokens';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
