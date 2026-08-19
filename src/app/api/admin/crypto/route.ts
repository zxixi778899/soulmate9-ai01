import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateSettings, invalidateTokens } from '@/lib/revalidate';
import { grantCryptoPayment } from '@/lib/payment-grant';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const adminCheck = await requireAdmin(request);
    if (adminCheck.error) return adminCheck.error;
    const { supabase } = adminCheck;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const provider = searchParams.get('provider') || '';

    let query = supabase
      .from('crypto_payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && ['awaiting_payment', 'pending_verification', 'confirmed', 'rejected'].includes(status)) {
      query = query.eq('status', status);
    }

    // Filter by payment provider based on tx_hash prefix
    if (provider === 'nowpayments') {
      query = query.like('tx_hash', 'np_%');
    } else if (provider === 'nexapay') {
      query = query.like('tx_hash', 'nxp_%');
    } else if (provider === 'stripe') {
      query = query.or('tx_hash.like.stripe_%,tx_hash.like.cs_%');
    } else if (provider === 'crypto') {
      query = query.not('tx_hash', 'is', null)
        .not('tx_hash', 'like', 'np_%')
        .not('tx_hash', 'like', 'nxp_%')
        .not('tx_hash', 'like', 'stripe_%')
        .not('tx_hash', 'like', 'cs_%');
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, payments: data || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminCheck = await requireAdmin(request);
    if (adminCheck.error) return adminCheck.error;
    const { supabase } = adminCheck;

    const body = await request.json();
    const id = body.id || body.paymentId;
    const action = body.action;
    const admin_notes = body.admin_notes || body.adminNotes || null;

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    if (action === 'confirm') {
      // Get the payment record
      const { data: payment, error: fetchErr } = await supabase
        .from('crypto_payments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr || !payment) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
      }

      // Update payment status to confirmed
      const { error: updateErr } = await supabase
        .from('crypto_payments')
        .update({
          status: 'confirmed',
          admin_notes: admin_notes || null,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // Determine payment type and grant rewards via shared logic
      const paymentType = ['pro', 'premium', 'unlimited', 'basic'].includes(payment.plan_id)
        ? 'subscription' as const
        : 'tokens' as const;

      const grantResult = await grantCryptoPayment(supabase, payment, paymentType);
      if (!grantResult.ok) {
        logger.error('[admin/crypto] grant failed:', { paymentId: id, error: grantResult.error });
        // Don't throw — payment is confirmed, admin can retry grant manually
      }

      invalidateSettings();
      invalidateTokens();

      return NextResponse.json({ success: true, grant: grantResult });
    }

    if (action === 'reject') {
      const { error: updateErr } = await supabase
        .from('crypto_payments')
        .update({
          status: 'rejected',
          admin_notes: admin_notes || null,
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      invalidateSettings();

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}