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
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Today / Yesterday /  / 
 */
export function dateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  const ts = date.getTime();
  if (ts >= startToday) return 'Today';
  if (ts >= startYesterday) return 'Yesterday';
  if (now.getTime() - ts < 7 * 86400000) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 *  day key
 */
export function dayKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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
  return text.replace(urlRegex, (url) => {
    const safe = url.replace(/"/g, '&quot;');
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="underline">${url}</a>`;
  });
}
