import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMembershipTier } from '@/lib/chat-models';
import { loadAiModules } from '@/lib/ai-modules';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/chat-tier?email=admin888@oxmate.com
 *
 * Simulates the EXACT same code path as /api/chat/stream for tier resolution.
 * Uses both service-role and anon key to diagnose.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email') || 'admin888@oxmate.com';

  const supabaseUrl = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_COZE_SUPABASE_URL;
  const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  // Service-role client
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Anon client (same as user's client)
  const anonClient = createClient(supabaseUrl, anonKey || serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // EXACT same query as stream route
  const selectCols = 'role, membership_tier, newbie_expires_at, timezone_offset';

  const { data: serviceProfile, error: serviceErr } = await adminClient
    .from('profiles')
    .select(selectCols)
    .ilike('email', email)
    .maybeSingle();

  const { data: anonProfile, error: anonErr } = await anonClient
    .from('profiles')
    .select(selectCols)
    .ilike('email', email)
    .maybeSingle();

  const serviceTier = resolveMembershipTier((serviceProfile as Record<string, unknown>) || null);
  const anonTier = resolveMembershipTier((anonProfile as Record<string, unknown>) || null);

  const aiModules = await loadAiModules();

  // Simulate stream route logic for anon result
  const anonProfileAny = anonProfile as Record<string, unknown> | null;
  const anonTierRoute = aiModules.chat.tiers[
    anonTier === 'unlimited' ? 'unlimited' : anonTier === 'pro' ? 'pro' : anonTier === 'basic' ? 'basic' : 'free'
  ];
  const anonEffectiveLimit =
    anonTierRoute?.daily_message_limit != null ? anonTierRoute.daily_message_limit : -1;
  const anonRole = String(anonProfileAny?.role || '').toLowerCase();
  const anonIsAdmin = anonRole === 'admin' || anonRole === 'superadmin';

  return NextResponse.json({
    service_role: {
      profile: serviceProfile,
      error: serviceErr?.message || null,
      resolved_tier: serviceTier,
    },
    anon_key: {
      profile: anonProfile,
      error: anonErr?.message || null,
      resolved_tier: anonTier,
      profileRole: anonRole,
      isAdminRole: anonIsAdmin,
      tierRoute_daily_limit: anonTierRoute?.daily_message_limit,
      effectiveDailyLimit: anonEffectiveLimit,
      will_be_blocked: !anonIsAdmin && anonEffectiveLimit >= 0,
      verdict: anonIsAdmin ? 'UNLIMITED' : `LIMITED to ${anonEffectiveLimit}`,
    },
    diagnosis: {
      anon_can_read_role: !!(anonProfile as any)?.role,
      anon_can_read_tier: !!(anonProfile as any)?.membership_tier,
      rls_blocking: !anonProfile && !!serviceProfile,
    },
  });
}
