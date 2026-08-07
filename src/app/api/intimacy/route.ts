import { NextRequest, NextResponse } from 'next/server';
import { withAuth, withAuthBody } from '@/lib/api-handler';
import { z } from 'zod';
import { DAILY_INTIMACY_CAP, INTIMACY_MAX_SCORE, getIntimacyLevel, getIntimacyProgress } from '@/lib/constants';
import { maybeUnlockIntimacyMilestone } from '@/lib/intimacy-milestones';

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

  const normalizedScores = (scores || []).map((row) => ({
    ...row,
    score: Math.min(Number(row.score || 0), INTIMACY_MAX_SCORE),
    level: getIntimacyLevel(Number(row.score || 0)),
    progress: getIntimacyProgress(Number(row.score || 0)),
  }));
  return NextResponse.json({ scores: normalizedScores });
});

export const POST = withAuthBody(
  intimacyBodySchema,
  async (req, { user, client, body }) => {
  const { girlfriend_id, message_type } = body;

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
    await client
      .from('intimacy_scores')
      .insert({
        user_id: user.id,
        girlfriend_id,
        score: message_type === 'first_chat' ? 5 : 2,
        level: 1,
        last_interacted_at: new Date().toISOString(),
        daily_message_count: 1,
        daily_score_gained: message_type === 'first_chat' ? 5 : 2,
        last_daily_reset: today,
      })
      .select('*')
      .single();

    return NextResponse.json({
      gained: message_type === 'first_chat' ? 5 : 2,
      score: message_type === 'first_chat' ? 5 : 2,
      level: 1,
      daily_score_gained: message_type === 'first_chat' ? 5 : 2,
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
  const isNewDay = current.last_daily_reset !== today;
  const todayGain = isNewDay ? 0 : (current.daily_score_gained || 0);

  // Calculate gain
  let gain = 0;
  switch (message_type) {
    case 'first_chat': gain = 5; break;
    case 'reply_proactive': gain = 8; break;
    case 'normal': gain = 2; break;
  }

  // Apply cap if not unlocked
  if (!isUnlocked && todayGain >= DAILY_INTIMACY_CAP) {
    return NextResponse.json({ gained: 0, capped: true, score: current.score, level: getIntimacyLevel(Number(current.score || 0)) });
  }

  if (!isUnlocked && todayGain + gain > DAILY_INTIMACY_CAP) {
    gain = Math.max(0, DAILY_INTIMACY_CAP - todayGain);
  }

  const newScore = Math.min(Number(current.score || 0) + gain, INTIMACY_MAX_SCORE);
  const newLevel = getIntimacyLevel(newScore);

  // Update
  const { error } = await client
    .from('intimacy_scores')
    .update({
      score: newScore,
      level: newLevel,
      daily_score_gained: isUnlocked ? (todayGain + gain) : Math.min(todayGain + gain, DAILY_INTIMACY_CAP),
      last_daily_reset: today,
      last_interacted_at: new Date().toISOString(),
    })
    .eq('id', current.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to update intimacy score' }, { status: 500 });
  }

  // 亲密里程碑：跨级奖励积分 + 专属立绘（fire and forget）
  void maybeUnlockIntimacyMilestone(client, user.id, girlfriend_id, newLevel).catch(() => {});

  return NextResponse.json({
    gained: gain,
    capped: !isUnlocked && todayGain + gain >= DAILY_INTIMACY_CAP,
    score: newScore,
    level: newLevel,
    progress: getIntimacyProgress(newScore),
  });
});
