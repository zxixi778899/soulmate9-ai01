/**
 * Creation card economy — quota management for creating girlfriends.
 *
 * Quota rules:
 * - Free tier: 1 free card (one-time, claimed on first registration)
 * - Pro tier: 3 cards per month (auto-refill on first access each month)
 * - Unlimited tier: 5 cards per month (auto-refill on first access each month)
 *
 * Cards can also be purchased from the shop.
 */
import { logger } from '@/lib/logger';

export type CardClient = {
  from: (table: string) => any;
};

export type CreationCardStatus = {
  cards: number;
  monthlyQuota: number;
  tier: string;
  lastRefill: string | null;
  canCreate: boolean;
  nextRefillAt: string | null;
};

/** Get the monthly quota based on membership tier. */
function getMonthlyQuota(tier: string): number {
  if (tier === 'unlimited') return 5;
  if (tier === 'pro') return 3;
  return 0; // free tier only gets the one-time free card
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
  let cards = 1;
  let lastRefill: string | null = null;
  let freeClaimed = false;

  try {
    const { data } = await client
      .from('profiles')
      .select('membership_tier, creation_cards, creation_card_last_refill, free_card_claimed')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      tier = (data as any).membership_tier || 'free';
      cards = (data as any).creation_cards ?? 1;
      lastRefill = (data as any).creation_card_last_refill;
      freeClaimed = (data as any).free_card_claimed ?? false;
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
 * Consume one creation card. Returns false if no cards available.
 */
export async function consumeCreationCard(
  client: CardClient,
  userId: string,
): Promise<{ ok: boolean; remaining: number }> {
  const status = await getCreationCardStatus(client, userId);
  if (status.cards <= 0) {
    return { ok: false, remaining: 0 };
  }

  const newCards = status.cards - 1;
  try {
    const { error } = await client
      .from('profiles')
      .update({ creation_cards: newCards })
      .eq('user_id', userId);

    if (error) {
      logger.error('[creation-cards] consume failed', { error: error.message, userId });
      return { ok: false, remaining: status.cards };
    }
    return { ok: true, remaining: newCards };
  } catch (err) {
    logger.error('[creation-cards] consume error', { err: String(err) });
    return { ok: false, remaining: status.cards };
  }
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

    const current = (data as any)?.creation_cards ?? 0;
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
