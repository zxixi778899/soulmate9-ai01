import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 *  API
 * GET  /api/checkin   last_checkin_at / streak / today_claimed
 * POST /api/checkin    N 
 *
 * profiles  last_checkin_at(timestamptz) / checkin_streak(int)
 * 
 *   ALTER TABLE profiles
 *     ADD COLUMN IF NOT EXISTS last_checkin_at timestamptz,
 *     ADD COLUMN IF NOT EXISTS checkin_streak  int  DEFAULT 0;
 */

const DAILY_REWARDS = [10, 15, 20, 30, 40, 50, 80]; // 1~7 

function startOfUtcDay(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthUser(req);
  if (!auth.user) return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 });
  const { user, client: supabase } = auth;

  const { data } = await supabase
    .from('profiles')
    .select('last_checkin_at, checkin_streak')
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
    next_reward: DAILY_REWARDS[Math.min(streak, DAILY_REWARDS.length - 1)],
    rewards: DAILY_REWARDS,
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
  //   streak+1 1
  const newStreak = lastDay === today - 1 ? oldStreak + 1 : 1;
  const reward = DAILY_REWARDS[Math.min(newStreak - 1, DAILY_REWARDS.length - 1)];

  //  last_checkin_at 
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

  //  SQL function grant_credits(uid uuid, amount int)
  const { error: rpcErr } = await supabase.rpc('grant_credits', {
    uid: user.id,
    amount: reward,
  });
  if (rpcErr) logger.warn('grant_credits rpc failed', { err: rpcErr.message });

  return NextResponse.json({ ok: true, reward, streak: newStreak });
}
