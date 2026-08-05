import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveImageUrl } from '@/lib/storage';

/**
 * Companion asset library — 伴侣资源库
 *
 * 每个伴侣的资源分为三类：
 *   id_reference  ID参考（角色一致性参考图，内部用途，默认私密）
 *   photo         相册
 *   video         视频
 *
 * 可见性规则：
 *   - 创建者本人 / 管理员：可见全部资源（含私密）
 *   - 其他用户：仅当伴侣已上架（is_public=true AND review_status='approved'）
 *     时可见 visibility='public' 的资源；公开照片/视频进入前端相册供用户使用。
 *   - 用户自建伴侣审核未通过时，资源仅创建者私人使用；通过后随伴侣进入系统伴侣库。
 */

export type AssetCategory = 'id_reference' | 'photo' | 'video';
export type AssetVisibility = 'public' | 'private';

export interface CompanionAsset {
  id: string;
  girlfriend_id: string;
  category: AssetCategory;
  media_type: 'image' | 'video';
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  visibility: AssetVisibility;
  sort_order: number;
  meta: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export const ASSET_CATEGORIES: AssetCategory[] = ['id_reference', 'photo', 'video'];

export interface CompanionContext {
  girlfriend: Record<string, unknown>;
  isAdmin: boolean;
  isOwner: boolean;
  /** owner or admin — may manage (add/edit/delete/toggle visibility) assets */
  canManage: boolean;
  /** companion is published to the system library */
  isPublished: boolean;
}

export function isCompanionPublished(g: Record<string, unknown>): boolean {
  return g.is_public === true && String(g.review_status || '') === 'approved';
}

/**
 * Load companion + caller's relationship to it.
 * Pass `isAdmin=true` when the request already passed requireAdmin().
 */
export async function getCompanionContext(
  client: SupabaseClient,
  userId: string | null,
  girlfriendId: string,
  isAdmin = false,
): Promise<CompanionContext | null> {
  const { data, error } = await client
    .from('girlfriends')
    .select('*')
    .eq('id', girlfriendId)
    .maybeSingle();
  if (error || !data) return null;

  const girlfriend = data as Record<string, unknown>;
  const isOwner = !!userId && girlfriend.user_id === userId;
  const isPublished = isCompanionPublished(girlfriend);
  return {
    girlfriend,
    isAdmin,
    isOwner,
    canManage: isAdmin || isOwner,
    isPublished,
  };
}

/**
 * Fetch the assets the caller is allowed to see.
 * canManage → everything; otherwise only public assets of a published companion.
 */
export async function listVisibleAssets(
  client: SupabaseClient,
  ctx: CompanionContext,
  category?: AssetCategory | null,
): Promise<CompanionAsset[]> {
  const canSeePrivate = ctx.canManage;
  if (!canSeePrivate && !ctx.isPublished) return [];

  let query = client
    .from('companion_assets')
    .select('*')
    .eq('girlfriend_id', String(ctx.girlfriend.id))
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200);

  if (category) query = query.eq('category', category);
  if (!canSeePrivate) query = query.eq('visibility', 'public');

  const { data, error } = await query;
  if (error || !data) return [];

  const assets = (data as unknown as CompanionAsset[]).filter(
    (a) => a.url && String(a.url).trim(),
  );
  return await resolveAssetUrls(assets);
}

/** Resolve storage keys to browser-usable URLs (batched per asset). */
export async function resolveAssetUrls(
  assets: CompanionAsset[],
): Promise<CompanionAsset[]> {
  return await Promise.all(
    assets.map(async (a) => ({
      ...a,
      url: (await resolveImageUrl(a.url)) || a.url,
      thumbnail_url: a.thumbnail_url
        ? (await resolveImageUrl(a.thumbnail_url)) || a.thumbnail_url
        : null,
    })),
  );
}

export function normalizeCategory(raw: unknown): AssetCategory | null {
  const s = String(raw || '');
  return ASSET_CATEGORIES.includes(s as AssetCategory) ? (s as AssetCategory) : null;
}

export function normalizeVisibility(raw: unknown): AssetVisibility {
  return String(raw) === 'public' ? 'public' : 'private';
}
