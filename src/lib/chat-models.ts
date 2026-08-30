/**
 * User-selectable chat model catalog.
 *
 * Five endpoints in the AI modules config are flagged `user_selectable`
 * and surfaced in the in-chat model picker. Each picked model charges
 * `credit_cost` credits per message; auto routing stays free (subscription).
 */

import type { AiModulesConfig, MembershipTier, ModelEndpoint } from './ai-modules/types';

export type ChatModelMinTier = 'free' | 'basic' | 'pro' | 'unlimited';

/** One entry shown in the frontend model picker. */
export interface ChatModelOption {
  id: string;
  label: string;
  description: string;
  credit_cost: number;
  nsfw: boolean;
  min_tier: ChatModelMinTier;
  provider: string;
  /** false when the current user may not pick this model */
  available: boolean;
  lock_reason: 'tier' | 'nsfw' | null;
}

const TIER_RANK: Record<MembershipTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  premium: 3,
  unlimited: 4,
  admin: 4,
};

export function tierRank(tier: MembershipTier): number {
  return TIER_RANK[tier] ?? 0;
}

/**
 * Map raw profile membership_tier column to the canonical MembershipTier.
 *
 * Resolves from BOTH role and membership_tier — returns the higher tier.
 * This ensures admin panel setting membership_tier='unlimited' takes effect
 * even when the role column is still the default 'user'.
 */
export function resolveMembershipTier(profile: Record<string, unknown> | null): MembershipTier {
  const TIER_RANK: Record<string, number> = { free: 0, basic: 1, pro: 2, premium: 2, unlimited: 3 };

  const role = String(profile?.role || '').toLowerCase();
  const roleTier: MembershipTier =
    role === 'admin' || role === 'superadmin' ? 'unlimited' : 'free';

  const raw = String(
    profile?.membership_tier || 'free',
  ).toLowerCase();
  let colTier: MembershipTier = 'free';
  if (raw.includes('unlimit') || raw === 'admin') colTier = 'unlimited';
  else if (raw.includes('premium')) colTier = 'premium';
  else if (raw.includes('pro') || raw.includes('plus')) colTier = 'pro';
  else if (raw.includes('basic') || raw.includes('starter')) colTier = 'basic';

  return (TIER_RANK[colTier] ?? 0) >= (TIER_RANK[roleTier] ?? 0) ? colTier : roleTier;
}

/** All endpoints flagged for the in-chat picker (healthy only). */
export function getSelectableEndpoints(cfg: AiModulesConfig): ModelEndpoint[] {
  return cfg.endpoints.filter(
    (ep) => ep.user_selectable && ep.health_status !== 'disabled',
  );
}

/** Find a user-selectable endpoint by id (rejects disabled / unflagged). */
export function findSelectableEndpoint(
  cfg: AiModulesConfig,
  id: string | null | undefined,
): ModelEndpoint | null {
  if (!id) return null;
  return getSelectableEndpoints(cfg).find((ep) => ep.id === id) || null;
}

/**
 * Build the picker catalog for a given tier.
 * `tierAllowsNsfw` should reflect the user's chat route allow_nsfw flag.
 */
export function listUserChatModels(
  cfg: AiModulesConfig,
  tier: MembershipTier,
  tierAllowsNsfw: boolean,
): ChatModelOption[] {
  const rank = tierRank(tier);
  return getSelectableEndpoints(cfg).map((ep) => {
    const minTier: ChatModelMinTier = ep.min_tier || 'free';
    const tierLocked = rank < TIER_RANK[minTier];
    const nsfwLocked = !!ep.nsfw_capable && !tierAllowsNsfw;
    return {
      id: ep.id,
      label: ep.public_label || ep.label,
      description: ep.public_description || ep.notes || '',
      credit_cost: Math.max(0, Math.round(ep.credit_cost ?? 0)),
      nsfw: !!ep.nsfw_capable,
      min_tier: minTier,
      provider: ep.provider,
      available: !tierLocked && !nsfwLocked,
      lock_reason: tierLocked ? 'tier' : nsfwLocked ? 'nsfw' : null,
    };
  });
}
