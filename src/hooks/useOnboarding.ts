/**
 * Onboarding 状态管理 hook（DB-backed）
 *
 * 替代之前的 localStorage 方案：
 * - 跨设备同步（同一 user 任意设备看到一致进度）
 * - 不会被缓存清除影响
 * - 可被服务端 cron 用于 funnel 分析
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export interface OnboardingState {
  current_step: number;
  completed: boolean;
  skipped: boolean;
  preferences: Record<string, unknown>;
}

const DEFAULT_STATE: OnboardingState = {
  current_step: 0,
  completed: false,
  skipped: false,
  preferences: {},
};

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);

  // 加载初始状态
  useEffect(() => {
    let cancelled = false;
    authedFetch('/api/onboarding')
      .then((r) => (r.ok ? r.json() : DEFAULT_STATE))
      .then((data) => {
        if (!cancelled) {
          setState(data || DEFAULT_STATE);
          setLoading(false);
        }
      })
      .catch((err) => {
        logger.warn('onboarding fetch failed, using defaults', { err });
        if (!cancelled) {
          setState(DEFAULT_STATE);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 更新 step
  const setStep = useCallback(async (step: number) => {
    setState((s) => (s ? { ...s, current_step: step } : { ...DEFAULT_STATE, current_step: step }));
    try {
      await authedFetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_step: step }),
      });
    } catch (err) {
      logger.warn('onboarding setStep failed', { err });
    }
  }, []);

  // 更新偏好
  const setPreferences = useCallback(async (prefs: Record<string, unknown>) => {
    setState((s) => (s ? { ...s, preferences: { ...s.preferences, ...prefs } } : { ...DEFAULT_STATE, preferences: prefs }));
    try {
      await authedFetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefs }),
      });
    } catch (err) {
      logger.warn('onboarding setPreferences failed', { err });
    }
  }, []);

  // 完成
  const complete = useCallback(async () => {
    setState((s) => (s ? { ...s, completed: true } : { ...DEFAULT_STATE, completed: true }));
    try {
      await authedFetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
    } catch (err) {
      logger.warn('onboarding complete failed', { err });
    }
  }, []);

  // 跳过
  const skip = useCallback(async () => {
    setState((s) => (s ? { ...s, skipped: true, completed: true } : { ...DEFAULT_STATE, skipped: true, completed: true }));
    try {
      await authedFetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipped: true }),
      });
    } catch (err) {
      logger.warn('onboarding skip failed', { err });
    }
  }, []);

  return {
    state,
    loading,
    isCompleted: !!state?.completed,
    setStep,
    setPreferences,
    complete,
    skip,
  };
}
