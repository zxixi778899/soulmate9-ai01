import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMembershipTier } from '@/lib/chat-models';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/membership?email=admin888@oxmate.com
 *
 * Tests both service-role and anon key access to diagnose RLS issues.
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

  // Service-role client (bypasses RLS)
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Anon client (respects RLS — same as user's client)
  const anonClient = createClient(supabaseUrl, anonKey || serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Service-role query (bypasses RLS)
  const { data: serviceProfile, error: serviceErr } = await adminClient
    .from('profiles')
    .select('*')
    .ilike('email', email)
    .maybeSingle();

  // 2. Anon query (respects RLS) — using the SAME select as stream/route.ts
  const { data: anonProfile, error: anonErr } = await anonClient
    .from('profiles')
    .select('role, membership_tier, credits_remaining')
    .ilike('email', email)
    .maybeSingle();

  // 3. Anon query with minimal columns
  const { data: anonMinimal, error: anonMinErr } = await anonClient
    .from('profiles')
    .select('membership_tier')
    .ilike('email', email)
    .maybeSingle();

  // 4. Check RLS status
  let rlsCheck: any = null;
  try { rlsCheck = await adminClient.rpc('check_rls_status' as any).single(); } catch { /* ignore */ }

  const serviceTier = resolveMembershipTier((serviceProfile as Record<string, unknown>) || null);
  const anonTier = resolveMembershipTier((anonProfile as Record<string, unknown>) || null);

  return NextResponse.json({
    query_email: email,
    service_role: {
      profile: serviceProfile,
      error: serviceErr?.message || null,
      resolved_tier: serviceTier,
    },
    anon_key: {
      profile_with_role: anonProfile,
      error_role_select: anonErr?.message || null,
      profile_minimal: anonMinimal,
      error_minimal: anonMinErr?.message || null,
      resolved_tier: anonTier,
    },
    diagnosis: {
      service_role_works: !!serviceProfile,
      anon_can_read_role: !!(anonProfile as any)?.role,
      anon_can_read_tier: !!(anonProfile as any)?.membership_tier,
      rls_may_be_blocking: !anonProfile && !!serviceProfile,
      actual_columns_on_profile: serviceProfile ? Object.keys(serviceProfile) : [],
    },
  });
}
