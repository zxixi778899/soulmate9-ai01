import { getAuthUser } from './supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextResponse } from 'next/server';

/**
 * Admin roles (higher includes lower privileges)
 * - reviewer
 * - admin
 * - superadmin
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
 * Bootstrap admin via env (works in production when set intentionally).
 * ALLOWED_ADMIN_EMAILS=you@example.com,other@example.com
 */
export function adminEmailWhitelist(): string[] {
  const raw = process.env.ALLOWED_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isWhitelistedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const list = adminEmailWhitelist();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

/**
 * Require admin role. Returns a NextResponse error if not authorized.
 *
 * Authorization order:
 * 1) profiles.role in DB (admin | superadmin | reviewer)
 * 2) ALLOWED_ADMIN_EMAILS env whitelist (bootstrap for prod/dev)
 */
export async function requireAdmin(request: Request, minRole: AdminRole = 'admin') {
  const { user, error } = await getAuthUser(request);
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (e) {
    return {
      error: NextResponse.json(
        {
          error: 'Server misconfigured: Supabase client unavailable',
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, membership_tier, credits_remaining, email, user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let role = (profile?.role as string | undefined) || 'user';
  let isAdmin = meetsRole(role, minRole);

  // Email whitelist bootstrap (production + development)
  if (!isAdmin) {
    const email = (user.email || profile?.email || '').toLowerCase();
    if (isWhitelistedAdminEmail(email)) {
      isAdmin = true;
      // Treat whitelist as full admin for route access
      if (!meetsRole(role, minRole)) role = minRole;
    }
  }

  if (!isAdmin) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden: Admin access required',
          hint:
            'Set profiles.role = admin in Supabase for your user, or add your email to ALLOWED_ADMIN_EMAILS on Vercel and redeploy.',
          hasProfile: !!profile,
          profileError: profileError?.message || null,
        },
        { status: 403 },
      ),
    };
  }

  return { user, profile: profile || { role, email: user.email }, supabase };
}

/**
 * Debug / destructive routes: blocked in production unless ENABLE_DEBUG_ROUTES=true
 */
export function denyInProduction(): NextResponse | null {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}
