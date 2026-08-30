import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { resolveMembershipTier } from '@/lib/chat-models';
import { loadAiModules } from '@/lib/ai-modules';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/chat-tier
 *
 * Simulates the EXACT same code path as /api/chat/stream for tier resolution.
 * Uses the user's auth client (same as stream route).
 * Returns all intermediate values so we can see exactly what's happening.
 */
export async function GET(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized — visit while logged in' }, { status: 401 });
  }

  // EXACT same query as /api/chat/stream/route.ts line 344-348
  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('role, membership_tier, newbie_expires_at, preferred_locale, locale, timezone_offset')
    .eq('user_id', user.id)
    .single();

  const profileAny = profile as Record<string, unknown> | null;
  const membershipTier = resolveMembershipTier(profileAny || null);

  const aiModules = await loadAiModules();
  const tierRoute = aiModules.chat.tiers[
    membershipTier === 'unlimited' ? 'unlimited' : membershipTier === 'pro' ? 'pro' : membershipTier === 'basic' ? 'basic' : 'free'
  ];

  const effectiveDailyLimit =
    tierRoute?.daily_message_limit != null
      ? tierRoute.daily_message_limit
      : -1; // fallback

  const profileRole = String(profileAny?.role || '').toLowerCase();
  const isAdminRole = profileRole === 'admin' || profileRole === 'superadmin';

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    raw_profile: profile,
    profile_error: profileErr?.message || null,
    resolved_tier: membershipTier,
    tierRoute_key: membershipTier === 'unlimited' ? 'unlimited' : 'free',
    tierRoute_daily_limit: tierRoute?.daily_message_limit,
    effectiveDailyLimit,
    profileRole,
    isAdminRole,
    will_be_blocked: !isAdminRole && effectiveDailyLimit >= 0,
    verdict: isAdminRole ? 'UNLIMITED — should not be blocked' : `LIMITED to ${effectiveDailyLimit}`,
  });
}
