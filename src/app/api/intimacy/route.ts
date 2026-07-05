import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: scores, error } = await client
    .from('intimacy_scores')
    .select('*')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scores });
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check user membership tier
  const { data: profile } = await client
    .from('profiles')
    .select('membership_tier')
    .eq('user_id', user.id)
    .single();

  const isFree = profile?.membership_tier === 'free';
  const FREE_INTIMACY_CAP = 59; // Level 3 (Friend) max

  const body = await request.json();
  const { girlfriend_id, message_type } = body;

  if (!girlfriend_id) {
    return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
  }

  // Get current intimacy score
  const { data: current } = await client
    .from('intimacy_scores')
    .select('*')
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriend_id)
    .single();

  if (!current) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  // Check for active cap unlock item
  const { data: activeItems } = await client
    .from('user_active_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriend_id)
    .eq('effect_type', 'cap_unlock')
    .gte('expires_at', new Date().toISOString())
    .limit(1);

  const isUnlocked = activeItems && activeItems.length > 0;
  const today = new Date().toISOString().split('T')[0];

  // Daily cap check  reset daily_score_gained if it's a new day
  const DAILY_CAP = 17;
  const isNewDay = current.last_daily_reset !== today;
  const todayGain = isNewDay ? 0 : (current.daily_score_gained || 0);

  // Calculate gain
  let gain = 0;
  switch (message_type) {
    case 'first_chat': gain = 2; break;
    case 'reply_proactive': gain = 5; break;
    case 'normal': gain = isUnlocked ? 1 : 0.5; break;
  }

  // Apply cap if not unlocked
  if (!isUnlocked && todayGain >= DAILY_CAP) {
    return NextResponse.json({ gained: 0, capped: true, score: current.score });
  }

  if (!isUnlocked && todayGain + gain > DAILY_CAP) {
    gain = Math.max(0, DAILY_CAP - todayGain);
  }

  const newScore = Math.min(current.score + gain, isFree ? FREE_INTIMACY_CAP : 200);
  const newLevel = getLevel(newScore);

  // Update
  const { data: updated, error } = await client
    .from('intimacy_scores')
    .update({
      score: newScore,
      level: newLevel,
      daily_score_gained: isUnlocked ? (todayGain + gain) : Math.min(todayGain + gain, DAILY_CAP),
      last_daily_reset: today,
      last_interacted_at: new Date().toISOString(),
    })
    .eq('id', current.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gained: gain, capped: !isUnlocked && todayGain + gain >= DAILY_CAP, score: newScore, level: newLevel });
}

function getLevel(score: number): number {
  if (score >= 100) return 6;
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}