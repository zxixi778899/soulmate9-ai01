/**
 * Unified Credit System — single source of truth for all credit pricing.
 *
 * Base rate: 1000 credits = $9.90 USD  →  1 credit ≈ $0.0099
 *
 * All features consume from `profiles.credits_remaining` — the sole source of truth.
 * The legacy `user_tokens` mirror is no longer read or written by application code.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Exchange Rate ───────────────────────────────────────────────────────────

export const CREDIT_EXCHANGE = {
  credits: 1000,
  usd_cents: 990, // $9.90
} as const;

/** Convert credits to USD cents */
export function creditsToUsdCents(credits: number): number {
  return Math.round((credits / CREDIT_EXCHANGE.credits) * CREDIT_EXCHANGE.usd_cents);
}

/** Convert USD cents to credits */
export function usdCentsToCredits(cents: number): number {
  return Math.round((cents / CREDIT_EXCHANGE.usd_cents) * CREDIT_EXCHANGE.credits);
}

// ─── Daily Earnings ──────────────────────────────────────────────────────────

export const DAILY_CHECKIN_REWARD = 10; // flat 10 credits per day

// ─── Feature Costs (credits) ─────────────────────────────────────────────────
// Text chat is covered by subscription; Credits are for GPU media only.
// Failed / timed-out / rejected generations are auto-refunded.

export const CREDIT_COSTS = {
  /** Normal image generation */
  image_gen: 10,
  /** HD or multi-image generation */
  image_gen_hd: 10,
  /** Voice message (1–3 credits depending on length) */
  tts: 2,
  /** 5-second video */
  video_5s: 50,
  /** 10-second video */
  video_10s: 100,
} as const;

/** @deprecated backward-compat alias */
export const LEGACY_CREDIT_COSTS = {
  chat_message_extra: 0, // text is now subscription-only
  image_gen_extra: CREDIT_COSTS.image_gen,
  video_gen: CREDIT_COSTS.video_5s,
  tts_extra: CREDIT_COSTS.tts,
} as const;

export type CreditCostKey = keyof typeof CREDIT_COSTS;

// ─── Gift Costs (credits) ────────────────────────────────────────────────────

export const GIFT_CREDIT_COSTS: Record<string, number> = {
  rose: 5,
  lollipop: 10,
  chocolate: 15,
  perfume: 30,
  necklace: 50,
  teddy: 60,
  ring: 100,
  crown: 150,
  rocket: 250,
  castle: 500,
};

// ─── Credit Packages ─────────────────────────────────────────────────────────

export const TOKEN_PACKAGES = [
  { id: 'credits-100', name: 'Starter', token_count: 100, bonus_tokens: 0, price_cents: 499, sort_order: 1 },
  { id: 'credits-500', name: 'Popular', token_count: 500, bonus_tokens: 0, price_cents: 1999, sort_order: 2 },
  { id: 'credits-1200', name: 'Power User', token_count: 1200, bonus_tokens: 0, price_cents: 2999, sort_order: 3 },
] as const;

// ─── Ledger Reasons ──────────────────────────────────────────────────────────

export type CreditReason =
  | 'daily_checkin'
  | 'chat_extra'
  | 'image_gen_extra'
  | 'video_gen'
  | 'tts_extra'
  | 'media_gen'
  | 'gift_send'
  | 'shop_purchase'
  | 'token_purchase'
  | 'first_topup_bonus'
  | 'signup_bonus'
  | 'subscription_grant'
  | 'admin_grant'
  | 'refund'
  | 'achievement'
  | 'daily_quest'
  | 'quest_bonus';

// ─── Core Operations ─────────────────────────────────────────────────────────

/**
 * Atomically deduct credits from a user's balance.
 * Returns { ok, balance_after } or { ok: false, error }.
 */
export async function deductCredits(
  client: SupabaseClient,
  userId: string,
  amount: number,
  reason: CreditReason,
  refId?: string,
): Promise<{ ok: true; balance_after: number } | { ok: false; error: string }> {
  if (amount <= 0) return { ok: true, balance_after: 0 };

  // Try RPC first (atomic, race-safe)
  const { data, error } = await client.rpc('deduct_credits', {
    uid: userId,
    amount,
    reason: reason as string,
    ref_id: refId || null,
  });

  if (!error && data !== null && data !== undefined) {
    return { ok: true, balance_after: Number(data) };
  }

  // Fallback: manual atomic update with optimistic lock
  const { data: profile } = await client
    .from('profiles')
    .select('credits_remaining')
    .eq('user_id', userId)
    .single();

  const current = profile?.credits_remaining ?? 0;
  if (current < amount) {
    return { ok: false, error: 'insufficient_credits' };
  }

  const newBalance = current - amount;
  const { error: updateErr } = await client
    .from('profiles')
    .update({ credits_remaining: newBalance })
    .eq('user_id', userId)
    .gte('credits_remaining', amount);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  // Write ledger entry
  await client.from('user_credits_ledger').insert({
    user_id: userId,
    delta: -amount,
    reason,
    ref_id: refId || null,
    balance_after: newBalance,
  });

  return { ok: true, balance_after: newBalance };
}

/**
 * Grant credits to a user (check-in, purchase, admin, etc.)
 */
export async function grantCredits(
  client: SupabaseClient,
  userId: string,
  amount: number,
  reason: CreditReason,
  refId?: string,
): Promise<{ ok: true; balance_after: number } | { ok: false; error: string }> {
  if (amount <= 0) return { ok: true, balance_after: 0 };

  const { error } = await client.rpc('grant_credits', {
    uid: userId,
    amount,
  });

  if (error) {
    // Fallback manual
    const { data: profile } = await client
      .from('profiles')
      .select('credits_remaining')
      .eq('user_id', userId)
      .single();

    const current = profile?.credits_remaining ?? 0;
    const newBalance = current + amount;
    const { error: updateErr } = await client
      .from('profiles')
      .update({ credits_remaining: newBalance })
      .eq('user_id', userId);

    if (updateErr) return { ok: false, error: updateErr.message };

    await client.from('user_credits_ledger').insert({
      user_id: userId,
      delta: amount,
      reason,
      ref_id: refId || null,
      balance_after: newBalance,
    });

    return { ok: true, balance_after: newBalance };
  }

  // Write ledger entry (RPC may not write ledger for all reasons)
  const { data: profile } = await client
    .from('profiles')
    .select('credits_remaining')
    .eq('user_id', userId)
    .single();

  await client.from('user_credits_ledger').insert({
    user_id: userId,
    delta: amount,
    reason,
    ref_id: refId || null,
    balance_after: profile?.credits_remaining ?? amount,
  });

  return { ok: true, balance_after: profile?.credits_remaining ?? amount };
}

/**
 * Grant credits for a top-up purchase, applying the FIRST-TOP-UP DOUBLE
 * promotion: the very first credit purchase of a user's lifetime grants an
 * extra 100% bonus (once, idempotent).
 *
 * Call this instead of a bare grantCredits(..., 'token_purchase', ...) from
 * payment webhooks.
 */
export async function grantTopUpCredits(
  client: SupabaseClient,
  userId: string,
  amount: number,
  refId?: string,
): Promise<{ ok: boolean; bonus_applied: boolean; balance_after: number }> {
  const grant = await grantCredits(client, userId, amount, 'token_purchase', refId);
  if (!grant.ok) {
    return { ok: false, bonus_applied: false, balance_after: 0 };
  }

  try {
    // First top-up? Exactly one token_purchase ledger row (the one just
    // written) and no bonus granted yet.
    const { count: purchaseCount } = await client
      .from('user_credits_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('reason', 'token_purchase');

    const { count: bonusCount } = await client
      .from('user_credits_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('reason', 'first_topup_bonus');

    if ((purchaseCount || 0) <= 1 && (bonusCount || 0) === 0 && amount > 0) {
      const bonus = await grantCredits(
        client,
        userId,
        amount,
        'first_topup_bonus',
        refId ? `first:${refId}` : undefined,
      );
      return {
        ok: true,
        bonus_applied: bonus.ok,
        balance_after: bonus.ok ? bonus.balance_after : grant.balance_after,
      };
    }
  } catch {
    /* bonus detection is best-effort */
  }

  return { ok: true, bonus_applied: false, balance_after: grant.balance_after };
}

/**
 * Check if user has enough credits for an action.
 */
export async function checkCreditBalance(
  client: SupabaseClient,
  userId: string,
  required: number,
): Promise<{ sufficient: boolean; balance: number }> {
  const { data } = await client
    .from('profiles')
    .select('credits_remaining')
    .eq('user_id', userId)
    .single();

  const balance = data?.credits_remaining ?? 0;
  return { sufficient: balance >= required, balance };
}
