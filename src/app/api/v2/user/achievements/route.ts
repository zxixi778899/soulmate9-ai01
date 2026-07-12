import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { heatAchievementsAsCatalogRows } from '@/lib/heat-achievements';

/**
 * GET /api/v2/user/achievements — user achievement list + progress
 * Falls back to heat catalog when DB table is empty (pre-seed).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = auth.client;

    const { data: allAchievements, error: achError } = await supabase
      .from('achievements')
      .select('*')
      .order('sort_order', { ascending: true });

    if (achError) throw new Error(achError.message);

    const catalog =
      allAchievements && allAchievements.length > 0
        ? allAchievements
        : heatAchievementsAsCatalogRows();

    const usingFallback = !allAchievements || allAchievements.length === 0;

    const { data: userAchievements, error: userAchError } = await supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', auth.user.id);

    if (userAchError) throw new Error(userAchError.message);

    const enrichedAchievements = catalog.map((ach) => {
      const id = String(ach.id);
      const userAch = (userAchievements || []).find(
        (ua: { achievement_id: string }) => ua.achievement_id === id,
      );
      return {
        ...ach,
        user_progress: userAch || {
          progress_value: 0,
          unlocked: false,
          reward_claimed: false,
        },
      };
    });

    return NextResponse.json({
      achievements: enrichedAchievements,
      total_unlocked: (userAchievements || []).filter((ua: { unlocked: boolean }) => ua.unlocked).length,
      total_claimed: (userAchievements || []).filter((ua: { reward_claimed: boolean }) => ua.reward_claimed).length,
      source: usingFallback ? 'heat_fallback' : 'database',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[user/achievements] GET error', { err: message.slice(0, 200) });
    return NextResponse.json(
      { error: 'Failed to fetch achievements' },
      { status: 500 },
    );
  }
}
