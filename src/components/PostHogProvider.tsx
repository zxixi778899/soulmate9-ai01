'use client';

/**
 * PostHog  Provider
 *
 * -  init posthog-js + 
 * -  pageview
 * -  identify
 *
 *  app/layout.tsx  children
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
      //  import
      import('posthog-js').then((mod) => {
        const ph = (mod.default || mod) as unknown as PostHogClient;
        ph.init(apiKey, {
          api_host: host,
          capture_pageview: false, //  capture
          capture_pageleave: true,
          autocapture: true,
          // dev 
          disable_session_recording: process.env.NODE_ENV !== 'production',
        });
      }).catch(() => {
        //   no-op
      });
    } catch {
      // no-op
    }
  }, []);

  //  pageview
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
 *  hook no-op
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
 *  identify helper
 */
export function identifyUser(distinctId: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { posthog?: PostHogClient };
  if (w.posthog) {
    w.posthog.identify(distinctId, properties);
  }
}
