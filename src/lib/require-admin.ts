import { getAuthUser } from './supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextResponse } from 'next/server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const ADMIN_WRITE_LIMIT = { maxRequests: 300, windowMs: 60 * 60 * 1000 };

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
  if (!isAdmin && minRole !== 'superadmin') {
    const email = (user.email || profile?.email || '').toLowerCase();
    if (isWhitelistedAdminEmail(email)) {
      isAdmin = true;
      // Email bootstrap grants admin, never superadmin.
      if (!meetsRole(role, minRole)) role = minRole;
    }
  }

  if (profileError && !isWhitelistedAdminEmail(user.email)) {
    logger.error('admin authorization profile lookup failed', {
      userId: user.id,
      error: profileError.message,
    });
    return {
      error: NextResponse.json({ error: 'Authorization service unavailable' }, { status: 503 }),
    };
  }

  if (!isAdmin) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden: Admin access required',
          code: 'ADMIN_REQUIRED',
        },
        { status: 403 },
      ),
    };
  }


  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const limit = await checkRateLimitAsync(`admin-write:${user.id}`, ADMIN_WRITE_LIMIT);
    if (!limit.allowed) {
      return {
        error: NextResponse.json(
          { error: 'Too many admin write requests. Please try again later.' },
          { status: 429, headers: rateLimitHeaders(limit, ADMIN_WRITE_LIMIT) },
        ),
      };
    }
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
