import { getAuthUser } from './supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextResponse } from 'next/server';

/**
 * Admin 角色等级（数值越大权限越大）
 * - reviewer: 内容审核
 * - admin:    一般运营
 * - superadmin: 超级管理员（可改用户角色、删数据）
 */
export type AdminRole = 'reviewer' | 'admin' | 'superadmin';

const ROLE_LEVEL: Record<AdminRole, number> = {
  reviewer: 1,
  admin: 2,
  superadmin: 3,
};

function meetsRole(role: string | null | undefined, min: AdminRole): boolean {
  if (!role) return false;
  const have = ROLE_LEVEL[role as AdminRole];
  if (!have) return false;
  return have >= ROLE_LEVEL[min];
}

/**
 * 开发环境 admin 邮箱白名单兜底（生产环境**忽略**此白名单，仅信 DB role）
 * 通过 ALLOWED_ADMIN_EMAILS=foo@x.com,bar@x.com 配置
 */
function devEmailWhitelist(): string[] {
  if (process.env.NODE_ENV === 'production') return [];
  const raw = process.env.ALLOWED_ADMIN_EMAILS || '';
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Require admin role. Returns a NextResponse error if not authorized.
 * Returns the authenticated user on success.
 *
 * @param request - HTTP request
 * @param minRole - 所需最低角色（默认 admin）
 */
export async function requireAdmin(request: Request, minRole: AdminRole = 'admin') {
  const { user, error } = await getAuthUser(request);
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = getSupabaseClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, membership_tier, credits_remaining, email')
    .eq('user_id', user.id)
    .single();

  let isAdmin = meetsRole(profile?.role as string | undefined, minRole);

  // 开发环境兜底：邮箱白名单（生产环境忽略，避免白名单泄露导致越权）
  if (!isAdmin && process.env.NODE_ENV !== 'production') {
    const email = (user.email || profile?.email || '').toLowerCase();
    if (email && devEmailWhitelist().includes(email)) {
      isAdmin = true;
    }
  }

  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }) };
  }

  return { user, profile, supabase };
}

/**
 * 调试页 / 开发页守卫
 * 在生产环境返回 404，避免暴露 LLM 调试 / prompts 调试等内部工具
 */
export function denyInProduction(): NextResponse | null {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}