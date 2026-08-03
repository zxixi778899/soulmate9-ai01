import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { heatAchievementsAsCatalogRows } from '@/lib/heat-achievements';
import { checkAchievements } from '@/lib/achievement-checker';
import { takeAchievementNotifications } from '@/lib/daily-quests';

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

    // Re-evaluate so the list reflects the latest progress, then pop any
    // pending unlock notifications for the client to celebrate. Both are
    // best-effort — the catalog/list below must still load if they fail.
    try {
      await checkAchievements(supabase, auth.user.id);
    } catch {
      /* ignore */
    }
    let pendingUnlocks: Array<{ code: string; name: string; reward: number }> = [];
    try {
      pendingUnlocks = await takeAchievementNotifications(supabase, auth.user.id);
    } catch {
      pendingUnlocks = [];
    }

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
      achievements_unlocked: pendingUnlocks,
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
