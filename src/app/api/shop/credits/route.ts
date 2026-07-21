import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

const CREDIT_PLANS = [
  { id: 'credits-500', name: 'Starter', amount: 500, price: '$4.99', price_cents: 499 },
  { id: 'credits-1000', name: 'Popular', amount: 1100, price: '$9.99', price_cents: 999 },
  { id: 'credits-2500', name: 'Best Value', amount: 3000, price: '$24.99', price_cents: 2499 },
  { id: 'credits-5000', name: 'Mega', amount: 6500, price: '$49.99', price_cents: 4999 },
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
    logger.error('[Credits API] Error:', { data: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}