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
    const [{ data: metrics, error: metricsError }, { data: recentUsers, error: usersError }] =
      await Promise.all([
        supabase.rpc('admin_dashboard_metrics'),
        supabase
          .from('profiles')
          .select('id, display_name, membership_tier, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

    if (metricsError) throw new Error(`Dashboard metrics query failed: ${metricsError.message}`);
    if (usersError) throw new Error(`Recent users query failed: ${usersError.message}`);

    return NextResponse.json({
      stats: normalizeStats(metrics as Partial<DashboardStats> | null),
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
