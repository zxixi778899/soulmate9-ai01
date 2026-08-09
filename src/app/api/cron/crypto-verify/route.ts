/**
 * Cron: retry TRC-20 USDT verification for pending payments.
 *
 * Runs every 10 minutes. Picks up crypto_payments stuck in
 * `pending_verification` for > 5 minutes, verifies them on-chain,
 * and auto-confirms if valid.
 *
 * Trigger: Vercel cron "every 10 minutes" (slash-10 star star star star)
 * Auth: CRON_SECRET header or query param
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyTrc20UsdtTransfer } from '@/lib/tron-verify';
import { grantCryptoPayment } from '@/lib/payment-grant';
import { logger } from '@/lib/logger';

/** Determine if a crypto payment is for a membership or token purchase */
function detectPaymentType(planId: string): 'subscription' | 'tokens' {
  if (['pro', 'unlimited', 'basic'].includes(planId)) return 'subscription';
  return 'tokens';
}

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Pick up pending payments older than 5 minutes (avoid race with submit)
  const { data: pendingPayments, error: fetchErr } = await supabase
    .from('crypto_payments')
    .select('id, user_id, plan_id, amount_usd, currency, wallet_address, tx_hash, billing, created_at, updated_at')
    .eq('status', 'pending_verification')
    .not('tx_hash', 'is', null)
    // Skip non-direct-crypto payments (NOWPayments/NexaPay have their own webhooks)
    .not('tx_hash', 'like', 'np_%')
    .not('tx_hash', 'like', 'nxp_%')
    .not('tx_hash', 'like', 'stripe_%')
    .not('tx_hash', 'like', 'cs_%')
    .lt('updated_at', fiveMinAgo)
    .order('updated_at', { ascending: true })
    .limit(20);

  if (fetchErr) {
    logger.error('[cron/crypto-verify] fetch error:', { error: fetchErr.message });
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!pendingPayments?.length) {
    return NextResponse.json({ success: true, verified: 0, failed: 0, message: 'No pending payments' });
  }

  let verified = 0;
  let failed = 0;

  for (const payment of pendingPayments) {
    if (!payment.tx_hash || !payment.wallet_address) continue;

    try {
      const result = await verifyTrc20UsdtTransfer(
        payment.tx_hash,
        payment.wallet_address,
        Number(payment.amount_usd) || 0,
      );

      if (result.verified) {
        const paymentType = detectPaymentType(payment.plan_id);
        const grantResult = await grantCryptoPayment(supabase, payment, paymentType);

        if (grantResult.ok) {
          await supabase
            .from('crypto_payments')
            .update({
              status: 'confirmed',
              confirmed_at: new Date().toISOString(),
              amount_received: String(result.amountUsd ?? payment.amount_usd),
              admin_notes: `Auto-verified by cron at ${new Date().toISOString()}`,
            })
            .eq('id', payment.id);
          verified++;
        } else {
          logger.error('[cron/crypto-verify] grant failed:', { paymentId: payment.id, error: grantResult.error });
          failed++;
        }
      } else {
        // Not yet verified — log reason, keep pending for next cron run
        logger.info('[cron/crypto-verify] not yet confirmed:', {
          paymentId: payment.id,
          reason: result.reason,
        });

        // If payment is older than 24h, flag for admin review
        const createdAt = new Date(payment.created_at || payment.updated_at);
        if (Date.now() - createdAt.getTime() > 24 * 60 * 60 * 1000) {
          await supabase
            .from('crypto_payments')
            .update({
              admin_notes: `Auto-verify failed after 24h: ${result.reason}`,
            })
            .eq('id', payment.id);
        }
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[cron/crypto-verify] error processing payment:', {
        paymentId: payment.id,
        error: msg,
      });
      failed++;
    }
  }

  logger.info('[cron/crypto-verify] completed', { verified, failed, total: pendingPayments.length });
  return NextResponse.json({ success: true, verified, failed, total: pendingPayments.length });
}
