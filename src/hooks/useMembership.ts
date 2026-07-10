'use client';

import { useEffect, useState, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';

/**
 * Membership tier used across UI + checkout flows.
 * Canonical names: free / pro / unlimited / admin
 */
export type MembershipTier = 'free' | 'pro' | 'unlimited' | 'admin';

/**
 * Soft limits surfaced in UI. Hard enforcement lives on the server
 * (chat/stream, generate-image, etc.).
 */
export const MEMBERSHIP_LIMITS = {
  free: {
    dailyMessageLimit: 50,
    maxIntimacyLevel: 3,
    maxGirlfriends: 3,
    canGenerateImages: false,
    canUsePremiumOutfits: false,
  },
  pro: {
    dailyMessageLimit: Number.POSITIVE_INFINITY,
    maxIntimacyLevel: 5,
    maxGirlfriends: 10,
    canGenerateImages: true,
    canUsePremiumOutfits: true,
  },
  unlimited: {
    dailyMessageLimit: Number.POSITIVE_INFINITY,
    maxIntimacyLevel: 10,
    maxGirlfriends: Number.POSITIVE_INFINITY,
    canGenerateImages: true,
    canUsePremiumOutfits: true,
  },
  admin: {
    dailyMessageLimit: Number.POSITIVE_INFINITY,
    maxIntimacyLevel: 10,
    maxGirlfriends: Number.POSITIVE_INFINITY,
    canGenerateImages: true,
    canUsePremiumOutfits: true,
  },
} as const;

export interface MembershipState {
  tier: MembershipTier;
  creditsRemaining: number;
  todayMessagesCount: number;
  loading: boolean;
  canSendMessage: boolean;
  remainingFreeMessages: number;
  capabilities: (typeof MEMBERSHIP_LIMITS)[MembershipTier];
  refresh: () => Promise<void>;
}

const VALID_TIERS = new Set<MembershipTier>(['free', 'pro', 'unlimited', 'admin']);

function normalizeTier(raw: unknown): MembershipTier {
  // API historically mixed "premium" / "pro" — normalize both to pro.
  if (raw === 'premium') return 'pro';
  if (typeof raw === 'string' && VALID_TIERS.has(raw as MembershipTier)) {
    return raw as MembershipTier;
  }
  return 'free';
}

/**
 * Client membership + daily usage hook.
 *
 * Reads `/api/membership` which returns:
 *   { tier, credits_remaining, usage: { messages_sent_today, ... } }
 */
export function useMembership(): MembershipState {
  const [tier, setTier] = useState<MembershipTier>('free');
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const res = await authedFetch('/api/membership');
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      // Prefer `tier` (current API). Fall back to legacy field names so older
      // responses / proxies don't silently zero out usage banners.
      setTier(normalizeTier(data.tier ?? data.membership_tier));
      setCreditsRemaining(Number(data.credits_remaining) || 0);
      const sentToday =
        data.usage?.messages_sent_today ??
        data.today_messages_count ??
        data.messages_sent_today ??
        0;
      setTodayCount(Number(sentToday) || 0);
    } catch {
      // keep last known state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const capabilities = MEMBERSHIP_LIMITS[tier] || MEMBERSHIP_LIMITS.free;
  const remainingFreeMessages = Number.isFinite(capabilities.dailyMessageLimit)
    ? Math.max(0, capabilities.dailyMessageLimit - todayCount)
    : Number.POSITIVE_INFINITY;
  const canSendMessage =
    !loading &&
    (!Number.isFinite(capabilities.dailyMessageLimit) ||
      todayCount < capabilities.dailyMessageLimit);

  return {
    tier,
    creditsRemaining,
    todayMessagesCount: todayCount,
    loading,
    canSendMessage,
    remainingFreeMessages,
    capabilities,
    refresh: fetchState,
  };
}
