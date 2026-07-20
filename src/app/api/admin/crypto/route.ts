import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateSettings, invalidateTokens } from '@/lib/revalidate';

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

      // Update payment status
      const { error: updateErr } = await supabase
        .from('crypto_payments')
        .update({
          status: 'confirmed',
          admin_notes: admin_notes || null,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // Set membership tier based on plan
      let membershipTier = 'free';
      let credits = 0;
      if (payment.plan_id === 'basic') {
        membershipTier = 'basic';
        credits = 200;
      } else if (payment.plan_id === 'pro') {
        membershipTier = 'pro';
        credits = 500;
      } else if (payment.plan_id === 'unlimited') {
        membershipTier = 'unlimited';
        credits = 9999;
      }

      // Update user's profile
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ membership_tier: membershipTier, credits_remaining: credits })
        .eq('user_id', payment.user_id);

      if (profileErr) throw profileErr;

      // Send notification to user
      await supabase.from('notifications').insert({
        user_id: payment.user_id,
        title: 'Crypto Payment Confirmed ',
        message: `Your ${payment.plan_id.toUpperCase()} payment via ${payment.currency} has been confirmed!`,
        type: 'payment_confirmed',
        link_url: '/profile',
      });

      invalidateSettings();
      invalidateTokens();

      return NextResponse.json({ success: true });
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