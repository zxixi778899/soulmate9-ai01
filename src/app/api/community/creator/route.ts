import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCreatorStats } from '@/lib/community';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/community/creator?user_id= — 创作者公开主页（游客可读）
 * 返回：资料（昵称/头像/简介/会员）、粉丝/关注/作品/互动值、是否已关注、已上架作品列表
 */
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('user_id') || '';
  if (!UUID_RE.test(target)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }
  try {
    const auth = await getAuthUser(request);
    const client = getSupabaseClient();

    const { data: profile } = await client
      .from('profiles')
      .select('user_id, display_name, avatar_url, bio, membership_tier, email')
      .eq('user_id', target)
      .maybeSingle();
    if (!profile) {
      // 虚拟创作者（后台排行榜账号，不在 auth.users 里）
      const { data: vu } = await client
        .from('leaderboard_virtual_users')
        .select('id, display_name, avatar_url, bio, interaction_score, fans_count, works_count, is_active')
        .eq('id', target)
        .maybeSingle();
      if (!vu || !(vu as { is_active?: boolean }).is_active) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      const v = vu as Record<string, unknown>;

      const { data: links } = await client
        .from('leaderboard_virtual_companions')
        .select('girlfriend_id')
        .eq('virtual_user_id', target);
      const gfIds = ((links || []) as Array<{ girlfriend_id: string }>).map((l) => l.girlfriend_id);
      let works: unknown[] = [];
      if (gfIds.length) {
        const { data: gfs } = await client
          .from('girlfriends')
          .select(
            'id, slug, name, age, short_description, portrait_url, avatar_url, rarity, hot_score, interaction_count, tags',
          )
          .in('id', gfIds)
          .eq('is_public', true)
          .eq('review_status', 'approved')
          .order('interaction_count', { ascending: false })
          .order('hot_score', { ascending: false });
        works = gfs || [];
      }

      const { count: realFans } = await client
        .from('user_virtual_follows')
        .select('id', { count: 'exact', head: true })
        .eq('virtual_user_id', target);

      let isFollowing = false;
      if (auth.user) {
        const { data } = await client
          .from('user_virtual_follows')
          .select('id')
          .eq('follower_id', auth.user.id)
          .eq('virtual_user_id', target)
          .maybeSingle();
        isFollowing = Boolean(data);
      }

      return NextResponse.json({
        creator: {
          id: target,
          kind: 'virtual',
          name: String(v.display_name || 'Creator'),
          avatar: (v.avatar_url as string) || null,
          bio: (v.bio as string) || null,
          tier: 'virtual',
        },
        stats: {
          fans: Number(v.fans_count || 0) + (realFans || 0),
          following: 0,
          works: works.length || Number(v.works_count || 0),
          interaction: Number(v.interaction_score || 0),
        },
        is_following: isFollowing,
        works,
      });
    }

    // 头像/昵称回退到 auth 用户元数据（service role 客户端）
    let metaName: string | null = null;
    let metaAvatar: string | null = null;
    try {
      const { data: userData } = await client.auth.admin.getUserById(target);
      const meta = userData?.user?.user_metadata || {};
      metaName = (meta.display_name as string) || null;
      metaAvatar = (meta.avatar_url as string) || null;
    } catch {
      /* best-effort */
    }

    const stats = await getCreatorStats(client, target);

    let isFollowing = false;
    if (auth.user) {
      const { data } = await client
        .from('user_follows')
        .select('id')
        .eq('follower_id', auth.user.id)
        .eq('followee_id', target)
        .maybeSingle();
      isFollowing = Boolean(data);
    }

    const { data: works } = await client
      .from('girlfriends')
      .select(
        'id, slug, name, age, short_description, portrait_url, avatar_url, rarity, hot_score, interaction_count, tags',
      )
      .eq('user_id', target)
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .order('interaction_count', { ascending: false })
      .order('hot_score', { ascending: false })
      .limit(60);

    return NextResponse.json({
      creator: {
        id: target,
        kind: 'user',
        name:
          (profile as { display_name?: string }).display_name ||
          metaName ||
          String((profile as { email?: string }).email || '').split('@')[0] ||
          'Creator',
        avatar: (profile as { avatar_url?: string }).avatar_url || metaAvatar || null,
        bio: (profile as { bio?: string }).bio || null,
        tier: (profile as { membership_tier?: string }).membership_tier || 'free',
      },
      stats: {
        fans: stats.fans,
        following: stats.following,
        works: stats.publishedWorks,
        interaction: stats.interactionScore,
      },
      is_following: isFollowing,
      works: works || [],
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
