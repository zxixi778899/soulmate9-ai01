import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getCreatorStats } from '@/lib/community';

export const dynamic = 'force-dynamic';

/**
 * GET /api/community/me — 我的社区数据（账户页统计栏）
 * 粉丝数 / 关注数 / 发布数量（已上架作品） / 互动值
 */
export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const stats = await getCreatorStats(client, user.id);
    return NextResponse.json({
      fans: stats.fans,
      following: stats.following,
      published: stats.publishedWorks,
      total: stats.totalWorks,
      interaction: stats.interactionScore,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
