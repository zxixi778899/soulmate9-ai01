/**
 * Shared payment grant logic — called by both admin crypto confirm and
 * auto-verification (crypto submit + cron). Ensures consistent granting
 * of memberships and credits across all USDT payment paths.
 *
 * Two grant types:
 *  1. 'subscription' — plan_id is a tier name (pro/unlimited), grants
 *     membership tier + subscription credits + subscriptions row.
 *  2. 'tokens' — plan_id is a package id (credits-500 etc.), grants
 *     credit tokens via grantTopUpCredits().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { grantTopUpCredits } from '@/lib/credit-system';

/** Membership tier credit grants (subscription path only) — synced with MEMBERSHIP_TIERS.monthly_credits */
const TIER_CREDITS: Record<string, number> = {
  basic: 1000,    // legacy grandfathered tier — folded into pro quota
  pro: 1000,
  premium: 2500,
  unlimited: 3500,
};

export interface GrantResult {
  ok: boolean;
  error?: string;
  granted_type?: 'subscription' | 'tokens';
  granted_credits?: number;
  period_end?: string;
}

/**
 * Grant rewards for a confirmed crypto payment.
 */
export async function grantCryptoPayment(
  client: SupabaseClient,
  payment: {
    id: string;
    user_id: string;
    plan_id: string;
    amount_usd: number | string;
    billing?: string | null;
    currency?: string;
    tx_hash?: string;
  },
  paymentType: 'subscription' | 'tokens',
): Promise<GrantResult> {
  const userId = payment.user_id;
  const amountUsd = Number(payment.amount_usd) || 0;
  const amountCents = Math.round(amountUsd * 100);

  if (paymentType === 'tokens') {
    // ── Credit pack purchase ────────────────────────────────────────────────
    let totalTokens = 0;

    // Try token_packages table first
    const { data: pkg } = await client
      .from('token_packages')
      .select('token_count, bonus_tokens')
      .eq('id', payment.plan_id)
      .maybeSingle();
    if (pkg) {
      totalTokens = Number(pkg.token_count) + Number(pkg.bonus_tokens || 0);
    }

    // Fallback: try products table (admin-shop credit packs)
    if (!totalTokens) {
      const { data: prod } = await client
        .from('products')
        .select('virtual_meta')
        .eq('id', payment.plan_id)
        .maybeSingle();
      if (prod) {
        const meta = (prod.virtual_meta || {}) as Record<string, unknown>;
        totalTokens = Number(meta.token_amount || meta.credits || 0);
      }
    }

    if (!totalTokens) {
      return { ok: false, error: `Cannot determine token count for package ${payment.plan_id}` };
    }

    const grant = await grantTopUpCredits(client, userId, totalTokens, payment.id);
    if (!grant.ok) {
      return { ok: false, error: 'grantTopUpCredits failed' };
    }

    // Record purchase_history
    await client.from('purchase_history').insert({
      user_id: userId,
      item_type: 'tokens',
      amount_cents: amountCents,
      status: 'completed',
      metadata: {
        package_id: payment.plan_id,
        provider: 'crypto_usdt',
        crypto_payment_id: payment.id,
        token_count: totalTokens,
        tx_hash: payment.tx_hash,
      },
    });

    // Notify user
    await client.from('notifications').insert({
      user_id: userId,
      title: 'Credits Added',
      message: `${totalTokens.toLocaleString()} credits have been added to your account!`,
      type: 'payment_confirmed',
      link_url: '/wallet',
    });

    logger.info('[payment-grant] Tokens granted via crypto', {
      userId: userId.slice(0, 8),
      tokens: totalTokens,
      paymentId: payment.id,
    });

    return { ok: true, granted_type: 'tokens', granted_credits: totalTokens };
  }

  // ── Subscription (membership) ─────────────────────────────────────────
  const membershipTier = payment.plan_id;
  const credits = TIER_CREDITS[membershipTier] ?? 0;

  if (!['basic', 'pro', 'premium', 'unlimited'].includes(membershipTier)) {
    return { ok: false, error: `Unknown tier: ${membershipTier}` };
  }

  // Update profile
  const { error: profileErr } = await client
    .from('profiles')
    .update({ membership_tier: membershipTier, credits_remaining: credits })
    .eq('user_id', userId);
  if (profileErr) {
    return { ok: false, error: `Profile update failed: ${profileErr.message}` };
  }

  // Calculate period end
  const billingInterval = payment.billing === 'yearly' ? 'yearly' : 'monthly';
  const periodDays = billingInterval === 'yearly' ? 365 : 30;
  const periodEnd = new Date(Date.now() + periodDays * 86_400_000).toISOString();

  // Delete old active subs first to avoid duplicates, then insert new
  await client
    .from('subscriptions')
    .delete()
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due']);

  const { error: subErr } = await client.from('subscriptions').insert({
    user_id: userId,
    plan_id: membershipTier,
    status: 'active',
    billing_interval: billingInterval,
    billing_interval_count: 1,
    unit_amount_cents: amountCents,
    currency: 'usd',
    current_period_end: periodEnd,
  });
  if (subErr) {
    logger.error('[payment-grant] subscriptions insert failed:', { error: subErr.message });
  }

  // Record purchase_history
  await client.from('purchase_history').insert({
    user_id: userId,
    item_type: 'subscription',
    amount_cents: amountCents,
    status: 'completed',
    metadata: {
      plan: membershipTier,
      billing: billingInterval,
      provider: 'crypto_usdt',
      crypto_payment_id: payment.id,
      currency: payment.currency,
      tx_hash: payment.tx_hash,
    },
  });

  // Notify user
  await client.from('notifications').insert({
    user_id: userId,
    title: 'Crypto Payment Confirmed',
    message: `Your ${membershipTier.toUpperCase()} (${billingInterval}) payment has been confirmed! Valid until ${new Date(periodEnd).toLocaleDateString()}.`,
    type: 'payment_confirmed',
    link_url: '/profile',
  });

  logger.info('[payment-grant] Membership granted via crypto', {
    userId: userId.slice(0, 8),
    tier: membershipTier,
    billing: billingInterval,
    periodEnd,
  });

  return { ok: true, granted_type: 'subscription', granted_credits: credits, period_end: periodEnd };
}
