import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    // Fetch stripe purchases from profiles history or dedicated table
    // For now, fetch crypto payments
    const { data: cryptoOrders, error: cryptoErr } = await supabase
      .from('crypto_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (cryptoErr) {
      console.error('Failed to fetch crypto orders:', cryptoErr);
    }

    // Also check if there's a stripe_purchases or memberships history
    const { data: profile } = await supabase
      .from('profiles')
      .select('membership_tier, membership_updated_at, credits_remaining')
      .eq('user_id', user.id)
      .single();

    // Get shop purchase history
    const { data: shopPurchases } = await supabase
      .from('shop_purchases')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const purchases = [
      ...(cryptoOrders || []).map((o: any) => ({
        id: o.id,
        type: 'crypto' as const,
        amount_usd: o.amount_usd,
        currency: o.currency,
        plan: o.plan_id,
        status: o.status,
        tx_hash: o.tx_hash,
        created_at: o.created_at,
      })),
      ...(shopPurchases || []).map((o: any) => ({
        id: o.id,
        type: 'shop' as const,
        amount: o.price_cents,
        currency: 'USD',
        item_name: o.item_name,
        item_type: o.item_type,
        status: 'completed' as const,
        created_at: o.created_at,
      })),
    ];

    purchases.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      success: true,
      purchases,
      membership: profile || null,
    });
  } catch (err) {
    console.error('Purchases API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}