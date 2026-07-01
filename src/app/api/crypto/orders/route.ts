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

    const { data: orders, error: dbError } = await supabase
      .from('crypto_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Failed to fetch crypto orders:', dbError);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    return NextResponse.json({ success: true, orders: orders || [] });
  } catch (err) {
    console.error('Crypto orders error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}