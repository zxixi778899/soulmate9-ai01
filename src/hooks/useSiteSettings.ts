'use client';

import { useState, useEffect } from 'react';

export type SiteSettings = {
  site_name: string;
  support_email: string;
  telegram_url: string;
  x_url: string;
  discord_url: string;
  footer_tagline: string;
  maintenance_mode: boolean;
  shop_enabled: boolean;
  home_hot_limit: number;
  recharge_banner_title: string;
  recharge_banner_desc: string;
  achievement_banner_title: string;
  achievement_banner_desc: string;
  announcement_enabled: boolean;
  announcement_text: string;
  announcement_link: string;
};

export type AdItem = {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  position: string;
  sort_order: number;
};

let settingsCache: SiteSettings | null = null;
let adsCache: AdItem[] | null = null;

/**
 * Fetch site settings from the public API.
 * Caches in module-level variable so multiple components share one fetch.
 */
export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(settingsCache);
  const [loading, setLoading] = useState(!settingsCache);

  useEffect(() => {
    if (settingsCache) {
      setSettings(settingsCache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/site-settings')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        settingsCache = data.settings as SiteSettings;
        setSettings(settingsCache);
      })
      .catch(() => {
        /* fallback: leave null, consumers use defaults */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { settings, loading };
}

/**
 * Fetch active ads from the public API.
 * Optional position filter: 'banner' | 'sidebar' | 'popup'
 */
export function useSiteAds(position?: string) {
  const [ads, setAds] = useState<AdItem[]>(adsCache || []);
  const [loading, setLoading] = useState(!adsCache);

  useEffect(() => {
    if (adsCache && !position) {
      setAds(adsCache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const url = position ? `/api/ads?position=${position}` : '/api/ads';
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = (data.ads || []) as AdItem[];
        if (!position) adsCache = list;
        setAds(list);
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [position]);

  return { ads, loading };
}

/**
 * Invalidate caches (call after admin saves).
 */
export function invalidateSettingsCache() {
  settingsCache = null;
  adsCache = null;
}
