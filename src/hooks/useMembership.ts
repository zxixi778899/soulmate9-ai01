'use client';

import { useEffect, useState, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';

/**
 * 会员等级
 */
export type MembershipTier = 'free' | 'premium' | 'unlimited' | 'admin';

/**
 * 各等级的能力上限
 * 注意：服务端是权威，hook 提供的是 UI 提前拦断的预判
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
  /** UI 阻断判断 */
  canSendMessage: boolean;
  /** 还剩多少条免费消息（free 等级） */
  remainingFreeMessages: number;
  /** 当前等级能力 */
  capabilities: typeof MEMBERSHIP_LIMITS[MembershipTier];
  /** 主动刷新 */
  refresh: () => Promise<void>;
}

/**
 * useMembership — 客户端提前拦断 hook
 *
 * 用法：
 *   const { canSendMessage, remainingFreeMessages, capabilities } = useMembership();
 *   <Button disabled={!canSendMessage}>Send</Button>
 *
 * 与服务端硬校验配合使用，避免 free 用户在前端无感地走到 403。
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
      // ignore，保留上一次状态
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
