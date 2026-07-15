import type { Locale } from '@/lib/i18n/types';

/**
 *  UI 
 *
 *  chat/[id]/page.tsx  SSR
 * 
 */

/**
 * HH:MM
 */
export function formatBubbleTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

/**
 * Today / Yesterday /  / 
 */
export function dateGroupLabel(dateStr: string, now?: Date, locale: Locale = 'en'): string {
  try {
    const date = new Date(dateStr);
    const ts = date.getTime();
    if (Number.isNaN(ts)) return '';
    const ref = now || new Date();
    const startToday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
    const startYesterday = startToday - 86400000;
    const relativeLabels: Record<Locale, { today: string; yesterday: string }> = {
      en: { today: 'Today', yesterday: 'Yesterday' },
      zh: { today: '今天', yesterday: '昨天' },
      ja: { today: '今日', yesterday: '昨日' },
      ko: { today: '오늘', yesterday: '어제' },
      es: { today: 'Hoy', yesterday: 'Ayer' },
      fr: { today: "Aujourd’hui", yesterday: 'Hier' },
      de: { today: 'Heute', yesterday: 'Gestern' },
    };
    const intlLocale: Record<Locale, string> = {
      en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
    };
    if (ts >= startToday) return relativeLabels[locale].today;
    if (ts >= startYesterday) return relativeLabels[locale].yesterday;
    if (ref.getTime() - ts < 7 * 86400000) {
      return date.toLocaleDateString(intlLocale[locale], { weekday: 'long' });
    }
    return date.toLocaleDateString(intlLocale[locale], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 *  day key
 */
export function dayKey(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return 'unknown';
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  } catch {
    return 'unknown';
  }
}

/**
 * 
 */
export function previewText(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '';
}

/**
 * 
 */
export function shouldShowDateSeparator(prev: string | null, current: string): boolean {
  if (!prev) return true;
  return dayKey(prev) !== dayKey(current);
}

/**
 *  URL  XSS 
 */
export function linkifyText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
  return text.replace(urlRegex, (url) => {
    const safe = escapeHtml(url);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="underline">${safe}</a>`;
  });
}
