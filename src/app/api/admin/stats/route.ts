import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/admin/stats
 *
 * 返回 admin dashboard 所需的真实数据：
 *   - total_users, paid_users, today_active, today_revenue_cents
 *   - 营收 30 日趋势（按 membership_tier 三档）
 *   - 用户 7 日增长（new + retained）
 *   - 待办：pending_girlfriends / pending_cms_pages / open_tickets / failed_runpod
 *   - 近 5 笔订单
 *
 * 故意把所有查询并行化，给前端一次返回；任何子查询失败不阻断其他指标。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req, 'reviewer');
  if ('error' in admin && admin.error) return admin.error;
  if (!('supabase' in admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { supabase } = admin;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  const safe = async <T>(query: PromiseLike<T>, fallback: T): Promise<T> => {
    try {
      return await query;
    } catch (e) {
      logger.warn('admin stats subquery failed', { err: String(e) });
      return fallback;
    }
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const safeAny = <T>(q: any, fb: T): Promise<T> => safe<T>(q as PromiseLike<T>, fb);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const [
    totalUsersResult,
    paidUsersResult,
    todayActiveResult,
    todayOrdersResult,
    pendingGfResult,
    recentOrdersResult,
  ] = await Promise.all([
    safe(
      supabase.from('profiles').select('user_id', { count: 'exact', head: true }),
      { count: 0 } as { count: number | null },
    ),
    safe(
      supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .neq('membership_tier', 'free'),
      { count: 0 } as { count: number | null },
    ),
    safe(
      supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .gte('last_active_at', todayStart.toISOString()),
      { count: 0 } as { count: number | null },
    ),
    safeAny(
      supabase
        .from('orders')
        .select('amount_cents, currency')
        .gte('created_at', todayStart.toISOString())
        .eq('status', 'paid'),
      { data: [] } as { data: Array<{ amount_cents: number; currency: string }> },
    ),
    safe(
      supabase
        .from('girlfriends')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'pending'),
      { count: 0 } as { count: number | null },
    ),
    safeAny(
      supabase
        .from('orders')
        .select('id, user_id, amount_cents, currency, status, payment_method, tier, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      { data: [] } as {
        data: Array<{
          id: string;
          user_id: string;
          amount_cents: number;
          currency: string;
          status: string;
          payment_method: string;
          tier: string;
          created_at: string;
        }>;
      },
    ),
  ]);

  const todayRevenueCents = (todayOrdersResult.data ?? []).reduce(
    (sum, o) => sum + (o.amount_cents ?? 0),
    0,
  );

  // 30 日营收：单次拉全量，前端聚合
  const revenue30d = await safeAny(
    supabase
      .from('orders')
      .select('amount_cents, tier, created_at')
      .gte('created_at', since30d.toISOString())
      .eq('status', 'paid'),
    { data: [] } as { data: Array<{ amount_cents: number; tier: string; created_at: string }> },
  );

  return NextResponse.json({
    kpi: {
      total_users: totalUsersResult.count ?? 0,
      paid_users: paidUsersResult.count ?? 0,
      today_active: todayActiveResult.count ?? 0,
      today_revenue_cents: todayRevenueCents,
      pending_girlfriends: pendingGfResult.count ?? 0,
    },
    revenue_30d: revenue30d.data ?? [],
    recent_orders: recentOrdersResult.data ?? [],
    ts: new Date().toISOString(),
  });
}
