/**
 * Embedded Crypto Payment - Direct Address + QR Code
 * POST /api/crypto/embed-payment
 *
 * Creates a NOWPayments payment and returns direct payment details
 * instead of redirecting to invoice page.
 *
 * Response format:
 * {
 *   success: true,
 *   paymentId: string,
 *   payAddress: string,
 *   payAmount: number,
 *   payCurrency: string,
 *   network: string,
 *   amountUsd: number,
 *   orderId: string,
 *   qrCodeUrl: string, // Base64 or URL-encoded address for QR display
 *   status: 'awaiting_payment',
 *   expiresAt: timestamp
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import {
  nowPaymentsCreatePayment,
  getMinimumAmount,
  NOWPAYMENTS_CURRENCIES,
} from '@/lib/nowpayments-server';

interface EmbedPaymentBody {
  package_id: string;
  payment_method: string;
  is_membership_upgrade?: boolean;
}

/**
 * Generate QR code URL from payment address (using api.qrserver.com)
 */
function generateQRCodeURL(text: string): string {
  return encodeURIComponent(text);
}

export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: EmbedPaymentBody;
  try {
    body = (await request.json()) as EmbedPaymentBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { package_id, payment_method, is_membership_upgrade = false } = body;

  if (!package_id || !payment_method) {
    return NextResponse.json(
      { error: 'Missing package_id or payment_method' },
      { status: 400 }
    );
  }

  // Get package info
  let tokenPackage: {
    id: string;
    name: string;
    token_count: number;
    bonus_tokens?: number;
    price_cents: number;
    sort_order?: number;
    is_active?: boolean;
    video_url?: string;
    image_url?: string;
  } | null = null;

  // Check if it's a membership product
  if (is_membership_upgrade) {
    try {
      const sbAdmin = getSupabaseClient();
      const { data: memberProduct } = await sbAdmin
        .from('products')
        .select('id, name, price_cents, virtual_meta, status, collection')
        .eq('id', package_id)
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
    } catch {
      // Fall through to 404 below
    }
  }

  // Check token_packages table first
  if (!tokenPackage) {
    const { data: dbPkg } = await client
      .from('token_packages')
      .select('*')
      .eq('id', package_id)
      .maybeSingle();

    if (dbPkg) {
      tokenPackage = dbPkg as typeof tokenPackage;
    } else {
      // Fallback: admin-shop credit packs
      try {
        const sbAdmin = getSupabaseClient();
        const { data: prod } = await sbAdmin
          .from('products')
          .select('id, name, price_cents, virtual_meta, status')
          .eq('id', package_id)
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
        // non-critical
      }
    }
  }

  if (!tokenPackage) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const totalTokens = is_membership_upgrade
    ? 0
    : Number(tokenPackage.token_count || 0) + Number((tokenPackage as { bonus_tokens?: number }).bonus_tokens || 0);

  const priceCents = Number(tokenPackage.price_cents || 0);

  if (priceCents <= 0) {
    return NextResponse.json({ error: 'Invalid package pricing' }, { status: 400 });
  }

  const origin =
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:5000';

  // Validate currency
  const preferredCurrency = payment_method.toLowerCase();
  const currencyMap: Record<string, string> = {};
  NOWPAYMENTS_CURRENCIES.forEach(c => {
    currencyMap[c.id.toLowerCase()] = c.id.toUpperCase();
  });

  const validatedCurrency = currencyMap[preferredCurrency] || 'BTC';

  const description = is_membership_upgrade
    ? `${(tokenPackage as any).name} Membership Upgrade`
    : `${tokenPackage.name || 'Credit Pack'} - ${totalTokens} tokens`;

  const orderID = `ep_${user.id}_${package_id}_${Date.now()}`;

  try {
    // Check minimum amount for selected currency using hardcoded defaults
    const minAmount = getMinimumAmount(validatedCurrency);
    
    // Add 20% safety buffer to account for exchange rate fluctuations and rounding
    const requiredMinWithBuffer = minAmount * 1.2;
    
    logger.info('[embed-payment] Min amount check', {
      packagePrice: priceCents / 100,
      baseRequiredMin: minAmount,
      requiredMinWithBuffer: requiredMinWithBuffer,
      currency: validatedCurrency,
    });
    
    // If price is below minimum, upgrade to next tier
    let actualPriceCents = priceCents;
    if (priceCents / 100 < requiredMinWithBuffer) {
      // Find next higher price tier from packages
      interface PackageInfo {
        id: string;
        name: string;
        price_cents: number;
        virtual_meta?: Record<string, unknown>;
      }
      
      const availablePackages: PackageInfo[] = [];
      
      // Try to get all credit packages to find next tier
      try {
        const sbAdmin = getSupabaseClient();
        const { data } = await sbAdmin
          .from('products')
          .select('id, name, price_cents, virtual_meta, status')
          .eq('status', 'active')
          .filter('virtual_meta->>kind', 'eq', 'credits');
        
        if (data?.length) {
          availablePackages.push(...data as PackageInfo[]);
        }
      } catch { /* non-critical */ }
      
      // Also try token_packages table
      try {
        const { data: tokenPaks } = await client
          .from('token_packages')
          .select('*')
          .eq('is_active', true);
        
        if (tokenPaks?.length) {
          const typedPackages = tokenPaks as PackageInfo[];
          typedPackages.forEach((p) => {
            if (!availablePackages.find(ap => ap.id === p.id)) {
              availablePackages.push(p);
            }
          });
        }
      } catch { /* non-critical */ }
      
      // Sort by price and find next tier
      availablePackages.sort((a, b) => a.price_cents - b.price_cents);
      
      const nextPackage = availablePackages.find(
        pkg => pkg.price_cents > priceCents && pkg.price_cents / 100 >= minAmount
      );
      
      if (nextPackage) {
        logger.warn('[embed-payment] Price below minimum, upgrading to:', {
          original: priceCents / 100,
          upgradedTo: nextPackage.price_cents / 100,
          reason: `Minimum $${requiredMinWithBuffer.toFixed(2)} ${validatedCurrency} required`
        });
        
        return NextResponse.json({
          success: false,
          error: 'Amount too low',
          message: `Minimum payment of $${requiredMinWithBuffer.toFixed(2)} required for ${validatedCurrency}`,
          currentPrice: priceCents / 100,
          recommendedPackage: {
            id: nextPackage.id,
            name: nextPackage.name,
            price: nextPackage.price_cents / 100,
          },
          // Calculate what package price would give us exactly the buffer requirement
          priceBuffer: {
            minAmount,
            withBuffer: requiredMinWithBuffer,
            priceForExactMatch: Math.ceil(requiredMinWithBuffer * 100),
          }
        }, { status: 400 });
      } else {
        throw new Error(`No suitable package found above minimum $${requiredMinWithBuffer.toFixed(2)} requirement`);
      }
    }

    // Create direct payment (not invoice page)
    const payment = await nowPaymentsCreatePayment({
      price_amount: actualPriceCents / 100,
      price_currency: 'USD',
      pay_currency: validatedCurrency,
      order_id: orderID,
      order_description: description,
      ipn_callback_url: `${origin}/api/crypto/ipn/handler`,
      success_url: `${origin}/shop?checkout=success&tab=tokens`,
      cancel_url: `${origin}/shop?checkout=canceled&tab=tokens`,
    });

    if (!payment?.payment_id) {
      throw new Error('Failed to create payment');
    }

    // Determine network
    const networkInfo = NOWPAYMENTS_CURRENCIES.find(c => c.id.toLowerCase() === preferredCurrency.toLowerCase());
    const network = networkInfo?.network || 'Unknown';

    // Store payment record
    await client.from('crypto_payments').insert({
      user_id: user.id,
      plan_id: package_id,
      amount_usd: priceCents / 100,
      currency: validatedCurrency.toLowerCase(),
      tx_hash: payment.payment_id, // Using payment_id as reference
      status: 'awaiting_payment',
    });

    return NextResponse.json({
      success: true,
      provider: 'nowpayments',
      paymentId: payment.payment_id,
      payAddress: payment.pay_address,
      payAmount: payment.pay_amount,
      payCurrency: validatedCurrency,
      network: network,
      amountUsd: priceCents / 100,
      orderId: payment.order_id,
      qrCodeURL: generateQRCodeURL(payment.pay_address),
      status: 'awaiting_payment',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
      package: tokenPackage,
      tokenCount: totalTokens,
      isMembershipUpgrade: is_membership_upgrade,
    });
  } catch (err: unknown) {
    logger.error('[embed-payment] Error creating payment', { error: String(err) });
    const msg = err instanceof Error ? err.message : 'Failed to create payment';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
