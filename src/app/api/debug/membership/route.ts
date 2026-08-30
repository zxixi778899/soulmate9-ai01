import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMembershipTier } from '@/lib/chat-models';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/membership?email=admin888@oxmate.com
 *
 * Debug endpoint — uses service-role key to query profiles directly.
 * Only selects columns that ACTUALLY EXIST in the database.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email') || 'admin888@oxmate.com';

  const supabaseUrl = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_COZE_SUPABASE_URL;
  const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Only select columns that DEFINITELY exist (avoid subscription_tier / plan)
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, user_id, email, role, membership_tier, credits_remaining')
    .ilike('email', email)
    .maybeSingle();

  // Also try a raw column check — list all columns via a SELECT *
  const { data: allCols, error: allColsErr } = await admin
    .from('profiles')
    .select('*')
    .ilike('email', email)
    .maybeSingle();

  const resolvedTier = resolveMembershipTier(
    (profile as Record<string, unknown>) || null,
  );

  return NextResponse.json({
    query_email: email,
    raw_profile: profile,
    profile_error: profileErr?.message || null,
    all_columns: allCols ? Object.keys(allCols) : [],
    all_cols_error: allColsErr?.message || null,
    resolved_tier: resolvedTier,
    diagnosis: {
      role: profile?.role ?? 'MISSING',
      membership_tier: profile?.membership_tier ?? 'MISSING',
      resolved_unlimited: resolvedTier === 'unlimited',
    },
  });
}
