import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  getCompanionContext,
  listVisibleAssets,
  type CompanionAsset,
} from '@/lib/companion-assets';
import { resolveImageUrl } from '@/lib/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/companion/[id]
 * 伴侣个人主页数据：基础信息 + 资源库（ID参考 / 相册 / 视频）。
 *
 * 可见性：
 *   - 创建者 / 管理员：全部资源（含私密）+ 审核状态
 *   - 已上架伴侣（is_public AND approved）：任何人可见基础信息 + 公开资源
 *   - 其余情况：仅创建者/管理员可见该伴侣主页
 */

const PUBLIC_GF_FIELDS = [
  'id',
  'slug',
  'name',
  'age',
  'gender',
  'tags',
  'short_description',
  'personality',
  'backstory',
  'occupation',
  'hobbies',
  'relationship',
  'voice',
  'rarity',
  'portrait_url',
  'avatar_url',
  'image_url',
  'card_url',
  'avatar_video_url',
  'portrait_video_url',
  'hot_score',
  'base_intimacy',
  'base_desire',
  'base_development',
  'base_kink',
  'access_status',
  'is_featured',
  'is_hot',
  'created_at',
];

function pickPublicGirlfriend(g: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_GF_FIELDS) out[k] = g[k];
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    let userId: string | null = null;
    let client: SupabaseClient | null = null;
    let isAdmin = false;

    const adminCheck = await requireAdmin(request);
    if (!adminCheck.error) {
      isAdmin = true;
      userId = adminCheck.user.id;
      client = adminCheck.supabase;
    } else {
      const auth = await getAuthUser(request);
      if (auth.user && auth.client) {
        userId = auth.user.id;
        client = auth.client;
      }
    }

    if (!client) {
      // Anonymous guest — may read published profiles only;
      // visibility rules below keep private companions gated.
      try {
        client = getSupabaseClient();
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const ctx = await getCompanionContext(client, userId, id, isAdmin);
    if (!ctx) {
      return NextResponse.json({ error: 'Companion not found' }, { status: 404 });
    }

    if (!ctx.canManage && !ctx.isPublished) {
      return NextResponse.json(
        { error: 'This companion is private.' },
        { status: 403 },
      );
    }

    // Resolve primary media for the header
    const g = ctx.girlfriend;
    const portrait_url = await resolveImageUrl(g.portrait_url as string | null);
    const avatar_url = await resolveImageUrl(
      (g.avatar_url as string | null) || (portrait_url ?? null),
    );
    const card_url = await resolveImageUrl(g.card_url as string | null);
    const image_url = portrait_url || avatar_url || card_url || null;

    const girlfriend: Record<string, unknown> = ctx.canManage
      ? { ...g, portrait_url, avatar_url, card_url, image_url }
      : { ...pickPublicGirlfriend(g), portrait_url, avatar_url, card_url, image_url };

    // Friend row → chat CTA target
    let friendId: string | null = null;
    if (userId) {
      const { data: friendRow } = await client
        .from('user_friends')
        .select('id')
        .eq('user_id', userId)
        .eq('girlfriend_id', id)
        .maybeSingle();
      friendId = (friendRow as { id?: string } | null)?.id || null;
    }

    const assets = await listVisibleAssets(client, ctx);
    const grouped = {
      id_reference: assets.filter((a) => a.category === 'id_reference'),
      photo: assets.filter((a) => a.category === 'photo'),
      video: assets.filter((a) => a.category === 'video'),
    };

    return NextResponse.json({
      girlfriend,
      access: {
        isOwner: ctx.isOwner,
        isAdmin: ctx.isAdmin,
        canManage: ctx.canManage,
        isPublished: ctx.isPublished,
        friendId,
      },
      assets: grouped,
      counts: {
        id_reference: grouped.id_reference.length,
        photo: grouped.photo.length,
        video: grouped.video.length,
      },
    });
  } catch (e) {
    logger.error('[companion/profile] GET failed', {
      id,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: 'Failed to load companion' }, { status: 500 });
  }
}

export type CompanionProfileAsset = CompanionAsset;
