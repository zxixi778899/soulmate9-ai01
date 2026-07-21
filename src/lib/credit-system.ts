/**
 * Unified Credit System — single source of truth for all credit pricing.
 *
 * Base rate: 1000 credits = $9.90 USD  →  1 credit ≈ $0.0099
 *
 * All features consume from `profiles.credits_remaining` (canonical balance).
 * The `user_tokens` table is a legacy mirror kept in sync via apply_wallet_ledger.
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

export const CREDIT_COSTS = {
  /** Per message beyond membership daily limit */
  chat_message_extra: 2,
  /** Per image beyond membership daily limit */
  image_gen_extra: 20,
  /** Per video generation (always costs credits) */
  video_gen: 100,
  /** Per TTS beyond membership daily limit */
  tts_extra: 5,
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

// ─── Token Packages (aligned with 1000 = $9.90) ─────────────────────────────

export const TOKEN_PACKAGES = [
  { id: 'credits-500', name: 'Starter', token_count: 500, bonus_tokens: 0, price_cents: 499, sort_order: 1 },
  { id: 'credits-1000', name: 'Popular', token_count: 1000, bonus_tokens: 100, price_cents: 999, sort_order: 2 },
  { id: 'credits-2500', name: 'Best Value', token_count: 2500, bonus_tokens: 500, price_cents: 2499, sort_order: 3 },
  { id: 'credits-5000', name: 'Mega', token_count: 5000, bonus_tokens: 1500, price_cents: 4999, sort_order: 4 },
] as const;

// ─── Ledger Reasons ──────────────────────────────────────────────────────────

export type CreditReason =
  | 'daily_checkin'
  | 'chat_extra'
  | 'image_gen_extra'
  | 'video_gen'
  | 'tts_extra'
  | 'gift_send'
  | 'shop_purchase'
  | 'token_purchase'
  | 'signup_bonus'
  | 'admin_grant'
  | 'refund'
  | 'achievement';

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
