import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { COMPANION_SEAT_PACKAGES, getSeatStatus, packageById, type SeatClient } from '@/lib/companion-seats';
import {
  nowPaymentsCreateInvoice,
  nowPaymentsCreatePayment,
  NOWPAYMENTS_CURRENCIES,
} from '@/lib/nowpayments-server';

/**
 * GET  /api/v2/shop/seats — packages + current seat status
 * POST /api/v2/shop/seats — Stripe checkout for permanent seat packs
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const seats = await getSeatStatus(auth.client as unknown as SeatClient, auth.user.id);
    return NextResponse.json({
      packages: COMPANION_SEAT_PACKAGES,
      seats,
    });
  } catch (err: unknown) {
    logger.error('[shop/seats] GET error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to load seat packages' }, { status: 500 });
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

    const pack = packageById(packageId);
    if (!pack) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:5000';

    // ── NOWPayments Crypto Payment ─────────────────────────────────────────────
    const payCurrency = 'BTC';

    const invoice = await nowPaymentsCreateInvoice({
      price_amount: (pack.price_cents / 100).toString(),
      currency: 'USD',
      pay_currency: payCurrency,
      order_id: `np_${auth.user.id}_seats_${pack.id}_${Date.now()}`,
      description: `${pack.name} - +${pack.seats} companion seat(s)`,
      success_url: `${origin}/shop?checkout=success&seats=${pack.seats}`,
      cancel_url: `${origin}/shop?checkout=canceled`,
    });

    if (!invoice?.id) {
      throw new Error('Failed to create NOWPayments invoice');
    }

    await auth.client.from('crypto_payments').insert({
      user_id: auth.user.id,
      plan_id: pack.id,
      amount_usd: pack.price_cents / 100,
      currency: payCurrency,
      tx_hash: invoice.id,
      status: 'awaiting_payment',
    });

    return NextResponse.json({
      status: 'invoice_created',
      provider: 'nowpayments',
      invoice_id: invoice.id,
      pay_address: invoice.pay_address,
      pay_amount: invoice.pay_amount,
      amount_usd: pack.price_cents / 100,
      pay_currency: payCurrency,
      package: pack,
    });
  } catch (err: unknown) {
    logger.error('[shop/seats] POST error', { error: String(err) });
    const msg = err instanceof Error ? err.message : 'Failed to purchase seats';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
