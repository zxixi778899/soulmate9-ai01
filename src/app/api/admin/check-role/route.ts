import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isWhitelistedAdminEmail } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error || !user) {
      return NextResponse.json(
        {
          isAdmin: false,
          reason: 'unauthorized',
          detail: error || 'No session',
        },
        { status: 401 },
      );
    }

    let profile: { role?: string; email?: string } | null = null;
    let profileError: string | null = null;
    try {
      const supabase = getSupabaseClient();
      const res = await supabase
        .from('profiles')
        .select('role, email')
        .eq('user_id', user.id)
        .maybeSingle();
      profile = res.data;
      profileError = res.error?.message || null;
    } catch (e) {
      profileError = e instanceof Error ? e.message : String(e);
    }

    let role = profile?.role || 'user';
    let isAdmin = role === 'admin' || role === 'superadmin' || role === 'reviewer';
    let via: 'role' | 'email_whitelist' | null = isAdmin ? 'role' : null;

    // Bootstrap: ALLOWED_ADMIN_EMAILS (works in production when env is set)
    if (!isAdmin) {
      const email = (user.email || profile?.email || '').toLowerCase();
      if (isWhitelistedAdminEmail(email)) {
        isAdmin = true;
        via = 'email_whitelist';
        if (role === 'user') role = 'admin';
      }
    }

    return NextResponse.json({
      isAdmin,
      role,
      via,
      email: user.email || profile?.email || null,
      hasProfile: !!profile,
      profileError,
      // Help first-time setup without leaking secrets
      whitelistConfigured: !!(process.env.ALLOWED_ADMIN_EMAILS || '').trim(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        isAdmin: false,
        reason: 'error',
        detail: e instanceof Error ? e.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
