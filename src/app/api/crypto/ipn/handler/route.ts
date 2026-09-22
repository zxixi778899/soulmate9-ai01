/**
 * NOWPayments IPN Webhook Handler
 * POST /api/crypto/ipn/handler
 *
 * Receives payment status updates from NOWPayments and processes them:
 * - Verifies HMAC signature
 * - Checks if payment was completed
 * - Auto-delivers tokens/membership based on order_id
 * - Updates database record status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import { verifyNowPaymentsIPN } from '@/lib/nowpayments-server';

interface NowPaymentsIPNEvent {
  payment_id: string;
  order_id: string;
  payment_status: 'new' | 'confirming' | 'exchanged' | 'sending' | 'finished' | 'failed' | 'expired';
  pay_currency: string;
  pay_amount: number;
  price_amount: number;
  price_currency: string;
  actually_paid?: number;
  payer_address?: string;
  payout_transaction?: string;
  created_at: string;
  updated_at: string;
}

export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const body = JSON.parse(rawBody) as NowPaymentsIPNEvent;

    // Get signature from header
    const ipnSignature = request.headers.get('IPNSignature') || '';

    // Verify HMAC signature
    const isValid = verifyNowPaymentsIPN(rawBody, ipnSignature);
    
    if (!isValid) {
      logger.error('[ipn] Invalid signature', {
        orderId: body.order_id,
        paymentId: body.payment_id,
        signatureLength: ipnSignature.length,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    logger.info('[ipn] Received event', {
      orderId: body.order_id,
      paymentId: body.payment_id,
      status: body.payment_status,
      currency: body.pay_currency,
      amount: body.pay_amount,
    });

    // Skip non-finished events for processing (but update status)
    const supabase = getSupabaseClient();
    
    // Update payment record status
    const { error: updateError } = await supabase
      .from('crypto_payments')
      .update({
        status: body.payment_status,
        tx_hash: body.payout_transaction || body.payment_id,
        completed_at: body.payment_status === 'finished' ? new Date().toISOString() : null,
      })
      .eq('user_id', body.order_id.split('_')[1]) // Extract user_id from order_id format: ep_{userId}_{packageId}_{timestamp}
      .select('user_id');

    if (updateError && updateError.code !== 'PGRST116') {
      // PGRST116 = no rows affected is OK (for new records)
      logger.error('[ipn] Failed to update payment status', { error: updateError.message });
    }

    // If payment is finished - deliver goods
    if (body.payment_status === 'finished') {
      await processPaymentSuccess(supabase, body);
    } else if (body.payment_status === 'failed' || body.payment_status === 'expired') {
      // Mark as failed
      await markPaymentFailed(supabase, body);
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    logger.error('[ipn] Error processing webhook', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Process successful payment - deliver tokens or membership
 */
async function processPaymentSuccess(supabase: ReturnType<typeof getSupabaseClient>, body: NowPaymentsIPNEvent) {
  try {
    // Parse order_id: ep_{userId}_{packageId}_{timestamp}
    const parts = body.order_id.split('_');
    if (parts.length < 3) {
      throw new Error(`Invalid order_id format: ${body.order_id}`);
    }

    const userId = parts[1];
    const packageId = parts[2];

    // Fetch package info
    const { data: tokenPackage, error: pkgError } = await supabase
      .from('token_packages')
      .select('token_count, bonus_tokens')
      .eq('id', packageId)
      .maybeSingle();

    // If not in token_packages, check products table (membership/credits)
    let creditsToGive = 0;
    let isMembership = false;

    if (pkgError || !tokenPackage) {
      const { data: product } = await supabase
        .from('products')
        .select('virtual_meta')
        .eq('id', packageId)
        .maybeSingle();

      if (product) {
        const meta = product.virtual_meta as Record<string, unknown>;
        
        if (meta.collection === 'membership') {
          isMembership = true;
          creditsToGive = 0; // Memberships don't give tokens directly
        } else if (meta.kind === 'credits') {
          creditsToGive = Number(meta.token_amount || meta.credits || 0) + 
                         Number(meta.bonus_tokens || 0);
        }
      }
    } else {
      creditsToGive = Number(tokenPackage.token_count || 0) + 
                     Number((tokenPackage as { bonus_tokens?: number }).bonus_tokens || 0);
    }

    if (creditsToGive > 0 || isMembership) {
      // Use RPC function to atomically add credits
      const { error: rpcError } = await supabase.rpc('add_user_credits', {
        p_user_id: userId,
        p_delta: creditsToGive,
        p_reason: isMembership ? 'membership_upgrade' : 'token_purchase',
        p_ref_id: body.order_id,
      });

      if (rpcError) {
        logger.error('[ipn] Failed to add credits via RPC', {
          userId,
          credits: creditsToGive,
          orderId: body.order_id,
          error: rpcError.message,
        });
      } else {
        logger.info('[ipn] Credits delivered successfully', {
          userId,
          credits: creditsToGive,
          orderId: body.order_id,
        });
      }

      // TODO: Send email notification to user about successful purchase
    }

    // Mark payment as completed
    await supabase
      .from('crypto_payments')
      .update({ status: 'completed' })
      .eq('tx_hash', body.payment_id);

  } catch (err: unknown) {
    logger.error('[ipn] Error processing success', { error: String(err) });
    throw err;
  }
}

/**
 * Mark payment as failed/expired
 */
async function markPaymentFailed(supabase: ReturnType<typeof getSupabaseClient>, body: NowPaymentsIPNEvent) {
  try {
    const parts = body.order_id.split('_');
    if (parts.length >= 3) {
      const userId = parts[1];
      const packageId = parts[2];

      await supabase
        .from('crypto_payments')
        .update({ status: 'failed' })
        .eq('user_id', userId)
        .eq('plan_id', packageId);

      logger.info('[ipn] Payment marked as failed', {
        userId,
        orderId: body.order_id,
        reason: body.payment_status,
      });
    }
  } catch (err: unknown) {
    logger.error('[ipn] Error marking failed', { error: String(err) });
  }
}
