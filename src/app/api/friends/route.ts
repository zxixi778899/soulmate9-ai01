import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { assertCanAddCompanion } from '@/lib/companion-seats';
import { logger } from '@/lib/logger';
import { checkAchievements } from '@/lib/achievement-checker';

/**
 * GET /api/friends — 获取好友列表（JOIN girlfriends 取详情）
 */
export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const GF_FIELDS_FULL =
    'id, name, slug, avatar_url, portrait_url, personality, short_description, review_status, is_public, age, tags, character_card, submitted_at, rejection_reason, voice_promo_url';
  const GF_FIELDS_CORE =
    'id, name, slug, avatar_url, portrait_url, personality, short_description, review_status, is_public, age, tags, character_card, submitted_at, rejection_reason';
  // voice_promo_url ships with migration 0036; DBs without it must not 500.
  const { error: voiceProbeErr } = await client
    .from('girlfriends')
    .select('voice_promo_url')
    .limit(1);
  const GF_FIELDS = voiceProbeErr ? GF_FIELDS_CORE : GF_FIELDS_FULL;

  const { data: rows, error } = await client
    .from('user_friends')
    .select('id, girlfriend_id, source, created_at')
    .eq('user_id', user.id);

  if (error) {
    logger.error('[friends] list failed', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Link = { girlfriend_id: string; source: string; created_at: string };
  const links: Link[] = ((rows || []) as Link[]).map((l) => ({
    girlfriend_id: String(l.girlfriend_id),
    source: l.source,
    created_at: l.created_at,
  }));
  const sourceByGfId = new Map(links.map((l) => [l.girlfriend_id, l.source]));
  const sinceByGfId = new Map(links.map((l) => [l.girlfriend_id, l.created_at]));

  /**
   * The friend list must mirror "我的伴侣" (GET /api/girlfriends): user_friends
   * is the source of truth, but owned companions can outlive their friendship
   * row (deleted → re-approved → re-added as 'public' → deleted again leaves
   * the companion approved with no row). Union owned active companions in so
   * both surfaces always return the same set.
   */
  const { data: ownedRows, error: ownedErr } = await client
    .from('girlfriends')
    .select(`${GF_FIELDS}, created_at, is_pinned, pinned_at`)
    .eq('user_id', user.id)
    .neq('review_status', 'removed')
    .order('is_pinned', { ascending: false })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (ownedErr) {
    logger.error('[friends] owned list failed', { error: ownedErr.message });
    return NextResponse.json({ error: ownedErr.message }, { status: 500 });
  }

  type FriendRow = Record<string, unknown> & { id: string };
  const owned = (ownedRows || []) as FriendRow[];
  const ownedIds = new Set(owned.map((g) => String(g.id)));

  const addedLinks = links
    .filter((l) => !ownedIds.has(l.girlfriend_id))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  let addedFriends: FriendRow[] = [];
  if (addedLinks.length) {
    const { data: addedRows, error: addedErr } = await client
      .from('girlfriends')
      .select(GF_FIELDS)
      .in('id', addedLinks.map((l) => l.girlfriend_id))
      .neq('review_status', 'removed');
    if (addedErr) {
      logger.warn('[friends] added-friends lookup failed', { err: addedErr.message });
    } else {
      const byId = new Map(((addedRows || []) as FriendRow[]).map((g) => [String(g.id), g]));
      addedFriends = addedLinks
        .map((l) => byId.get(l.girlfriend_id))
        .filter((g): g is FriendRow => Boolean(g));
    }
  }

  const friends = [
    ...owned.map((g) => ({
      ...g,
      friend_source: sourceByGfId.get(String(g.id)) || 'created',
      friend_since: sinceByGfId.get(String(g.id)) || g.created_at,
    })),
    ...addedFriends.map((g) => ({
      ...g,
      friend_source: sourceByGfId.get(String(g.id)) || 'public',
      friend_since: sinceByGfId.get(String(g.id)) || null,
    })),
  ];

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

  // Fire-and-forget: collection achievements (collector_3/5/10/20) unlock here.
  checkAchievements(client, user.id).catch(() => {});

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

  // 自有伴侣可能没有好友行（删除→重新上架→以'public'重新添加→再删除会留下
  // approved 但无行的孤儿伴侣），它们同样必须能从好友列表移除
  const { data: ownedGf } = await client
    .from('girlfriends')
    .select('id, user_id, is_public')
    .eq('id', girlfriendId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!friendRow && !ownedGf) {
    return NextResponse.json({ error: 'Friend not found' }, { status: 404 });
  }

  // 删除好友关系
  if (friendRow) {
    const { error: delError } = await client
      .from('user_friends')
      .delete()
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriendId);

    if (delError) {
      logger.error('[friends] delete failed', { error: delError.message });
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }
  }

  // 清空与该伴侣的所有聊天记录（删除好友即彻底清除对话）
  const { error: msgDelError } = await client
    .from('chat_messages')
    .delete()
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriendId);

  if (msgDelError) {
    logger.error('[friends] clear chat messages failed', { error: msgDelError.message });
  }

  // 亲密度归零（UI 删除确认已承诺归零；重新添加从 0 开始）
  const { error: intimacyError } = await client
    .from('intimacy_scores')
    .delete()
    .eq('user_id', user.id)
    .eq('girlfriend_id', girlfriendId);

  if (intimacyError) {
    logger.error('[friends] reset intimacy failed', { error: intimacyError.message });
  }

  // 仅软删除用户自建的「私有」伴侣。公共/系统伴侣（is_public=true）绝不能因
  // 删除好友而被下架——测试账号恰好拥有全部精选系统伴侣，旧逻辑按所有权软删
  // 会把前端资料库的伴侣一并删掉。孤儿场景由 GET 的 union 兜底展示。
  if (ownedGf && !ownedGf.is_public) {
    await client
      .from('girlfriends')
      .update({ review_status: 'removed', is_active: false, is_public: false })
      .eq('id', girlfriendId)
      .eq('user_id', user.id);
  }

  // 公共伴侣不做任何修改 — 删除好友不影响公共系统状态

  return NextResponse.json({ ok: true, removed: girlfriendId });
}
