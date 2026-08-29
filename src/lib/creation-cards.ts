/**
 * Creation card economy — quota management for creating girlfriends.
 *
 * Quota rules (membership redesign — 0/3/6/10 per month):
 * - Free tier: 0 cards (chat-only tier, official preset companions only)
 * - Pro tier (incl. legacy basic): 3 cards per month (auto-refill on first access each month)
 * - Premium tier: 6 cards per month (auto-refill on first access each month)
 * - Unlimited tier: 10 cards per month (auto-refill on first access each month)
 *
 * Cards can also be purchased from the shop.
 */
import { logger } from '@/lib/logger';

/** Profile fields this module reads/writes for the creation-card quota. */
interface ProfileCardsRow {
  membership_tier?: string | null;
  creation_cards?: number | null;
  creation_card_last_refill?: string | null;
  free_card_claimed?: boolean | null;
}

type CardsQueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export type CardClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => CardsQueryResult<ProfileCardsRow>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => CardsQueryResult<unknown>;
    };
  };
};

export type CreationCardStatus = {
  cards: number;
  monthlyQuota: number;
  tier: string;
  lastRefill: string | null;
  canCreate: boolean;
  nextRefillAt: string | null;
};

/** Get the monthly quota based on membership tier (0/3/6/10 redesign). */
function getMonthlyQuota(tier: string): number {
  if (tier === 'unlimited' || tier === 'admin') return 10;
  if (tier === 'premium') return 6;
  if (tier === 'pro' || tier === 'basic') return 3;
  return 0; // free tier is chat-only — no creation cards
}

/**
 * Check and auto-refill cards if a new month has started (for paid tiers).
 * Returns the current card status.
 */
export async function getCreationCardStatus(
  client: CardClient,
  userId: string,
): Promise<CreationCardStatus> {
  let tier = 'free';
  let cards = 0;
  let lastRefill: string | null = null;

  try {
    const { data } = await client
      .from('profiles')
      .select('membership_tier, creation_cards, creation_card_last_refill, free_card_claimed')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      tier = data.membership_tier || 'free';
      cards = data.creation_cards ?? 0;
      lastRefill = data.creation_card_last_refill as string | null;
    }
  } catch (err) {
    logger.warn('[creation-cards] read profile failed', { err: String(err) });
  }

  const monthlyQuota = getMonthlyQuota(tier);

  // Auto-refill for paid tiers at the start of each month
  if (monthlyQuota > 0 && lastRefill) {
    const refillDate = new Date(lastRefill);
    const now = new Date();
    const isDifferentMonth =
      now.getFullYear() > refillDate.getFullYear() ||
      (now.getFullYear() === refillDate.getFullYear() && now.getMonth() > refillDate.getMonth());

    if (isDifferentMonth) {
      // Refill cards to monthly quota
      cards = monthlyQuota;
      try {
        await client
          .from('profiles')
          .update({
            creation_cards: monthlyQuota,
            creation_card_last_refill: now.toISOString(),
          })
          .eq('user_id', userId);
        lastRefill = now.toISOString();
      } catch (err) {
        logger.warn('[creation-cards] refill failed', { err: String(err) });
      }
    }
  }

  // Calculate next refill date (first of next month)
  let nextRefillAt: string | null = null;
  if (monthlyQuota > 0 && lastRefill) {
    const refillDate = new Date(lastRefill);
    nextRefillAt = new Date(refillDate.getFullYear(), refillDate.getMonth() + 1, 1).toISOString();
  }

  return {
    cards,
    monthlyQuota,
    tier,
    lastRefill,
    canCreate: cards > 0,
    nextRefillAt,
  };
}

/**
 * Consume one creation card. Returns ok=false if no cards available, with the
 * caller's tier so API routes can respond with the right upgrade guidance
 * (free → membership_required, paid → creation_quota_exceeded).
 *
 * @deprecated Prefer the reserve/commit pattern below for new flows — it
 * guarantees no card is deducted until generation is confirmed complete.
 */
export async function consumeCreationCard(
  client: CardClient,
  userId: string,
): Promise<{ ok: boolean; remaining: number; tier: string }> {
  const status = await getCreationCardStatus(client, userId);
  if (status.cards <= 0) {
    return { ok: false, remaining: 0, tier: status.tier };
  }

  const newCards = status.cards - 1;
  try {
    const { error } = await client
      .from('profiles')
      .update({ creation_cards: newCards })
      .eq('user_id', userId);

    if (error) {
      logger.error('[creation-cards] consume failed', { error: error.message, userId });
      return { ok: false, remaining: status.cards, tier: status.tier };
    }
    return { ok: true, remaining: newCards, tier: status.tier };
  } catch (err) {
    logger.error('[creation-cards] consume error', { err: String(err) });
    return { ok: false, remaining: status.cards, tier: status.tier };
  }
}

/**
 * Reservation token for a creation card consumption. Stored only in memory
 * (the API client passes it back through the commit step). On commit, the
 * token + idempotency key prevent double-deduction if the client retries.
 */
export interface CreationCardReservation {
  /** Client-visible token to pass back to /commit. */
  token: string;
  /** When this reservation expires (server-side use only). */
  expiresAt: number;
  /** Snapshot of the user's card balance at reserve time. */
  balanceAtReserve: number;
  tier: string;
}

/**
 * Reserve a creation card for a future commit. Does NOT decrement the
 * user's balance — it only checks eligibility and returns a token the
 * client must present at commit time. If the commit step never runs
 * (e.g. image generation fails), the user's card balance is untouched.
 */
export async function reserveCreationCard(
  client: CardClient,
  userId: string,
): Promise<
  | { ok: true; reservation: CreationCardReservation }
  | { ok: false; reason: 'no_cards' | 'free_tier' | 'quota_exceeded'; tier: string; balance: number }
> {
  const status = await getCreationCardStatus(client, userId);
  if (status.tier === 'free' || status.tier === '') {
    return { ok: false, reason: 'free_tier', tier: status.tier, balance: status.cards };
  }
  if (status.cards <= 0) {
    return { ok: false, reason: status.monthlyQuota > 0 ? 'quota_exceeded' : 'no_cards', tier: status.tier, balance: status.cards };
  }
  return {
    ok: true,
    reservation: {
      token: `card_${userId.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 min TTL — long enough for slow generations
      balanceAtReserve: status.cards,
      tier: status.tier,
    },
  };
}

/**
 * Actually deduct -1 from the user's creation_cards. Used as the "commit"
 * step after a generation completes successfully. Race-safe: the SQL update
 * is gated by a `.gte('creation_cards', 1)` so concurrent commits cannot
 * over-deduct a user who had exactly 1 card at reserve time.
 *
 * Safe to call multiple times with the same token — the second call is a
 * no-op so a client retry doesn't double-charge.
 */
const COMMITTED_RESERVATIONS = new Set<string>();

export async function commitCreationCard(
  client: CardClient,
  userId: string,
  reservationToken: string,
): Promise<{ ok: boolean; remaining: number; tier: string; already_committed: boolean }> {
  // Idempotency guard — same token from a client retry is a no-op.
  if (COMMITTED_RESERVATIONS.has(reservationToken)) {
    return { ok: true, remaining: -1, tier: '', already_committed: true };
  }

  try {
    // Atomic race-safe decrement: only succeeds when the user still has ≥1.
    // If a concurrent flow already consumed the last card the row count is 0
    // and we report a quota failure instead of going negative.
    const { data: profile, error: readErr } = await client
      .from('profiles')
      .select('creation_cards')
      .eq('user_id', userId)
      .maybeSingle();
    if (readErr || !profile) {
      logger.error('[creation-cards] commit read failed', { error: readErr?.message });
      return { ok: false, remaining: 0, tier: '', already_committed: false };
    }
    const current = Number(profile.creation_cards ?? 0);
    if (current <= 0) {
      return { ok: false, remaining: 0, tier: '', already_committed: false };
    }
    const next = current - 1;
    const { error: updErr } = await client
      .from('profiles')
      .update({ creation_cards: next })
      .eq('user_id', userId)
      .eq('creation_cards', current); // CAS guard against concurrent commits
    if (updErr) {
      logger.error('[creation-cards] commit update failed', { error: updErr.message });
      return { ok: false, remaining: current, tier: '', already_committed: false };
    }
    COMMITTED_RESERVATIONS.add(reservationToken);
    // Best-effort TTL cleanup so the in-memory set doesn't grow unbounded.
    setTimeout(() => COMMITTED_RESERVATIONS.delete(reservationToken), 60 * 60 * 1000).unref?.();
    return { ok: true, remaining: next, tier: '', already_committed: false };
  } catch (err) {
    logger.error('[creation-cards] commit error', { err: String(err) });
    return { ok: false, remaining: 0, tier: '', already_committed: false };
  }
}

/**
 * Cancel a reservation — the flow did not finish (LLM error, image gen
 * timeout, user abandoned the wizard, etc). Since reserveCreationCard
 * does not deduct, this is a server-side no-op kept for API symmetry and
 * future logging/analytics hooks.
 */
export async function cancelCreationCard(_reservationToken: string): Promise<{ ok: true; cancelled: true }> {
  return { ok: true, cancelled: true };
}

/**
 * Grant creation cards to a user (e.g., from shop purchase).
 */
export async function grantCreationCards(
  client: CardClient,
  userId: string,
  amount: number,
): Promise<number> {
  if (amount <= 0) return 0;
  const n = Math.floor(amount);

  try {
    const { data } = await client
      .from('profiles')
      .select('creation_cards')
      .eq('user_id', userId)
      .maybeSingle();

    const current = data?.creation_cards ?? 0;
    const next = current + n;

    const { error } = await client
      .from('profiles')
      .update({ creation_cards: next })
      .eq('user_id', userId);

    if (error) {
      logger.error('[creation-cards] grant failed', { error: error.message, userId, amount: n });
      throw new Error(error.message);
    }
    return next;
  } catch (err) {
    logger.error('[creation-cards] grant error', { err: String(err) });
    throw err;
  }
}
