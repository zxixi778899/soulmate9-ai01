import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';

/**
 * GET /api/v2/user/achievements - 获取用户成就列表与进度
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = auth.client;

    // 获取全部成就定义
    const { data: allAchievements, error: achError } = await supabase
      .from('achievements')
      .select('*')
      .order('sort_order', { ascending: true });

    if (achError) throw new Error(achError.message);

    // 获取用户的成就进度
    const { data: userAchievements, error: userAchError } = await supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', auth.user.id);

    if (userAchError) throw new Error(userAchError.message);

    // 构建响应：为每个成就添加用户的进度信息
    const enrichedAchievements = (allAchievements || []).map((ach) => {
      const userAch = userAchievements?.find((ua) => ua.achievement_id === ach.id);
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
      total_unlocked: userAchievements?.filter((ua) => ua.unlocked).length || 0,
      total_claimed: userAchievements?.filter((ua) => ua.reward_claimed).length || 0,
    });
  } catch (err: any) {
    console.error('[user/achievements] GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch achievements' },
      { status: 500 }
    );
  }
}
