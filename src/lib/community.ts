import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Community system (Douyin-style creator economy)
 * - 粉丝系统：user_follows
 * - 互动值：girlfriends.interaction_count（发布伴侣被调用次数）
 * - 排行榜：虚拟账号（后台管理）+ 真实创作者 合并按互动值排序取 Top15，
 *   真实用户数值超过虚拟数据即自动顶替上榜。
 */

export const LEADERBOARD_SIZE = 15;

export interface LeaderboardEntry {
  kind: 'user' | 'virtual';
  /** user_id（真实创作者）或虚拟账号 id */
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  /** 互动值 */
  score: number;
  fans: number;
  works: number;
  rank: number;
  /** 代表作（虚拟=分配的系统伴侣，真实=互动值最高的已上架伴侣） */
  companionId: string | null;
  companionName: string | null;
  companionPortrait: string | null;
}

interface CompanionLite {
  id: string;
  name: string;
  portrait: string | null;
  interaction: number;
  hot: number;
}

/** 粉丝计数：按被关注者聚合（数据量小直接全量聚合，量大后可换 RPC） */
export async function fetchFansCounts(
  client: SupabaseClient,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { data } = await client.from('user_follows').select('followee_id');
  for (const row of (data || []) as Array<{ followee_id: string }>) {
    map.set(row.followee_id, (map.get(row.followee_id) || 0) + 1);
  }
  return map;
}

/** 虚拟创作者的真实粉丝计数（user_virtual_follows 按 virtual_user_id 聚合） */
export async function fetchVirtualFansCounts(
  client: SupabaseClient,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { data } = await client.from('user_virtual_follows').select('virtual_user_id');
  for (const row of (data || []) as Array<{ virtual_user_id: string }>) {
    map.set(row.virtual_user_id, (map.get(row.virtual_user_id) || 0) + 1);
  }
  return map;
}

/** 创作者数据：粉丝 / 关注 / 作品（已上架） / 互动值 */
export async function getCreatorStats(client: SupabaseClient, userId: string) {
  const [fansRes, followingRes, worksRes] = await Promise.all([
    client
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('followee_id', userId),
    client
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId),
    client
      .from('girlfriends')
      .select('id, interaction_count, is_public, review_status')
      .eq('user_id', userId),
  ]);

  const rows = (worksRes.data || []) as Array<{
    id: string;
    interaction_count: number;
    is_public: boolean;
    review_status: string;
  }>;
  const published = rows.filter((r) => r.is_public && r.review_status === 'approved');

  return {
    fans: fansRes.count || 0,
    following: followingRes.count || 0,
    totalWorks: rows.length,
    publishedWorks: published.length,
    interactionScore: published.reduce((s, r) => s + Number(r.interaction_count || 0), 0),
  };
}

/** 合并排行榜：虚拟账号 + 真实创作者，按互动值排序取 Top15 */
export async function buildLeaderboard(
  client: SupabaseClient,
): Promise<LeaderboardEntry[]> {
  // 1) 虚拟账号（后台维护）
  const { data: virtuals } = await client
    .from('leaderboard_virtual_users')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  // 2) 虚拟账号名下的系统伴侣
  const { data: links } = await client
    .from('leaderboard_virtual_companions')
    .select('virtual_user_id, girlfriend_id');
  const linkRows = (links || []) as Array<{ virtual_user_id: string; girlfriend_id: string }>;
  const gfIds = Array.from(new Set(linkRows.map((l) => l.girlfriend_id)));
  let companionById = new Map<string, CompanionLite>();
  if (gfIds.length) {
    const { data: gfs } = await client
      .from('girlfriends')
      .select('id, name, portrait_url, avatar_url, hot_score, interaction_count')
      .in('id', gfIds);
    companionById = new Map(
      ((gfs || []) as Array<Record<string, unknown>>).map((g) => [
        String(g.id),
        {
          id: String(g.id),
          name: String(g.name || ''),
          portrait: (g.portrait_url as string) || (g.avatar_url as string) || null,
          interaction: Number(g.interaction_count || 0),
          hot: Number(g.hot_score || 0),
        },
      ]),
    );
  }
  const companionsOf = (vuId: string): CompanionLite[] =>
    linkRows
      .filter((l) => l.virtual_user_id === vuId)
      .map((l) => companionById.get(l.girlfriend_id))
      .filter((c): c is CompanionLite => Boolean(c));

  // 3) 真实创作者：聚合其已上架伴侣
  const { data: published } = await client
    .from('girlfriends')
    .select('user_id, name, portrait_url, avatar_url, interaction_count, hot_score')
    .eq('is_public', true)
    .eq('review_status', 'approved')
    .not('user_id', 'is', null);

  interface RealAgg {
    score: number;
    works: number;
    best: CompanionLite | null;
  }
  const realAgg = new Map<string, RealAgg>();
  for (const g of (published || []) as Array<Record<string, unknown>>) {
    const uid = String(g.user_id);
    const lite: CompanionLite = {
      id: '', // 代表作跳转用伴侣自身 id
      name: String(g.name || ''),
      portrait: (g.portrait_url as string) || (g.avatar_url as string) || null,
      interaction: Number(g.interaction_count || 0),
      hot: Number(g.hot_score || 0),
    };
    const agg = realAgg.get(uid) || { score: 0, works: 0, best: null };
    agg.score += lite.interaction;
    agg.works += 1;
    if (
      !agg.best ||
      lite.interaction > agg.best.interaction ||
      (lite.interaction === agg.best.interaction && lite.hot > agg.best.hot)
    ) {
      agg.best = { ...lite, id: String(g.id) };
    }
    realAgg.set(uid, agg);
  }

  // 4) 粉丝数 + 创作者资料
  const [fansMap, virtualFansMap] = await Promise.all([
    fetchFansCounts(client),
    fetchVirtualFansCounts(client),
  ]);
  const realIds = Array.from(realAgg.keys());
  const profileMap = new Map<
    string,
    { display_name: string | null; avatar_url: string | null; bio: string | null }
  >();
  if (realIds.length) {
    const { data: profiles } = await client
      .from('profiles')
      .select('user_id, display_name, avatar_url, bio, email')
      .in('user_id', realIds);
    for (const p of (profiles || []) as Array<Record<string, unknown>>) {
      profileMap.set(String(p.user_id), {
        display_name: (p.display_name as string) || null,
        avatar_url: (p.avatar_url as string) || null,
        bio: (p.bio as string) || null,
      });
    }
  }

  // 5) 合并
  const entries: Omit<LeaderboardEntry, 'rank'>[] = [];

  for (const v of (virtuals || []) as Array<Record<string, unknown>>) {
    const assigned = companionsOf(String(v.id));
    const rep = assigned[0] || null;
    entries.push({
      kind: 'virtual',
      id: String(v.id),
      name: String(v.display_name || 'Creator'),
      avatar: (v.avatar_url as string) || rep?.portrait || null,
      bio: (v.bio as string) || null,
      score: Number(v.interaction_score || 0),
      fans: Number(v.fans_count || 0) + (virtualFansMap.get(String(v.id)) || 0),
      works: Number(v.works_count || assigned.length || 0),
      companionId: rep?.id || null,
      companionName: rep?.name || null,
      companionPortrait: rep?.portrait || null,
    });
  }

  for (const [uid, agg] of realAgg) {
    const prof = profileMap.get(uid);
    entries.push({
      kind: 'user',
      id: uid,
      name: prof?.display_name || 'Creator',
      avatar: prof?.avatar_url || agg.best?.portrait || null,
      bio: prof?.bio || null,
      score: agg.score,
      fans: fansMap.get(uid) || 0,
      works: agg.works,
      companionId: agg.best?.id || null,
      companionName: agg.best?.name || null,
      companionPortrait: agg.best?.portrait || null,
    });
  }

  entries.sort(
    (a, b) => b.score - a.score || b.fans - a.fans || b.works - a.works || a.name.localeCompare(b.name),
  );

  return entries.slice(0, LEADERBOARD_SIZE).map((e, i) => ({ ...e, rank: i + 1 }));
}
