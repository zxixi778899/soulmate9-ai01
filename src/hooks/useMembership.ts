'use client';

import { useEffect, useState, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';

/**
 * 
 */
export type MembershipTier = 'free' | 'premium' | 'unlimited' | 'admin';

/**
 * 
 * hook  UI 
 */
export const MEMBERSHIP_LIMITS = {
  free: {
    dailyMessageLimit: 50,
    maxIntimacyLevel: 3,
    maxGirlfriends: 3,
    canGenerateImages: false,
    canUsePremiumOutfits: false,
  },
  premium: {
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
  /** UI  */
  canSendMessage: boolean;
  /** free  */
  remainingFreeMessages: number;
  /**  */
  capabilities: typeof MEMBERSHIP_LIMITS[MembershipTier];
  /**  */
  refresh: () => Promise<void>;
}

/**
 * useMembership   hook
 *
 * 
 *   const { canSendMessage, remainingFreeMessages, capabilities } = useMembership();
 *   <Button disabled={!canSendMessage}>Send</Button>
 *
 *  free  403
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
      setTier((data.membership_tier as MembershipTier) || 'free');
      setCreditsRemaining(Number(data.credits_remaining) || 0);
      setTodayCount(Number(data.today_messages_count) || 0);
    } catch {
      // ignore
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
  const canSendMessage = !loading && (
    !Number.isFinite(capabilities.dailyMessageLimit) || todayCount < capabilities.dailyMessageLimit
  );

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
