import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { buildLeaderboard, LEADERBOARD_SIZE } from '@/lib/community';

export const dynamic = 'force-dynamic';

/**
 * GET /api/community/leaderboard — 公开排行榜（游客可读）
 * 虚拟账号 + 真实创作者合并按互动值排序，Top15；
 * 真实用户数值超过虚拟数据自动顶替上榜。
 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const entries = await buildLeaderboard(client);
    return NextResponse.json({ entries, size: LEADERBOARD_SIZE });
  } catch (e) {
    return NextResponse.json(
      { entries: [], size: LEADERBOARD_SIZE, error: String(e) },
      { status: 500 },
    );
  }
}
