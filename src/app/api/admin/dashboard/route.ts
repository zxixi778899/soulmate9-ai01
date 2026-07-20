import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { loggerFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type DashboardStats = {
  totalUsers: number;
  totalGirlfriends: number;
  publicGirlfriends: number;
  pendingReview: number;
  activeAds: number;
  dau: number;
  wau: number;
  mrr_cents: number;
  proMembers: number;
  basicMembers: number;
  unlimitedMembers: number;
  paidMembers: number;
  totalPaidCents: number;
  revenue7dCents: number;
  newUsers7d: number;
  images7d: number;
  failedPayments7d: number;
  tokenLiability: number;
  aiCost7dCents: number;
  llmSuccessRate7d: number;
  cacheHitRate: number;
};

function normalizeStats(value: Partial<DashboardStats> | null): DashboardStats {
  return {
    totalUsers: Number(value?.totalUsers || 0),
    totalGirlfriends: Number(value?.totalGirlfriends || 0),
    publicGirlfriends: Number(value?.publicGirlfriends || 0),
    pendingReview: Number(value?.pendingReview || 0),
    activeAds: Number(value?.activeAds || 0),
    dau: Number(value?.dau || 0),
    wau: Number(value?.wau || 0),
    mrr_cents: Number(value?.mrr_cents || 0),
    proMembers: Number(value?.proMembers || 0),
    basicMembers: Number(value?.basicMembers || 0),
    unlimitedMembers: Number(value?.unlimitedMembers || 0),
    paidMembers: Number(value?.paidMembers || 0),
    totalPaidCents: Number(value?.totalPaidCents || 0),
    revenue7dCents: Number(value?.revenue7dCents || 0),
    newUsers7d: Number(value?.newUsers7d || 0),
    images7d: Number(value?.images7d || 0),
    failedPayments7d: Number(value?.failedPayments7d || 0),
    tokenLiability: Number(value?.tokenLiability || 0),
    aiCost7dCents: Number(value?.aiCost7dCents || 0),
    llmSuccessRate7d: Number(value?.llmSuccessRate7d || 0),
    cacheHitRate: Number(value?.cacheHitRate || 0),
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const log = loggerFromRequest(request);
  const authorization = await requireAdmin(request);
  if (authorization.error) return authorization.error;
  const { supabase } = authorization;

  try {
    const queries = {
      totalUsers: (async () => {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        return count || 0;
      })(),
      totalGirlfriends: (async () => {
        const { count } = await supabase.from('girlfriends').select('*', { count: 'exact', head: true });
        return count || 0;
      })(),
      publicGirlfriends: (async () => {
        const { count } = await supabase.from('girlfriends').select('*', { count: 'exact', head: true }).eq('is_public', true);
        return count || 0;
      })(),
      pendingReview: (async () => {
        const { count } = await supabase.from('girlfriends').select('*', { count: 'exact', head: true }).eq('review_status', 'pending');
        return count || 0;
      })(),
      activeAds: (async () => {
        const { count } = await supabase.from('admin_ads').select('*', { count: 'exact', head: true }).eq('active', true);
        return count || 0;
      })(),
      dau: (async () => {
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', today);
        return count || 0;
      })(),
      wau: (async () => {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await supabase.from('chat_messages').select('user_id').eq('role', 'user').gte('created_at', weekAgo);
        return new Set((data || []).map(m => m.user_id)).size;
      })(),
      mrr_cents: (async () => {
        const { data } = await supabase.from('subscriptions').select('unit_amount_cents').eq('status', 'active');
        return (data || []).reduce((sum, s) => sum + (s.unit_amount_cents || 0), 0);
      })(),
      proMembers: (async () => {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('membership_tier', 'pro');
        return count || 0;
      })(),
      basicMembers: (async () => {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('membership_tier', 'basic');
        return count || 0;
      })(),
      unlimitedMembers: (async () => {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('membership_tier', 'unlimited');
        return count || 0;
      })(),
      paidMembers: (async () => {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).in('membership_tier', ['basic', 'pro', 'unlimited']);
        return count || 0;
      })(),
      totalPaidCents: (async () => {
        const { data } = await supabase.from('purchase_history').select('amount_cents').eq('status', 'completed');
        return (data || []).reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      })(),
      revenue7dCents: (async () => {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await supabase.from('purchase_history').select('amount_cents').eq('status', 'completed').gte('created_at', weekAgo);
        return (data || []).reduce((sum, p) => sum + (p.amount_cents || 0), 0);
      })(),
      newUsers7d: (async () => {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo);
        return count || 0;
      })(),
      images7d: (async () => {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { count } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').like('content', '%image%').gte('created_at', weekAgo);
        return count || 0;
      })(),
      failedPayments7d: (async () => {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { count } = await supabase.from('stripe_webhook_events').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', weekAgo);
        return count || 0;
      })(),
      tokenLiability: (async () => {
        const { data } = await supabase.from('user_tokens').select('balance_tokens');
        return (data || []).reduce((sum, t) => sum + (t.balance_tokens || 0), 0);
      })(),
      aiCost7dCents: (async () => {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await supabase.from('ai_model_usage_logs').select('cost_cents').gte('created_at', weekAgo);
        return (data || []).reduce((sum, l) => sum + (l.cost_cents || 0), 0);
      })(),
      llmSuccessRate7d: (async () => {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await supabase.from('ai_model_usage_logs').select('success').gte('created_at', weekAgo);
        if (!data || data.length === 0) return 0;
        const successes = data.filter(l => l.success).length;
        return Math.round((successes / data.length) * 100);
      })(),
      cacheHitRate: (async () => {
        const { data } = await supabase.from('generation_cache').select('hit_count, miss_count');
        if (!data || data.length === 0) return 0;
        const hits = data.reduce((sum, c) => sum + (c.hit_count || 0), 0);
        const misses = data.reduce((sum, c) => sum + (c.miss_count || 0), 0);
        const total = hits + misses;
        return total === 0 ? 0 : Math.round((hits / total) * 100);
      })(),
    };

    const keys = Object.keys(queries) as (keyof DashboardStats)[];
    const results = await Promise.allSettled(Object.values(queries));

    const rawStats: Partial<DashboardStats> = {};
    for (let i = 0; i < keys.length; i++) {
      const result = results[i];
      rawStats[keys[i]] = result.status === 'fulfilled' ? result.value : 0;
      if (result.status === 'rejected') {
        log.warn(`admin-dashboard: metric "${keys[i]}" failed`, { error: String(result.reason) });
      }
    }

    const { data: recentUsers, error: usersError } = await supabase
      .from('profiles')
      .select('id, display_name, membership_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (usersError) {
      log.warn('admin-dashboard: recent users query failed', { error: usersError.message });
    }

    return NextResponse.json({
      stats: normalizeStats(rawStats),
      recentUsers: recentUsers || [],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown dashboard error';
    log.error('admin-dashboard: failed', { error: message });
    return NextResponse.json(
      { error: 'Dashboard metrics unavailable', code: 'ADMIN_METRICS_UNAVAILABLE' },
      { status: 500 },
    );
  }
}
