import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { createNexaPayPayment, NEXAPAY_PAYMENT_METHODS, getNexaPayPriceCents } from '@/lib/nexapay-server';
import { logger } from '@/lib/logger';

/**
 * POST /api/nexapay
 * Create a NexaPay LATAM payment (Pix/TED/Card/Boleto)
 * Body: { plan: 'basic'|'pro'|'unlimited', billing: 'monthly'|'quarterly'|'yearly', payment_method?: 'pix'|'ted'|'card_latam'|'boleto' }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, client, error: authError } = await getAuthUser(req);
    if (!user || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { plan, billing = 'monthly', payment_method = 'pix' } = body;

    if (!['basic', 'pro', 'unlimited'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const validMethods = NEXAPAY_PAYMENT_METHODS.map((m) => m.id);
    if (!validMethods.includes(payment_method)) {
      return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 });
    }

    const amountCents = getNexaPayPriceCents(plan, billing);
    if (amountCents <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const orderId = `nxp_${user.id}_${plan}_${billing}_${Date.now()}`;

    const payment = await createNexaPayPayment({
      amount_cents: amountCents,
      currency: 'USD',
      payment_method,
      order_id: orderId,
      description: `SoulMate AI ${plan} (${billing})`,
      customer_email: user.email || '',
      success_url: `${origin}/payment/success?order_id=${orderId}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      webhook_url: `${origin}/api/nexapay/webhook`,
    });

    // Record payment in database
    await client.from('crypto_payments').insert({
      user_id: user.id,
      plan_id: plan,
      amount_usd: amountCents / 100,
      currency: 'BRL',
      tx_hash: payment.payment_id,
      status: 'awaiting_payment',
    });

    return NextResponse.json({
      success: true,
      paymentId: payment.payment_id,
      url: payment.payment_url,
      amountBrl: payment.amount_brl,
      expiresAt: payment.expires_at,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[nexapay] Create payment failed', { err });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
