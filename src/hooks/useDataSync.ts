'use client';

import { useEffect, useRef } from 'react';

/**
 * Cross-tab data synchronization via localStorage events.
 *
 * When Tab A performs a mutation (create girlfriend, purchase, equip, etc.),
 * it calls `notifyDataChange(scope)`. This writes a timestamp to localStorage,
 * which triggers a `storage` event in all OTHER tabs. Those tabs listen via
 * `useDataSync(callback)` and re-fetch data when the relevant scope changes.
 *
 * Scopes:
 * - 'girlfriends' — companion list changed (create/edit/delete/gift)
 * - 'wardrobe'    — outfit equip/unequip/purchase
 * - 'shop'        — shop purchase / credits deducted
 * - 'membership'  — tier or credits changed (Stripe webhook, checkin)
 * - 'chat'        — new chat message in another tab
 * - 'all'         — nuclear: any data may have changed
 *
 * This mechanism is a supplement to the existing `useAutoRefresh` hook
 * (which handles tab visibility changes). Cross-tab sync fires immediately
 * when another tab mutates data, without waiting for the user to switch tabs.
 */

const STORAGE_PREFIX = 'sm:sync:';

/**
 * Broadcast a data change to other browser tabs.
 * Call this after a successful API mutation that affects shared state.
 */
export function notifyDataChange(scope: 'girlfriends' | 'wardrobe' | 'shop' | 'membership' | 'chat' | 'all' = 'all'): void {
  try {
    const key = `${STORAGE_PREFIX}${scope}`;
    // Write a unique value each time so repeated mutations all trigger events
    const value = `${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(key, value);
    // Also set a generic key for hooks that listen to all scopes
    if (scope !== 'all') {
      localStorage.setItem(`${STORAGE_PREFIX}all`, value);
    }
  } catch {
    // localStorage may be unavailable in SSR or private browsing — silent fail
  }
}

/**
 * Hook: listen for cross-tab data changes and invoke a refetch callback.
 *
 * @param callback - Data-loading function to invoke when relevant data changes.
 * @param scopes   - Which scopes to listen for. Default: listen to all.
 * @param opts.enabled - Set to false to temporarily disable.
 */
export function useDataSync(
  callback: () => void | Promise<void>,
  scopes?: Array<'girlfriends' | 'wardrobe' | 'shop' | 'membership' | 'chat' | 'all'>,
  opts?: { enabled?: boolean },
): void {
  const enabled = opts?.enabled ?? true;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const onStorage = (e: StorageEvent): void => {
      if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;

      const changedScope = e.key.slice(STORAGE_PREFIX.length);

      // If no scope filter, react to everything
      if (!scopes || scopes.length === 0) {
        void callbackRef.current();
        return;
      }

      // React if the changed scope matches any of our watched scopes,
      // or if a wildcard 'all' was broadcast
      if (scopes.includes(changedScope as typeof scopes[number]) || changedScope === 'all') {
        void callbackRef.current();
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [enabled, scopes]);
}
