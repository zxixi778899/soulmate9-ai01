'use client';

/**
 * PostHog 客户端 Provider
 *
 * - 挂载时 init posthog-js（懒加载 + 静默降级）
 * - 自动捕获 pageview
 * - 用户登录后 identify
 *
 * 用法：在 app/layout.tsx 包裹 children
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface PostHogClient {
  init(apiKey: string, options?: Record<string, unknown>): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  reset(): void;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
    if (!apiKey) return;

    try {
      // 动态 import：包未装时静默降级
      // @ts-ignore - posthog-js is optional, install with `pnpm add posthog-js`
      import('posthog-js').then((mod) => {
        const ph = (mod.default || mod) as unknown as PostHogClient;
        ph.init(apiKey, {
          api_host: host,
          capture_pageview: false, // 我们手动 capture（更准）
          capture_pageleave: true,
          autocapture: true,
          // 性能：dev 模式关闭
          disable_session_recording: process.env.NODE_ENV !== 'production',
        });
      }).catch(() => {
        // 包未装 — no-op
      });
    } catch {
      // no-op
    }
  }, []);

  // 路由变化时手动上报 pageview
  useEffect(() => {
    if (!pathname) return;
    if (typeof window === 'undefined') return;
    const w = window as unknown as { posthog?: PostHogClient };
    if (w.posthog) {
      w.posthog.capture('$pageview', { $current_url: pathname });
    }
  }, [pathname]);

  return <>{children}</>;
}

/**
 * 客户端埋点 hook（包未装时 no-op）
 */
export function useTrackEvent() {
  return (event: string, properties?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { posthog?: PostHogClient };
    if (w.posthog) {
      w.posthog.capture(event, properties);
    }
  };
}

/**
 * 客户端 identify helper
 */
export function identifyUser(distinctId: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { posthog?: PostHogClient };
  if (w.posthog) {
    w.posthog.identify(distinctId, properties);
  }
}
