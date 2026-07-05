/**
 *  localStorage key 
 *
 *  'sb-{project_ref}-auth-token'  Supabase project 
 *  helper  key 
 */

const PREFIX = 'soulmate9:';

export const StorageKeys = {
  /**  SSR cookie */
  locale: `${PREFIX}locale`,
  /** onboarding  */
  onboardingVersion: `${PREFIX}onboarding_v`,
  /**  IDPostHog distinctId fallback */
  anonymousId: `${PREFIX}anon_id`,
  /** PWA  */
  pwaInstallDismissed: `${PREFIX}pwa_install_dismissed`,
  /** light/dark/system */
  theme: `${PREFIX}theme`,
  /**  chat  ID */
  lastVisitedGirlfriend: `${PREFIX}last_girlfriend`,
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

/**
 *  localStorageSSR  null
 */
export function getStorageItem(key: StorageKey): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 *  localStorageSSR  no-op
 */
export function setStorageItem(key: StorageKey, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // quota exceeded / disabled - silently ignore
  }
}

/**
 * 
 */
export function removeStorageItem(key: StorageKey): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
}
