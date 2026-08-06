import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 关注接口同时支持两类对象：
 * - user_id：真实创作者（auth.users + user_follows）
 * - virtual_id：后台虚拟创作者（leaderboard_virtual_users + user_virtual_follows）
 */

async function countFollowers(client: SupabaseClient, followeeId: string): Promise<number> {
  const { count } = await client
    .from('user_follows')
    .select('id', { count: 'exact', head: true })
    .eq('followee_id', followeeId);
  return count || 0;
}

/** 虚拟创作者粉丝数 = 后台种子值 + 真实关注数 */
async function countVirtualFollowers(
  client: SupabaseClient,
  virtualId: string,
): Promise<number | null> {
  const { data: vu } = await client
    .from('leaderboard_virtual_users')
    .select('fans_count, is_active')
    .eq('id', virtualId)
    .maybeSingle();
  if (!vu || !(vu as { is_active?: boolean }).is_active) return null;
  const { count } = await client
    .from('user_virtual_follows')
    .select('id', { count: 'exact', head: true })
    .eq('virtual_user_id', virtualId);
  return Number((vu as { fans_count?: number }).fans_count || 0) + (count || 0);
}

/** GET /api/community/follow?user_id= | ?virtual_id= — 关注状态 + 粉丝数（游客可读） */
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('user_id') || '';
  const virtual = request.nextUrl.searchParams.get('virtual_id') || '';
  if (!UUID_RE.test(target) && !UUID_RE.test(virtual)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }
  try {
    const auth = await getAuthUser(request);
    const client = getSupabaseClient();

    if (UUID_RE.test(virtual)) {
      let isFollowing = false;
      if (auth.user) {
        const { data } = await client
          .from('user_virtual_follows')
          .select('id')
          .eq('follower_id', auth.user.id)
          .eq('virtual_user_id', virtual)
          .maybeSingle();
        isFollowing = Boolean(data);
      }
      const followers = await countVirtualFollowers(client, virtual);
      if (followers === null) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json({ is_following: isFollowing, followers });
    }

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
    const followers = await countFollowers(client, target);
    return NextResponse.json({ is_following: isFollowing, followers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST /api/community/follow { user_id } | { virtual_id } — 关注 */
export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const target = String((body as { user_id?: string }).user_id || '');
  const virtual = String((body as { virtual_id?: string }).virtual_id || '');
  if (!UUID_RE.test(target) && !UUID_RE.test(virtual)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }
  try {
    if (UUID_RE.test(virtual)) {
      const { data: vu } = await client
        .from('leaderboard_virtual_users')
        .select('id, is_active')
        .eq('id', virtual)
        .maybeSingle();
      if (!vu || !(vu as { is_active?: boolean }).is_active) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      const { error } = await client
        .from('user_virtual_follows')
        .insert({ follower_id: user.id, virtual_user_id: virtual });
      if (error && !String(error.message || '').includes('duplicate')) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const followers = (await countVirtualFollowers(client, virtual)) ?? 0;
      return NextResponse.json({ ok: true, is_following: true, followers });
    }

    if (target === user.id) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }
    const { data: profile } = await client
      .from('profiles')
      .select('user_id')
      .eq('user_id', target)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const { error } = await client
      .from('user_follows')
      .insert({ follower_id: user.id, followee_id: target });
    if (error && !String(error.message || '').includes('duplicate')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const followers = await countFollowers(client, target);
    return NextResponse.json({ ok: true, is_following: true, followers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** DELETE /api/community/follow?user_id= | ?virtual_id= — 取消关注 */
export async function DELETE(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const target = request.nextUrl.searchParams.get('user_id') || '';
  const virtual = request.nextUrl.searchParams.get('virtual_id') || '';
  if (!UUID_RE.test(target) && !UUID_RE.test(virtual)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }
  try {
    if (UUID_RE.test(virtual)) {
      await client
        .from('user_virtual_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('virtual_user_id', virtual);
      const followers = (await countVirtualFollowers(client, virtual)) ?? 0;
      return NextResponse.json({ ok: true, is_following: false, followers });
    }
    await client
      .from('user_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('followee_id', target);
    const followers = await countFollowers(client, target);
    return NextResponse.json({ ok: true, is_following: false, followers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
