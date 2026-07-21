import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { invalidateSettings } from '@/lib/revalidate';
import { DAILY_CHECKIN_REWARD, grantCredits } from '@/lib/credit-system';

export const runtime = 'nodejs';

/**
 *  Daily Check-in API
 * GET  /api/checkin   → streak / today_claimed / next_reward
 * POST /api/checkin   → claim daily reward (flat 10 credits)
 *
 * profiles columns: last_checkin_at(timestamptz) / checkin_streak(int)
 */

function startOfUtcDay(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  const { data } = await supabase
    .from('profiles')
    .select('last_checkin_at, checkin_streak, credits_remaining')
    .eq('user_id', user.id)
    .maybeSingle();

  const lastAt = data?.last_checkin_at ? new Date(data.last_checkin_at) : null;
  const streak = data?.checkin_streak ?? 0;
  const today = startOfUtcDay(new Date());
  const lastDay = lastAt ? startOfUtcDay(lastAt) : null;
  const claimedToday = lastDay === today;

  return NextResponse.json({
    streak,
    claimed_today: claimedToday,
    next_reward: DAILY_CHECKIN_REWARD,
    reward_per_day: DAILY_CHECKIN_REWARD,
    credits_remaining: data?.credits_remaining ?? 0,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  const { data: cur } = await supabase
    .from('profiles')
    .select('last_checkin_at, checkin_streak')
    .eq('user_id', user.id)
    .maybeSingle();

  const lastAt = cur?.last_checkin_at ? new Date(cur.last_checkin_at) : null;
  const oldStreak = cur?.checkin_streak ?? 0;
  const today = startOfUtcDay(new Date());
  const lastDay = lastAt ? startOfUtcDay(lastAt) : null;

  if (lastDay === today) {
    return NextResponse.json({ error: 'Already claimed today' }, { status: 409 });
  }

  // Consecutive day → streak+1, otherwise reset to 1
  const newStreak = lastDay === today - 1 ? oldStreak + 1 : 1;

  // Optimistic lock on last_checkin_at to prevent double-claim
  const lastCondition = lastAt ? lastAt.toISOString() : null;
  let updateQuery = supabase
    .from('profiles')
    .update({ last_checkin_at: new Date().toISOString(), checkin_streak: newStreak })
    .eq('user_id', user.id);
  updateQuery = lastCondition
    ? updateQuery.eq('last_checkin_at', lastCondition)
    : updateQuery.is('last_checkin_at', null);
  const { data: updated, error } = await updateQuery.select('user_id').maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ error: 'Already claimed today' }, { status: 409 });
  }

  // Grant flat 10 credits via unified credit system
  const result = await grantCredits(supabase, user.id, DAILY_CHECKIN_REWARD, 'daily_checkin');
  if (!result.ok) {
    logger.warn('checkin grant_credits failed', { err: result.error });
  }

  invalidateSettings();

  return NextResponse.json({
    ok: true,
    reward: DAILY_CHECKIN_REWARD,
    streak: newStreak,
    balance_after: result.ok ? result.balance_after : undefined,
  });
}
