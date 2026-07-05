import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

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

    // Update the payment with tx hash
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

    return NextResponse.json({
      success: true,
      message: 'Payment submitted for verification. Please allow up to 24 hours for confirmation.',
    });
  } catch (err) {
    logger.error('Crypto submit error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}