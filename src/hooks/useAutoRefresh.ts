'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Auto-refresh data when the browser tab becomes visible again,
 * plus an optional polling interval.
 *
 * @param callback - The data-loading function to invoke.
 * @param opts.pollInterval - Optional polling interval in ms (0 / undefined = disabled).
 * @param opts.enabled - Set to `false` to temporarily disable the hook (default `true`).
 * @returns A manual trigger function that invokes `callback` immediately.
 */
export function useAutoRefresh(
  callback: () => void | Promise<void>,
  opts?: { pollInterval?: number; enabled?: boolean },
): () => void {
  const pollInterval = opts?.pollInterval;
  const enabled = opts?.enabled ?? true;

  // Keep a stable ref so the latest callback is always used without
  // re-subscribing to events on every render.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const trigger = useCallback(() => {
    void callbackRef.current();
  }, []);

  // --- visibilitychange: refetch when user returns to the tab ---
  useEffect(() => {
    if (!enabled) return;

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        trigger();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, trigger]);

  // --- optional polling interval ---
  useEffect(() => {
    if (!enabled || !pollInterval || pollInterval <= 0) return;

    const id = setInterval(trigger, pollInterval);
    return () => clearInterval(id);
  }, [enabled, pollInterval, trigger]);

  return trigger;
}
