import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { resolveMembershipTier } from '@/lib/chat-models';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/membership
 * Returns the raw profile and resolved tier for the current user.
 * Use this to diagnose membership issues — check that role and membership_tier
 * are what you expect in the database.
 */
export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile, error } = await client
    .from('profiles')
    .select('role, membership_tier, subscription_tier, plan, email, user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const tier = resolveMembershipTier((profile as Record<string, unknown>) || null);

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    raw_profile: profile,
    profile_error: error?.message || null,
    resolved_tier: tier,
    auth_user_role: user.role || null,
    auth_user_metadata_role: user.user_metadata?.role || null,
    auth_app_metadata_role: user.app_metadata?.role || null,
  });
}
