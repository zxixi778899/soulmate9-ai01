import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import {
  nowPaymentsCreatePayment,
  nowPaymentsCreateInvoice,
  nowPaymentsEstimatePrice,
  NOWPAYMENTS_CURRENCIES,
  getNowPaymentsPriceCents,
} from '@/lib/nowpayments-server';
import { logger } from '@/lib/logger';

/**
 * POST /api/nowpayments
 * Create a NOWPayments crypto payment
 * Body: { plan: 'basic'|'pro'|'unlimited', billing: 'monthly'|'quarterly'|'yearly', currency: 'usdttrc20'|'btc'|... }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, client, error: authError } = await getAuthUser(req);
    if (!user || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { plan, billing = 'monthly', currency = 'usdttrc20' } = body;

    if (!['basic', 'pro', 'unlimited'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const validCurrencies = NOWPAYMENTS_CURRENCIES.map((c) => c.id);
    if (!validCurrencies.includes(currency)) {
      return NextResponse.json({ error: 'Unsupported currency' }, { status: 400 });
    }

    const amountCents = getNowPaymentsPriceCents(plan, billing);
    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const orderId = `np_${user.id}_${plan}_${billing}_${Date.now()}`;

    // Try hosted invoice first (better UX — redirect to NOWPayments checkout page)
    try {
      const invoice = await nowPaymentsCreateInvoice({
        price_amount: amountCents / 100,
        price_currency: 'usd',
        pay_currency: currency,
        order_id: orderId,
        order_description: `SoulMate AI ${plan} (${billing})`,
        ipn_callback_url: `${origin}/api/nowpayments/ipn`,
        success_url: `${origin}/payment/success?order_id=${orderId}`,
        cancel_url: `${origin}/pricing?canceled=true`,
      });

      // Record payment in database
      await client.from('crypto_payments').insert({
        user_id: user.id,
        plan_id: plan,
        amount_usd: amountCents / 100,
        currency: currency.toUpperCase(),
        tx_hash: invoice.id,
        status: 'awaiting_payment',
      });

      return NextResponse.json({
        success: true,
        type: 'invoice',
        url: invoice.invoice_url,
        paymentId: invoice.id,
        orderId,
      });
    } catch (invoiceErr) {
      // Fallback to direct payment (shows wallet address)
      logger.warn('[nowpayments] Invoice creation failed, falling back to direct payment', { err: invoiceErr });

      const payment = await nowPaymentsCreatePayment({
        price_amount: amountCents / 100,
        price_currency: 'usd',
        pay_currency: currency,
        order_id: orderId,
        order_description: `SoulMate AI ${plan} (${billing})`,
        ipn_callback_url: `${origin}/api/nowpayments/ipn`,
      });

      // Record payment in database
      await client.from('crypto_payments').insert({
        user_id: user.id,
        plan_id: plan,
        amount_usd: amountCents / 100,
        currency: currency.toUpperCase(),
        wallet_address: payment.pay_address,
        tx_hash: payment.payment_id,
        status: 'awaiting_payment',
      });

      return NextResponse.json({
        success: true,
        type: 'payment',
        paymentId: payment.payment_id,
        payAddress: payment.pay_address,
        payAmount: payment.pay_amount,
        payCurrency: payment.pay_currency,
        network: payment.network,
        orderId,
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[nowpayments] Create payment failed', { err });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

/**
 * GET /api/nowpayments?paymentId=xxx
 * Check payment status
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId required' }, { status: 400 });
    }

    const status = await nowPaymentsEstimatePrice({
      amount: 10,
      currency_from: 'usd',
      currency_to: 'btc',
    });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
