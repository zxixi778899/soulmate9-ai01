import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { loggerFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = loggerFromRequest(request as never);
  const result = await requireAdmin(request);
  if (result.error) return result.error;
  const { supabase } = result;

  try {
    const [
      { count: userCount },
      { count: girlfriendCount },
      { count: publicCount },
      { count: pendingCount },
      { count: adCount },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { head: true, count: 'exact' }),
      supabase.from('girlfriends').select('id', { head: true, count: 'exact' }),
      supabase.from('girlfriends').select('id', { head: true, count: 'exact' }).eq('is_public', true),
      supabase.from('girlfriends').select('id', { head: true, count: 'exact' }).eq('review_status', 'pending'),
      supabase.from('admin_ads').select('id', { head: true, count: 'exact' }).eq('active', true),
    ]);

    const { data: recentUsers } = await supabase
      .from('profiles')
      .select('id, display_name, membership_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count: dau } = await supabase
      .from('chat_messages')
      .select('user_id', { head: true, count: 'exact' })
      .gte('created_at', since24h);

    const { count: wau } = await supabase
      .from('chat_messages')
      .select('user_id', { head: true, count: 'exact' })
      .gte('created_at', since7d);

    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('status', 'active');

    const PLAN_PRICES: Record<string, number> = { pro: 999, unlimited: 1999 };
    const mrrCents = (activeSubs || []).reduce((acc, s) => acc + (PLAN_PRICES[s.plan_id] || 0), 0);

    // Paid member counts
    const { count: proCount } = await supabase
      .from('profiles').select('id', { head: true, count: 'exact' })
      .eq('membership_tier', 'pro');
    const { count: unlimitedCount } = await supabase
      .from('profiles').select('id', { head: true, count: 'exact' })
      .eq('membership_tier', 'unlimited');

    // Total paid amount (all time from purchase_history)
    const { data: allPurchases } = await supabase
      .from('purchase_history')
      .select('amount_cents')
      .eq('status', 'completed');
    const totalPaidCents = (allPurchases || []).reduce((acc, p) => acc + (p.amount_cents || 0), 0);

    const { count: newUsers7d } = await supabase
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .gte('created_at', since7d);

    const { count: images7d } = await supabase
      .from('chat_messages')
      .select('id', { head: true, count: 'exact' })
      .eq('role', 'assistant')
      .not('image_url', 'is', null)
      .gte('created_at', since7d);

    const { data: cacheStats } = await supabase
      .from('generation_cache')
      .select('hit_count')
      .gte('created_at', since7d)
      .limit(1000);
    const totalHits = (cacheStats || []).reduce((acc, r) => acc + (r.hit_count || 0), 0);
    const totalEntries = cacheStats?.length ?? 0;
    const avgHitRate = totalEntries > 0 ? totalHits / totalEntries : 0;

    return NextResponse.json({
      stats: {
        totalUsers: userCount ?? 0,
        totalGirlfriends: girlfriendCount ?? 0,
        publicGirlfriends: publicCount ?? 0,
        pendingReview: pendingCount ?? 0,
        activeAds: adCount ?? 0,
        dau: dau ?? 0,
        wau: wau ?? 0,
        mrr_cents: mrrCents,
        proMembers: proCount ?? 0,
        unlimitedMembers: unlimitedCount ?? 0,
        paidMembers: (proCount ?? 0) + (unlimitedCount ?? 0),
        totalPaidCents,
        newUsers7d: newUsers7d ?? 0,
        images7d: images7d ?? 0,
        cacheHitRate: Number(avgHitRate.toFixed(2)),
      },
      recentUsers: recentUsers || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    log.error('admin-dashboard: failed', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
