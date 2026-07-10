import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withAuthBody } from '@/lib/api-handler';
import { z } from 'zod';

const intimacyBodySchema = z.object({
  girlfriend_id: z.string().uuid('girlfriend_id must be a valid UUID'),
  message_type: z.enum(['first_chat', 'reply_proactive', 'normal']).default('normal'),
});

export const GET = withAuth(async (req, { user, client }) => {
  const girlfriendId = req.nextUrl.searchParams.get('girlfriend_id');

  let query = client
    .from('intimacy_scores')
    .select('*')
    .eq('user_id', user.id);

  if (girlfriendId) {
    query = query.eq('girlfriend_id', girlfriendId).limit(1);
  }

  const { data: scores, error } = await query;

  if (error) {
    return NextResponse.json({ scores: [] });
  }

  return NextResponse.json({ scores: scores || [] });
});

export const POST = withAuthBody(
  intimacyBodySchema,
  async (req, { user, client, body }) => {
  const { girlfriend_id, message_type } = body;

  // Check user membership tier
  const { data: profile } = await client
    .from('profiles')
    .select('membership_tier')
    .eq('user_id', user.id)
    .single();

  const isFree = profile?.membership_tier === 'free';
  const FREE_INTIMACY_CAP = 59; // Level 3 (Friend) max

  // Get current intimacy score
  const { data: current } = await client
    .from('intimacy_scores')
    .select('*')
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriend_id)
    .single();

  if (!current) {
    // Auto-create intimacy record on first interaction
    const today = new Date().toISOString().split('T')[0];
    const { data: created } = await client
      .from('intimacy_scores')
      .insert({
        user_id: user.id,
        girlfriend_id,
        score: 1,
        level: 1,
        last_interacted_at: new Date().toISOString(),
        daily_message_count: 1,
        daily_score_gained: 1,
        last_daily_reset: today,
      })
      .select('*')
      .single();

    return NextResponse.json({
      gained: 1,
      score: 1,
      level: 1,
      daily_score_gained: 1,
    });
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

  // Daily cap check - reset daily_score_gained if it's a new day
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
  const { error } = await client
    .from('intimacy_scores')
    .update({
      score: newScore,
      level: newLevel,
      daily_score_gained: isUnlocked ? (todayGain + gain) : Math.min(todayGain + gain, DAILY_CAP),
      last_daily_reset: today,
      last_interacted_at: new Date().toISOString(),
    })
    .eq('id', current.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update intimacy score' }, { status: 500 });
  }

  return NextResponse.json({
    gained: gain,
    capped: !isUnlocked && todayGain + gain >= DAILY_CAP,
    score: newScore,
    level: newLevel,
  });
});

function getLevel(score: number): number {
  if (score >= 100) return 6;
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}