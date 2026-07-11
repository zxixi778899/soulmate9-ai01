/**
 * Companion friend-seat limits: tier base + permanent purchased extras.
 */
import { baseCompanionSeatLimit, COMPANION_SEAT_PACKAGES } from '@/lib/constants';
import { logger } from '@/lib/logger';

export type SeatClient = {
  from: (table: string) => any;
};

export type SeatStatus = {
  tier: string;
  baseLimit: number; // -1 unlimited
  bonusSeats: number;
  effectiveLimit: number; // -1 unlimited
  used: number;
  remaining: number | null; // null unlimited
  canAdd: boolean;
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
  const { count, error } = await client
    .from('girlfriends')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) {
    logger.warn('[companion-seats] count failed', { error: error.message });
    return 0;
  }
  return count || 0;
}

export async function getSeatStatus(client: SeatClient, userId: string): Promise<SeatStatus> {
  let tier = 'free';
  let bonus = 0;
  try {
    const { data } = await client
      .from('profiles')
      .select('membership_tier, extra_girlfriend_slots')
      .eq('user_id', userId)
      .maybeSingle();
    tier = (data as { membership_tier?: string } | null)?.membership_tier || 'free';
    bonus = Math.max(0, Number((data as { extra_girlfriend_slots?: number } | null)?.extra_girlfriend_slots || 0));
  } catch {
    bonus = 0;
  }
  const baseLimit = baseCompanionSeatLimit(tier);
  const used = await countOwnedCompanions(client, userId);
  if (baseLimit < 0) {
    return {
      tier,
      baseLimit: -1,
      bonusSeats: bonus,
      effectiveLimit: -1,
      used,
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
    error: `Companion seat limit reached (${seats.used}/${seats.effectiveLimit}). Upgrade your plan or buy more seats.`,
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
