import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Companion access control — core product rule:
 *
 *   用户创建的伴侣默认私有，仅创建者本人可用；只有创建者提交发布、
 *   管理员审核通过后（is_public=true AND review_status='approved'）
 *   才进入公共资料库，其他用户添加为好友后方可使用。
 *
 * A user may USE (chat / generate images / send gifts / regenerate) a
 * companion when ANY of the following holds:
 *   1. They own it            — girlfriends.user_id = userId
 *   2. They added it          — a user_friends row exists (source='public')
 */

export interface CompanionAccess {
  allowed: boolean;
  isOwner: boolean;
  isFriend: boolean;
}

/**
 * Check whether `userId` can use companion `girlfriendId`.
 * Owner always passes; otherwise a user_friends row is required.
 */
export async function checkCompanionAccess(
  client: SupabaseClient,
  userId: string,
  girlfriendId: string,
): Promise<CompanionAccess> {
  if (!girlfriendId) return { allowed: false, isOwner: false, isFriend: false };

  // 1) Ownership — the creator always has access to their own companion,
  //    regardless of review state (draft / pending / rejected / approved).
  const { data: owned } = await client
    .from('girlfriends')
    .select('id, user_id')
    .eq('id', girlfriendId)
    .maybeSingle();

  if (!owned) return { allowed: false, isOwner: false, isFriend: false };

  if ((owned as { user_id?: string | null }).user_id === userId) {
    return { allowed: true, isOwner: true, isFriend: false };
  }

  // 2) Friendship — the companion was added from the public library.
  //    (Adding itself requires is_public=true AND review_status='approved',
  //    enforced by POST /api/friends, so no extra check needed here.)
  const { data: friendRow } = await client
    .from('user_friends')
    .select('id')
    .eq('user_id', userId)
    .eq('girlfriend_id', girlfriendId)
    .maybeSingle();

  if (friendRow) {
    return { allowed: true, isOwner: false, isFriend: true };
  }

  return { allowed: false, isOwner: false, isFriend: false };
}

/**
 * Same as checkCompanionAccess but throws nothing — returns a ready-to-send
 * 403 response descriptor when denied, so callers stay terse:
 *
 *   const gate = await assertCanUseCompanion(client, user.id, girlfriend_id);
 *   if (!gate.allowed) return NextResponse.json({ error: gate.error }, { status: 403 });
 */
export async function assertCanUseCompanion(
  client: SupabaseClient,
  userId: string,
  girlfriendId: string,
): Promise<CompanionAccess & { error?: string }> {
  const access = await checkCompanionAccess(client, userId, girlfriendId);
  if (!access.allowed) {
    return {
      ...access,
      error: 'This companion is private. Only the creator can use it.',
    };
  }
  return access;
}
