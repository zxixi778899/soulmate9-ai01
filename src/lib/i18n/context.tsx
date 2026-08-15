'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isSupportedLocale, type Locale, type TranslationKey } from './types';
import { getTranslation, detectBrowserLocale } from './translations';

// Cookie mirrors the localStorage preference (kept for future server-side use).
export const LOCALE_COOKIE = 'soulmate_locale';

function persistLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('soulmate_locale', locale);
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale;
}

/**
 * Cross-instance locale sync.
 *
 * Several I18nProvider instances coexist on purpose: the nav chrome
 * (GlobalTopNav / BottomNav / RetentionLoop) lives inside Suspense boundaries
 * and carries its own provider so that lazily-hydrated content renders with
 * the same initial locale the server used ('en') — changing the locale only
 * after hydration eliminates SSR/client text mismatches. All instances stay
 * in sync through this tiny listener set.
 */
const localeListeners = new Set<(locale: Locale) => void>();

function notifyLocaleChange(locale: Locale): void {
  localeListeners.forEach((listener) => listener(locale));
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: TranslationKey) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start in 'en' so the client's first render matches the SSR HTML;
  // the real locale is applied after hydration completes.
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    // Priority: stored preference > browser locale > English fallback
    const stored = localStorage.getItem('soulmate_locale');
    let targetLocale: Locale;
    if (isSupportedLocale(stored)) {
      targetLocale = stored;
    } else {
      const detected = detectBrowserLocale();
      targetLocale = isSupportedLocale(detected) ? detected : 'en';
    }
    if (targetLocale !== locale) setLocaleState(targetLocale);
    persistLocale(targetLocale);

    // Keep every provider instance (page content + nav chrome) in sync.
    const onExternalChange = (next: Locale) => setLocaleState(next);
    localeListeners.add(onExternalChange);
    return () => {
      localeListeners.delete(onExternalChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    persistLocale(newLocale);
    notifyLocaleChange(newLocale);
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    return getTranslation(key, locale, params);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
