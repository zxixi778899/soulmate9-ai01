import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMembershipTier } from '@/lib/chat-models';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/membership?email=admin888@oxmate.com
 *
 * Debug endpoint — uses service-role key to query profiles directly.
 * No auth required (this is a temporary diagnostic tool).
 *
 * Returns the raw profile columns and the resolved membership tier so
 * we can see exactly what the database holds for a given user.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email') || 'admin888@oxmate.com';

  const supabaseUrl = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_COZE_SUPABASE_URL;
  const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({
      error: 'Missing Supabase env vars',
      has_url: !!supabaseUrl,
      has_key: !!serviceKey,
    }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Look up the profile by email
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, user_id, email, role, membership_tier, subscription_tier, plan, credits_remaining')
    .ilike('email', email)
    .maybeSingle();

  // 2. Also look up in auth.users
  const { data: authUsers } = await admin.auth.admin.listUsers();
  const authUser = authUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  // 3. Resolve tier using the same function the app uses
  const resolvedTier = resolveMembershipTier(
    (profile as Record<string, unknown>) || null,
  );

  return NextResponse.json({
    query_email: email,
    raw_profile: profile,
    profile_error: profileErr?.message || null,
    auth_user: authUser
      ? { id: authUser.id, email: authUser.email, role: authUser.role }
      : null,
    resolved_tier: resolvedTier,
    diagnosis: {
      role_in_db: profile?.role ?? 'COLUMN MISSING',
      membership_tier_in_db: profile?.membership_tier ?? 'COLUMN MISSING',
      tier_will_be_unlimited: resolvedTier === 'unlimited',
    },
  }, { status: 200 });
}
