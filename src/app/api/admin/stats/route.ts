import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/admin/stats
 *
 *  admin dashboard 
 *   - total_users, paid_users, today_active, today_revenue_cents
 *   -  30  membership_tier 
 *   -  7 new + retained
 *   - pending_girlfriends / pending_cms_pages / open_tickets / failed_runpod
 *   -  5 
 *
 * 
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

  // 30 
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
