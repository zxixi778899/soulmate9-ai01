import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { buildLeaderboard } from '@/lib/community';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/leaderboard
 * - entries: 虚拟账号（含名下已分配的系统伴侣）
 * - companions: 可分配的系统伴侣（已上架）
 * - preview: 虚拟 + 真实用户合并后的实时 Top15
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;
  try {
    const { data: entries } = await supabase
      .from('leaderboard_virtual_users')
      .select('*')
      .order('sort_order', { ascending: true });

    const { data: links } = await supabase
      .from('leaderboard_virtual_companions')
      .select('virtual_user_id, girlfriend_id');
    const gfIds = Array.from(
      new Set(((links || []) as Array<{ girlfriend_id: string }>).map((l) => l.girlfriend_id)),
    );
    let companions: Array<Record<string, unknown>> = [];
    if (gfIds.length) {
      const { data: assigned } = await supabase
        .from('girlfriends')
        .select('id, name, portrait_url, avatar_url, hot_score, interaction_count')
        .in('id', gfIds);
      companions = (assigned || []) as Array<Record<string, unknown>>;
    }

    // 可分配的系统伴侣池（已上架）
    const { data: pool } = await supabase
      .from('girlfriends')
      .select('id, name, slug, portrait_url, avatar_url, hot_score, interaction_count, user_id')
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .order('hot_score', { ascending: false })
      .limit(300);

    const preview = await buildLeaderboard(supabase);

    return NextResponse.json({
      entries: entries || [],
      links: links || [],
      companions,
      pool: pool || [],
      preview,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST /api/admin/leaderboard — 新建虚拟账号 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const displayName = String(body.display_name || '').trim();
    if (!displayName) {
      return NextResponse.json({ error: 'display_name required' }, { status: 400 });
    }
    const { data: maxRow } = await supabase
      .from('leaderboard_virtual_users')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = Number((maxRow?.sort_order as number) || 0) + 1;

    const { data, error } = await supabase
      .from('leaderboard_virtual_users')
      .insert({
        display_name: displayName,
        avatar_url: String(body.avatar_url || '') || null,
        bio: String(body.bio || '') || null,
        interaction_score: Number(body.interaction_score || 0),
        fans_count: Number(body.fans_count || 0),
        works_count: Number(body.works_count || 0),
        sort_order: Number(body.sort_order || nextOrder),
        is_active: body.is_active !== false,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 分配系统伴侣
    const companionIds = Array.isArray(body.companion_ids)
      ? (body.companion_ids as string[]).filter((c) => UUID_RE.test(c))
      : [];
    if (companionIds.length && data?.id) {
      await supabase.from('leaderboard_virtual_companions').insert(
        companionIds.map((girlfriend_id) => ({
          virtual_user_id: data.id as string,
          girlfriend_id,
        })),
      );
    }
    return NextResponse.json({ ok: true, entry: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** PATCH /api/admin/leaderboard — 更新虚拟账号（可带 companion_ids 全量替换分配） */
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(body.id || '');
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.display_name === 'string' && body.display_name.trim()) {
      patch.display_name = body.display_name.trim();
    }
    if ('avatar_url' in body) patch.avatar_url = String(body.avatar_url || '') || null;
    if ('bio' in body) patch.bio = String(body.bio || '') || null;
    if ('interaction_score' in body) patch.interaction_score = Number(body.interaction_score || 0);
    if ('fans_count' in body) patch.fans_count = Number(body.fans_count || 0);
    if ('works_count' in body) patch.works_count = Number(body.works_count || 0);
    if ('sort_order' in body) patch.sort_order = Number(body.sort_order || 0);
    if ('is_active' in body) patch.is_active = Boolean(body.is_active);

    const { error } = await supabase
      .from('leaderboard_virtual_users')
      .update(patch)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (Array.isArray(body.companion_ids)) {
      const next = (body.companion_ids as string[]).filter((c) => UUID_RE.test(c));
      await supabase.from('leaderboard_virtual_companions').delete().eq('virtual_user_id', id);
      if (next.length) {
        await supabase.from('leaderboard_virtual_companions').insert(
          next.map((girlfriend_id) => ({ virtual_user_id: id, girlfriend_id })),
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** DELETE /api/admin/leaderboard?id= — 删除虚拟账号（连同分配关系） */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;
  const id = request.nextUrl.searchParams.get('id') || '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  try {
    await supabase.from('leaderboard_virtual_companions').delete().eq('virtual_user_id', id);
    const { error } = await supabase.from('leaderboard_virtual_users').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
