import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

/**
 * GET /api/v2/user/intimacy-unlocks?girlfriend_id=xxx
 *
 * Returns:
 *   - current intimacy level + score
 *   - progress to next level (percentage)
 *   - unlocked features at current level
 *   - all level milestones for reference
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const girlfriendId = searchParams.get('girlfriend_id');
    if (!girlfriendId) {
      return NextResponse.json({ error: 'Missing girlfriend_id' }, { status: 400 });
    }

    const supabase = auth.client;

    // Fetch intimacy score + level
    const { data: intimacy, error: intErr } = await supabase
      .from('intimacy_scores')
      .select('score, level')
      .eq('user_id', auth.user.id)
      .eq('girlfriend_id', girlfriendId)
      .single();

    if (intErr && intErr.code !== 'PGRST116') throw new Error(intErr.message);

    const currentLevel = intimacy?.level || 1;
    const currentScore = intimacy?.score || 0;

    // Fetch all level unlock configs
    const { data: levels, error: lvlErr } = await supabase
      .from('intimacy_level_unlocks')
      .select('*')
      .order('level', { ascending: true });

    if (lvlErr) throw new Error(lvlErr.message);

    // Build response
    const levelMap = Object.fromEntries((levels || []).map(l => [l.level, l]));
    const currentLvl = levelMap[currentLevel];
    const nextLvl = levelMap[currentLevel + 1];

    // Calculate progress to next level
    let progressPercent = 100;
    if (nextLvl && currentLvl) {
      const rangeStart = currentLvl.requirement_score;
      const rangeEnd = nextLvl.requirement_score;
      progressPercent = Math.min(100, Math.max(0,
        Math.round(((currentScore - rangeStart) / (rangeEnd - rangeStart)) * 100)
      ));
    } else if (nextLvl && !currentLvl) {
      progressPercent = 0;
    }

    return NextResponse.json({
      current_level: currentLevel,
      intimacy_score: currentScore,
      progress_percent: progressPercent,
      current_level_info: currentLvl ? {
        name: currentLvl.level_name,
        features: currentLvl.unlock_features,
        reward_tokens: currentLvl.reward_tokens,
      } : null,
      next_level_info: nextLvl ? {
        level: nextLvl.level,
        name: nextLvl.level_name,
        required_score: nextLvl.requirement_score,
        features: nextLvl.unlock_features,
      } : null,
      all_levels: (levels || []).map(l => ({
        level: l.level,
        name: l.level_name,
        required_score: l.requirement_score,
        features: l.unlock_features,
        reward_tokens: l.reward_tokens,
        is_unlocked: l.level <= currentLevel,
      })),
    });
  } catch (err: any) {
    logger.error('[intimacy-unlocks] error', { err: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Failed to fetch intimacy data' }, { status: 500 });
  }
}