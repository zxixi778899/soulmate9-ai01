import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  getCompanionContext,
  listVisibleAssets,
  normalizeCategory,
  normalizeVisibility,
} from '@/lib/companion-assets';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * /api/companion/[id]/assets — 伴侣资源库 CRUD
 *
 * GET    ?category=id_reference|photo|video   列出可见资源
 * POST   添加资源（创建者/管理员）
 * PATCH  修改可见性/描述/排序（创建者/管理员）
 * DELETE ?assetId= 删除资源（创建者/管理员）
 */

async function resolveCtx(request: NextRequest, girlfriendId: string) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.error) {
    const ctx = await getCompanionContext(
      adminCheck.supabase,
      adminCheck.user.id,
      girlfriendId,
      true,
    );
    return {
      ctx,
      client: adminCheck.supabase as SupabaseClient,
      unauthorized: false,
      userId: adminCheck.user.id as string | null,
    };
  }
  const auth = await getAuthUser(request);
  if (!auth.user || !auth.client) {
    return { ctx: null, client: null, unauthorized: true, userId: null };
  }
  const ctx = await getCompanionContext(auth.client, auth.user.id, girlfriendId, false);
  return { ctx, client: auth.client, unauthorized: false, userId: auth.user.id as string | null };
}

function looksLikeAssetUrl(raw: string): boolean {
  const u = raw.trim();
  if (!u) return false;
  if (/^https?:\/\//i.test(u)) return true;
  if (/^data:image\//i.test(u)) return true;
  // bare storage key like girlfriends/abc/x.png
  return u.includes('/') && !u.includes(' ') && u.length < 500;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    let { ctx, client } = await resolveCtx(request, id);
    if (!ctx || !client) {
      // Anonymous fallback: guests may read public assets of published companions.
      client = getSupabaseClient() as SupabaseClient;
      ctx = await getCompanionContext(client, null, id, false);
    }
    if (!ctx || !client) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }
    if (!ctx.canManage && !ctx.isPublished) {
      return NextResponse.json({ error: 'This companion is private.' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const category = normalizeCategory(searchParams.get('category'));
    const assets = await listVisibleAssets(client, ctx, category);
    return NextResponse.json({ assets });
  } catch (e) {
    logger.error('[companion/assets] GET failed', { id, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Failed to load assets' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { ctx, client, unauthorized, userId } = await resolveCtx(request, id);
    if (unauthorized || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ctx) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }
    if (!ctx.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const category = normalizeCategory(body.category);
    if (!category) {
      return NextResponse.json(
        { error: 'category must be one of id_reference | photo | video' },
        { status: 400 },
      );
    }
    const url = String(body.url || '').trim();
    if (!looksLikeAssetUrl(url)) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const isVideo =
      category === 'video' ||
      /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ||
      String(body.media_type || '') === 'video';

    const thumbnail = String(body.thumbnail_url || '').trim();
    const row = {
      girlfriend_id: id,
      category,
      media_type: isVideo ? 'video' : 'image',
      url,
      thumbnail_url: thumbnail || null,
      caption: body.caption ? String(body.caption).slice(0, 300) : null,
      visibility: normalizeVisibility(body.visibility),
      sort_order: Math.round(Number(body.sort_order) || 0),
      meta: body.meta && typeof body.meta === 'object' ? body.meta : {},
      uploaded_by: userId,
    };

    const { data, error } = await client
      .from('companion_assets')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ asset: data }, { status: 201 });
  } catch (e) {
    logger.error('[companion/assets] POST failed', { id, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Failed to add asset' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { ctx, client, unauthorized } = await resolveCtx(request, id);
    if (unauthorized || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ctx) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    if (!ctx.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const assetId = String(body.assetId || body.id || '').trim();
    if (!assetId) {
      return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('visibility' in body) updates.visibility = normalizeVisibility(body.visibility);
    if ('caption' in body) {
      updates.caption = body.caption ? String(body.caption).slice(0, 300) : null;
    }
    if ('sort_order' in body) updates.sort_order = Math.round(Number(body.sort_order) || 0);
    if ('url' in body) {
      const u = String(body.url || '').trim();
      if (!looksLikeAssetUrl(u)) {
        return NextResponse.json({ error: 'invalid url' }, { status: 400 });
      }
      updates.url = u;
    }
    if ('thumbnail_url' in body) {
      updates.thumbnail_url = String(body.thumbnail_url || '').trim() || null;
    }

    const { data, error } = await client
      .from('companion_assets')
      .update(updates)
      .eq('id', assetId)
      .eq('girlfriend_id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    return NextResponse.json({ asset: data });
  } catch (e) {
    logger.error('[companion/assets] PATCH failed', { id, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { ctx, client, unauthorized } = await resolveCtx(request, id);
    if (unauthorized || !client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!ctx) return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    if (!ctx.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const assetId = (searchParams.get('assetId') || '').trim();
    if (!assetId) {
      return NextResponse.json({ error: 'assetId is required' }, { status: 400 });
    }

    const { error, count } = await client
      .from('companion_assets')
      .delete({ count: 'exact' })
      .eq('id', assetId)
      .eq('girlfriend_id', id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error('[companion/assets] DELETE failed', { id, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
  }
}
