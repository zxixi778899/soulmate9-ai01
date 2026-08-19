/**
 * Companion friend-seat limits: tier base + permanent purchased extras.
 * Seat packages are no longer sold; existing bonus seats remain functional.
 */
import { baseCompanionSeatLimit } from '@/lib/constants';
import { logger } from '@/lib/logger';

/** @deprecated Seat packs removed — kept for backward-compat with existing purchases. */
export const COMPANION_SEAT_PACKAGES: readonly { id: string; name: string; seats: number; price_cents: number; sort_order: number }[] = [];

/** Awaitable supabase query result shape used by this module.
 * `data` stays `unknown` so real SupabaseClient builders are structurally
 * assignable; call sites narrow with explicit casts below. */
type SeatAwaitable = PromiseLike<{
  data: unknown;
  error: { message: string } | null;
  count: number | null;
}>;

export type SeatClient = {
  from: (table: string) => {
    select: (columns: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) => {
      eq: (column: string, value: string) => SeatAwaitable & {
        eq: (column: string, value: string) => SeatAwaitable;
        maybeSingle: () => SeatAwaitable;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => SeatAwaitable;
    };
  };
};

export type SeatStatus = {
  tier: string;
  baseLimit: number; // -1 unlimited
  bonusSeats: number;
  effectiveLimit: number; // -1 unlimited
  used: number; // public friends only
  createdCount: number; // creation-card companions (independent, not counted in used)
  remaining: number | null; // null unlimited
  canAdd: boolean;
};

/** Values a caller may have already fetched — skips the matching round-trips. */
export type SeatPreload = {
  tier?: string;
  bonusSeats?: number;
  used?: number;
  createdCount?: number;
};

export function packageById(id: string) {
  return COMPANION_SEAT_PACKAGES.find((p) => p.id === id) || null;
}

export async function getBonusSeats(client: SeatClient, userId: string): Promise<number> {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('extra_girlfriend_slots, membership_tier')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      // Column may not exist yet — treat as 0
      logger.warn('[companion-seats] read bonus failed', { error: error.message });
      return 0;
    }
    return Math.max(0, Number((data as { extra_girlfriend_slots?: number } | null)?.extra_girlfriend_slots || 0));
  } catch (err) {
    logger.warn('[companion-seats] bonus unexpected', { err: String(err) });
    return 0;
  }
}

export async function countOwnedCompanions(client: SeatClient, userId: string): Promise<number> {
  // Friend seats count ONLY friends added from the public catalog
  // (source='public'). Companions created with a creation card
  // (source='created') are tracked separately and never occupy friend seats.
  const { count, error } = await client
    .from('user_friends')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'public');
  if (error) {
    logger.warn('[companion-seats] count failed', { error: error.message });
    return 0;
  }
  return count || 0;
}

/** Companions created via creation cards — independent of the friend limit. */
export async function countCreatedCompanions(client: SeatClient, userId: string): Promise<number> {
  const { count, error } = await client
    .from('user_friends')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'created');
  if (error) {
    logger.warn('[companion-seats] created count failed', { error: error.message });
    return 0;
  }
  return count || 0;
}

export async function getSeatStatus(
  client: SeatClient,
  userId: string,
  preload?: SeatPreload,
): Promise<SeatStatus> {
  let tier = preload?.tier;
  if (tier === undefined) {
    tier = 'free';
    try {
      const { data, error } = await client
        .from('profiles')
        .select('membership_tier')
        .eq('user_id', userId)
        .maybeSingle();
      if (!error) {
        tier = (data as { membership_tier?: string } | null)?.membership_tier || 'free';
      } else {
        logger.warn('[companion-seats] read tier failed', { error: error.message });
      }
    } catch {
      // keep default tier
    }
  }
  // Bonus seats live in an optional column; read separately so a missing
  // column never corrupts the tier read above (which would downgrade the user
  // to 'free' and falsely trigger SEAT_LIMIT).
  const bonus = preload?.bonusSeats ?? (await getBonusSeats(client, userId));
  const baseLimit = baseCompanionSeatLimit(tier);
  const [used, createdCount] = await Promise.all([
    preload?.used ?? countOwnedCompanions(client, userId),
    preload?.createdCount ?? countCreatedCompanions(client, userId),
  ]);
  if (baseLimit < 0) {
    return {
      tier,
      baseLimit: -1,
      bonusSeats: bonus,
      effectiveLimit: -1,
      used,
      createdCount,
      remaining: null,
      canAdd: true,
    };
  }
  const effectiveLimit = baseLimit + bonus;
  const remaining = Math.max(0, effectiveLimit - used);
  return {
    tier,
    baseLimit,
    bonusSeats: bonus,
    effectiveLimit,
    used,
    createdCount,
    remaining,
    canAdd: remaining > 0,
  };
}

export async function assertCanAddCompanion(
  client: SeatClient,
  userId: string,
): Promise<{ ok: true; seats: SeatStatus } | { ok: false; seats: SeatStatus; error: string; code: string }> {
  const seats = await getSeatStatus(client, userId);
  if (seats.canAdd) return { ok: true, seats };
  return {
    ok: false,
    seats,
    code: 'SEAT_LIMIT',
    error: `Friend limit reached (${seats.used}/${seats.effectiveLimit}). Upgrade your plan to add more friends. Creation-card companions don't count toward this limit.`,
  };
}

export async function grantBonusSeats(
  client: SeatClient,
  userId: string,
  seats: number,
): Promise<number> {
  const n = Math.max(0, Math.floor(seats));
  if (n <= 0) return 0;
  const { data } = await client
    .from('profiles')
    .select('extra_girlfriend_slots')
    .eq('user_id', userId)
    .maybeSingle();
  const current = Math.max(0, Number((data as { extra_girlfriend_slots?: number } | null)?.extra_girlfriend_slots || 0));
  const next = current + n;
  const { error } = await client
    .from('profiles')
    .update({ extra_girlfriend_slots: next, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    // Best-effort fallback if column missing: log and rethrow for caller
    logger.error('[companion-seats] grant failed', { error: error.message, userId, seats: n });
    throw new Error(error.message);
  }
  return next;
}
