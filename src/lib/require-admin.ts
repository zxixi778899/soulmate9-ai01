import { getAuthUser } from './supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextResponse } from 'next/server';

/**
 * Admin 
 * - reviewer: 
 * - admin:    
 * - superadmin: 
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
 *  admin **** DB role
 *  ALLOWED_ADMIN_EMAILS=foo@x.com,bar@x.com 
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
 * @param minRole -  admin
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

  // 
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
 *  / 
 *  404 LLM  / prompts 
 */
export function denyInProduction(): NextResponse | null {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}