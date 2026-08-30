/**
 * Shared quota helpers for image/video generation routes.
 *
 * Consolidates previously duplicated logic across /api/generate-image and
 * /api/chat/generate-image:
 *  - membership tier parsing
 *  - timezone-aware daily-limit counting (profiles.timezone_offset, minutes)
 *
 * Rate limiting: all user-facing image entries share ONE counter key
 * (`image-gen:{userId}`) so limits cannot be stacked across routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MembershipTier } from '@/lib/ai-modules';

/** Shared hourly rate-limit key for every user-facing image generation entry. */
export const IMAGE_GEN_RATE_KEY = 'image-gen';

export function membershipFromProfile(
  profile: Record<string, unknown> | null,
): MembershipTier {
  // Resolve tier from BOTH role and membership_tier columns — return the higher one.
  const TIER_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, premium: 2, unlimited: 3 };

  const role = String(profile?.role || '').toLowerCase();
  const roleTier: MembershipTier =
    role === 'admin' || role === 'superadmin' ? 'unlimited' : 'free';

  const raw = String(
    profile?.membership_tier || profile?.subscription_tier || profile?.plan || 'free',
  ).toLowerCase();
  let colTier: MembershipTier = 'free';
  if (raw.includes('unlimit') || raw === 'admin') colTier = 'unlimited';
  else if (raw.includes('pro') || raw.includes('plus') || raw.includes('premium')) colTier = 'pro';

  return (TIER_RANK[colTier] ?? 0) >= (TIER_RANK[roleTier] ?? 0) ? colTier : roleTier;
}

/**
 * Start of the user's local day expressed as a UTC ISO timestamp.
 * timezoneOffsetMinutes comes from profiles.timezone_offset (UTC minutes).
 */
export function localDayStartIso(timezoneOffsetMinutes: number): string {
  const offsetMs = (Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0) * 60_000;
  const localNow = new Date(Date.now() + offsetMs);
  const localMidnightUtcMs =
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - offsetMs;
  return new Date(localMidnightUtcMs).toISOString();
}

export interface DailyUsageCheck {
  used: number;
  exceeded: boolean;
}

/**
 * Count today's successful image generations for a user, using the user's
 * local day boundary instead of UTC midnight.
 */
export async function countTodayImageUsage(
  client: SupabaseClient,
  userId: string,
  timezoneOffsetMinutes: number,
): Promise<DailyUsageCheck> {
  const dayStart = localDayStartIso(timezoneOffsetMinutes);
  const { count } = await client
    .from('ai_model_usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('task_type', 'image_generation')
    .eq('success', true)
    .gte('created_at', dayStart);
  return { used: count || 0, exceeded: false };
}

/** Fetch the profile fields quota checks need, in one query. */
export async function loadQuotaProfile(
  client: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await client
    .from('profiles')
    .select('role, membership_tier, subscription_tier, plan, timezone_offset, credits_remaining')
    .eq('id', userId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) || null;
}

export function timezoneOffsetFromProfile(
  profile: Record<string, unknown> | null,
): number {
  const raw = profile?.timezone_offset;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}
