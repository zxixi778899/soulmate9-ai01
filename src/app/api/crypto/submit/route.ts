import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyTrc20UsdtTransfer } from '@/lib/tron-verify';
import { grantCryptoPayment } from '@/lib/payment-grant';
import { logger } from '@/lib/logger';

/** Determine if a crypto payment is for a membership or token purchase */
function detectPaymentType(planId: string): 'subscription' | 'tokens' {
  if (['pro', 'unlimited', 'basic'].includes(planId)) return 'subscription';
  return 'tokens';
}

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId, txHash } = await request.json();

    if (!paymentId || !txHash) {
      return NextResponse.json({ error: 'Missing payment ID or transaction hash' }, { status: 400 });
    }

    if (typeof txHash !== 'string' || txHash.trim().length < 10) {
      return NextResponse.json({ error: 'Invalid transaction hash' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Verify the payment belongs to this user and is in awaiting_payment status
    const { data: payment, error: fetchError } = await supabase
      .from('crypto_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    if (payment.status !== 'awaiting_payment') {
      return NextResponse.json({
        error: `Payment already ${payment.status}. Current status: ${payment.status}`,
      }, { status: 400 });
    }

    // ── Step 1: Record tx hash and set pending ─────────────────────────────
    const { error: updateError } = await supabase
      .from('crypto_payments')
      .update({
        tx_hash: txHash.trim(),
        status: 'pending_verification',
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    if (updateError) {
      logger.error('Failed to update crypto payment:', { data: updateError });
      return NextResponse.json({ error: 'Failed to submit payment' }, { status: 500 });
    }

    // ── Step 2: Attempt immediate on-chain verification ───────────────────
    // Skip non-direct-crypto payments (NOWPayments/NexaPay have own webhooks)
    const hash = txHash.trim();
    const isDirectCrypto = !hash.startsWith('np_') &&
      !hash.startsWith('nxp_') &&
      !hash.startsWith('stripe_') &&
      !hash.startsWith('cs_');

    if (isDirectCrypto && payment.wallet_address && payment.amount_usd) {
      try {
        const verifyResult = await verifyTrc20UsdtTransfer(
          hash,
          payment.wallet_address,
          Number(payment.amount_usd),
        );

        if (verifyResult.verified) {
          // Auto-confirm: grant membership or credits
          const paymentType = detectPaymentType(payment.plan_id);
          const grantResult = await grantCryptoPayment(supabase, payment, paymentType);

          if (grantResult.ok) {
            await supabase
              .from('crypto_payments')
              .update({
                status: 'confirmed',
                confirmed_at: new Date().toISOString(),
                amount_received: String(verifyResult.amountUsd ?? payment.amount_usd),
                admin_notes: 'Auto-verified on-chain',
              })
              .eq('id', paymentId);

            return NextResponse.json({
              success: true,
              autoConfirmed: true,
              message: grantResult.granted_type === 'subscription'
                ? `Payment verified and ${payment.plan_id.toUpperCase()} membership activated! Valid until ${new Date(grantResult.period_end!).toLocaleDateString()}.`
                : `Payment verified! ${grantResult.granted_credits?.toLocaleString()} credits added to your account.`,
            });
          } else {
            logger.error('[crypto/submit] grant failed after verification:', { error: grantResult.error });
            // Keep as pending — admin can manually confirm
          }
        } else {
          logger.info('[crypto/submit] on-chain verify not yet passed:', {
            paymentId,
            reason: verifyResult.reason,
          });
          // Keep as pending_verification — cron will retry
        }
      } catch (verifyErr) {
        const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        logger.warn('[crypto/submit] verification error (keeping pending):', { error: msg });
        // Non-fatal: keep as pending_verification, cron will retry
      }
    }

    return NextResponse.json({
      success: true,
      autoConfirmed: false,
      message: 'Payment submitted for verification. Our team will verify your payment within 24 hours.',
    });
  } catch (err) {
    logger.error('Crypto submit error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
