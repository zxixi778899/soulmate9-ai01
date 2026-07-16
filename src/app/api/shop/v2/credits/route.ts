/**
 *  v2   
 * GET /api/shop/v2/credits
 *
 *  Supabase REST
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch credits from profiles table via REST
  const { data: profile } = await client
    .from('profiles')
    .select('credits_remaining')
    .eq('user_id', user.id)
    .maybeSingle();

  // Fetch ledger entries via REST (table may not exist)
  let ledger: Record<string, unknown>[] = [];
  try {
    const { data } = await client
      .from('user_credits_ledger')
      .select('id, delta, reason, ref_id, balance_after, created_at, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    ledger = data || [];
  } catch {
    // Table may not exist — return empty ledger
  }

  return NextResponse.json({
    balance: profile?.credits_remaining ?? 0,
    ledger,
  });
}
