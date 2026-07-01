import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = await requireAdmin(request);
  if (result.error) return result.error;
  const { supabase } = result;

  try {
    const { count: userCount } = await supabase
      .from('profiles')
      .select('id', { head: true, count: 'exact' });

    const { count: girlfriendCount } = await supabase
      .from('girlfriends')
      .select('id', { head: true, count: 'exact' });

    const { count: publicCount } = await supabase
      .from('girlfriends')
      .select('id', { head: true, count: 'exact' })
      .eq('is_public', true);

    const { count: pendingCount } = await supabase
      .from('girlfriends')
      .select('id', { head: true, count: 'exact' })
      .eq('review_status', 'pending');

    const { count: adCount } = await supabase
      .from('admin_ads')
      .select('id', { head: true, count: 'exact' })
      .eq('active', true);

    const { data: recentUsers } = await supabase
      .from('profiles')
      .select('id, display_name, membership_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      stats: {
        totalUsers: userCount ?? 0,
        totalGirlfriends: girlfriendCount ?? 0,
        publicGirlfriends: publicCount ?? 0,
        pendingReview: pendingCount ?? 0,
        activeAds: adCount ?? 0,
      },
      recentUsers: recentUsers || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}