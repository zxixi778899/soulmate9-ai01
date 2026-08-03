import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { assertCanAddCompanion } from '@/lib/companion-seats';
import { logger } from '@/lib/logger';

/**
 * GET /api/friends — 获取好友列表（JOIN girlfriends 取详情）
 */
export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: rows, error } = await client
    .from('user_friends')
    .select('id, girlfriend_id, source, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[friends] list failed', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ friends: [] });
  }

  const gfIds = rows.map((r: { girlfriend_id: string }) => r.girlfriend_id);
  const { data: girlfriends } = await client
    .from('girlfriends')
    .select('id, name, slug, avatar_url, portrait_url, personality, short_description, review_status, is_public, age, tags, character_card')
    .in('id', gfIds);

  const gfMap = new Map((girlfriends || []).map((g: { id: string }) => [g.id, g]));

  const friends = rows
    .map((r: { girlfriend_id: string; source: string; created_at: string }) => {
      const gf = gfMap.get(r.girlfriend_id);
      if (!gf) return null;
      return { ...gf, friend_source: r.source, friend_since: r.created_at };
    })
    .filter(Boolean);

  return NextResponse.json({ friends });
}

/**
 * POST /api/friends — 添加好友（从公共目录）
 * body: { slug } 或 { girlfriend_id }
 */
export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { slug, girlfriend_id } = body as { slug?: string; girlfriend_id?: string };

  if (!slug && !girlfriend_id) {
    return NextResponse.json({ error: 'slug or girlfriend_id is required' }, { status: 400 });
  }

  // 查找公共伴侣
  let publicGf: Record<string, unknown> | null = null;
  if (girlfriend_id) {
    const { data } = await client
      .from('girlfriends')
      .select('id, name, slug, avatar_url, portrait_url')
      .eq('id', girlfriend_id)
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .maybeSingle();
    publicGf = data;
  } else {
    const { data } = await client
      .from('girlfriends')
      .select('id, name, slug, avatar_url, portrait_url')
      .eq('slug', slug)
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .maybeSingle();
    publicGf = data;
  }

  if (!publicGf) {
    return NextResponse.json({ error: 'Public companion not found' }, { status: 404 });
  }

  // 检查是否已是好友
  const { data: existing } = await client
    .from('user_friends')
    .select('id')
    .eq('user_id', user.id)
    .eq('girlfriend_id', publicGf.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ friend: publicGf, alreadyFriend: true });
  }

  // 席位检查
  const seatCheck = await assertCanAddCompanion(client, user.id);
  if (!seatCheck.ok) {
    return NextResponse.json(
      { error: seatCheck.error, code: seatCheck.code, seats: seatCheck.seats },
      { status: 403 },
    );
  }

  // 插入好友关系（引用式，不克隆）
  const { data: friendRow, error: insertError } = await client
    .from('user_friends')
    .insert({ user_id: user.id, girlfriend_id: publicGf.id, source: 'public' })
    .select()
    .single();

  if (insertError) {
    logger.error('[friends] add failed', { error: insertError.message });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 创建初始亲密度
  await client.from('intimacy_scores').insert({
    user_id: user.id,
    girlfriend_id: publicGf.id,
    score: 10,
    level: 1,
    last_daily_reset: new Date().toISOString().split('T')[0],
  });

  // 初始相册
  const albumUrl = (publicGf.portrait_url || publicGf.avatar_url) as string | null;
  if (albumUrl) {
    await client.from('chat_media').insert({
      user_id: user.id,
      girlfriend_id: publicGf.id,
      media_type: 'image',
      url: albumUrl,
      metadata: { source: 'public_friend', asset_role: 'character-art', intimacy_level: 1 },
    });
  }

  return NextResponse.json({ friend: { ...publicGf, friend_source: 'public' }, alreadyFriend: false });
}

/**
 * DELETE /api/friends?id=<girlfriend_id> — 删除好友
 * 仅移除好友关系，不影响公共伴侣状态
 */
export async function DELETE(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const girlfriendId = searchParams.get('id');
  if (!girlfriendId) {
    return NextResponse.json({ error: 'id (girlfriend_id) is required' }, { status: 400 });
  }

  // 查好友关系
  const { data: friendRow } = await client
    .from('user_friends')
    .select('id, source, girlfriend_id')
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriendId)
    .maybeSingle();

  if (!friendRow) {
    return NextResponse.json({ error: 'Friend not found' }, { status: 404 });
  }

  // 删除好友关系
  const { error: delError } = await client
    .from('user_friends')
    .delete()
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriendId);

  if (delError) {
    logger.error('[friends] delete failed', { error: delError.message });
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  // 如果是用户创建的伴侣，同时软删除伴侣本体
  if (friendRow.source === 'created') {
    await client
      .from('girlfriends')
      .update({ review_status: 'removed', is_active: false, is_public: false })
      .eq('id', girlfriendId)
      .eq('user_id', user.id);
  }

  // 公共伴侣不做任何修改 — 删除好友不影响公共系统状态

  return NextResponse.json({ ok: true, removed: girlfriendId });
}
