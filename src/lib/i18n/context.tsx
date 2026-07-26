'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { isSupportedLocale, type Locale, type TranslationKey } from './types';
import { getTranslation } from './translations';

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
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    // Default to English. Only use a stored preference if the user previously
    // switched language explicitly via the language switcher.
    const stored = localStorage.getItem('soulmate_locale');
    const targetLocale: Locale = isSupportedLocale(stored) ? stored : 'en';
    setLocaleState(targetLocale);
    document.documentElement.lang = targetLocale;
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('soulmate_locale', newLocale);
      document.documentElement.lang = newLocale.split('-')[0];
    }
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
