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
    const isMembershipUpgrade = (body.is_membership_upgrade as boolean) || false;
    
    if (!packageId) {
      return NextResponse.json({ error: 'Missing package_id' }, { status: 400 });
    }

    let tokenPackage: {
      id: string;
      name: string;
      token_count: number;
      bonus_tokens?: number;
      price_cents: number;
      sort_order?: number;
      is_active?: boolean;
    } | null = null;

    // Check if it's a membership product from products table
    if (isMembershipUpgrade) {
      const sbAdmin = getSupabaseClient();
      const { data: memberProduct } = await sbAdmin
        .from('products')
        .select('id, name, price_cents, virtual_meta, status, collection')
        .eq('id', packageId)
        .maybeSingle();

      if (memberProduct && memberProduct.status === 'active' && memberProduct.collection === 'membership') {
        const meta = (memberProduct.virtual_meta || {}) as Record<string, unknown>;
        tokenPackage = {
          id: String(memberProduct.id),
          name: String(meta.membership_tier || 'Membership'),
          token_count: 0,
          price_cents: Number(memberProduct.price_cents || 0),
          sort_order: 0,
          is_active: true,
        };
      }
    } else {
      // Check token_packages table first
      const { data: dbPkg } = await auth.client
        .from('token_packages')
        .select('*')
        .eq('id', packageId)
        .maybeSingle();

      if (dbPkg) {
        tokenPackage = dbPkg as typeof FALLBACK_PACKAGES[number];
      }

      // Fallback: admin-shop credit packs live in the products table
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
    }

    if (!tokenPackage) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const totalTokens = isMembershipUpgrade 
      ? 0 
      : Number(tokenPackage.token_count || 0) + Number((tokenPackage as { bonus_tokens?: number }).bonus_tokens || 0);
    
    const priceCents = Number(tokenPackage.price_cents || 0);
    
    if (priceCents <= 0) {
      return NextResponse.json({ error: 'Invalid package pricing' }, { status: 400 });
    }

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:5000';

    // ── NOWPayments Crypto Payment ─────────────────────────────────────────────
    const preferredCurrency = (body.payment_method as string | undefined) || 'BTC';
    
    const currency = Object.keys(NOWPAYMENTS_CURRENCIES).includes(preferredCurrency.toUpperCase())
      ? preferredCurrency.toUpperCase()
      : 'BTC';

    const description = isMembershipUpgrade
      ? `${(tokenPackage as any).name} Membership Upgrade`
      : `${tokenPackage.name || 'Credit Pack'} - ${totalTokens} tokens`;

    const successTab = isMembershipUpgrade ? 'membership' : 'tokens';

    // Create NOWPayments invoice for fixed amount payment
    let invoice: { id: string; invoice_url: string; order_id: string } | null = null;
    let attemptedCurrency = currency;
    
    // Try preferred currency, fall back to BTC if unavailable
    try {
      invoice = await nowPaymentsCreateInvoice({
        price_amount: priceCents / 100,
        price_currency: 'USD',
        pay_currency: currency,
        order_id: `np_${auth.user.id}_${packageId}_${Date.now()}`,
        order_description: description,
        success_url: `${origin}/shop?checkout=success&tab=${successTab}`,
        cancel_url: `${origin}/shop?checkout=canceled&tab=${successTab}`,
      });
    } catch (err) {
      const errStr = JSON.stringify(err);
      // If currency is unavailable, try Bitcoin as fallback
      if (errStr.includes('unavailable') || errStr.includes('INVALID_REQUEST_PARAMS')) {
        logger.warn('[shop/tokens] Currency unavailable, falling back to BTC', { 
          attempted: currency, 
          error: errStr 
        });
        attemptedCurrency = 'BTC';
        
        invoice = await nowPaymentsCreateInvoice({
          price_amount: priceCents / 100,
          price_currency: 'USD',
          pay_currency: attemptedCurrency,
          order_id: `np_${auth.user.id}_${packageId}_${Date.now()}`,
          order_description: description,
          success_url: `${origin}/shop?checkout=success&tab=${successTab}`,
          cancel_url: `${origin}/shop?checkout=canceled&tab=${successTab}`,
        });
        
        return NextResponse.json({
          status: 'invoice_created',
          provider: 'nowpayments',
          invoice_id: invoice.id,
          invoice_url: invoice.invoice_url,
          order_id: invoice.order_id,
          amount_usd: priceCents / 100,
          pay_currency: attemptedCurrency,
          message: `Preferred currency ${currency} is unavailable, switched to Bitcoin`,
          package: tokenPackage,
          token_count: totalTokens,
          is_membership_upgrade: isMembershipUpgrade,
        });
      } else {
        throw err;
      }
    }

    if (!invoice?.id) {
      throw new Error('Failed to create NOWPayments invoice');
    }

    await auth.client.from('crypto_payments').insert({
      user_id: auth.user.id,
      plan_id: packageId,
      amount_usd: priceCents / 100,
      currency: attemptedCurrency,
      tx_hash: invoice.id,
      status: 'awaiting_payment',
    });

    return NextResponse.json({
      status: 'invoice_created',
      provider: 'nowpayments',
      invoice_id: invoice.id,
      invoice_url: invoice.invoice_url,
      order_id: invoice.order_id,
      amount_usd: priceCents / 100,
      pay_currency: attemptedCurrency,
      package: tokenPackage,
      token_count: totalTokens,
      is_membership_upgrade: isMembershipUpgrade,
    });
  } catch (err: unknown) {
    logger.error('[shop/tokens] POST error', { error: String(err) });
    const msg = err instanceof Error ? err.message : 'Failed to purchase tokens';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
