import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/supabase-server';

const CREDIT_PLANS = [
  { id: 'starter-pack', name: 'Starter Pack', amount: 500, price: '$4.99', price_cents: 499 },
  { id: 'value-pack', name: 'Value Pack', amount: 1500, price: '$9.99', price_cents: 999 },
  { id: 'mega-pack', name: 'Mega Pack', amount: 5000, price: '$24.99', price_cents: 2499 },
];

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = auth.user.id;

    const supabase = createClient(
      process.env.COZE_SUPABASE_URL!,
      process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile } = await supabase
      .from('profiles')
      .select('credits_remaining, membership_tier')
      .eq('user_id', userId)
      .single();

    return NextResponse.json({
      credits_remaining: profile?.credits_remaining ?? 0,
      membership_tier: profile?.membership_tier ?? 'free',
      plans: CREDIT_PLANS,
    });

  } catch (err) {
    console.error('[Credits API] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}