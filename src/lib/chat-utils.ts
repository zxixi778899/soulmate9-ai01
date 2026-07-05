/**
 * 聊天 UI 公共工具
 *
 * 从 chat/[id]/page.tsx 抽离的纯函数（无副作用、可 SSR）。
 * 避免每个页面重新实现相同的日期格式化。
 */

/**
 * 聊天气泡时间戳（HH:MM）
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
 * 日期分组标签（Today / Yesterday / 星期 / 完整日期）
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
 * 用于消息分组的 day key
 */
export function dayKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * 截断长消息预览
 */
export function previewText(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '…';
}

/**
 * 判断两条消息是否需要日期分隔符
 */
export function shouldShowDateSeparator(prev: string | null, current: string): boolean {
  if (!prev) return true;
  return dayKey(prev) !== dayKey(current);
}

/**
 * 消息内容中的 URL 转链接（保留 XSS 安全）
 */
export function linkifyText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    const safe = url.replace(/"/g, '&quot;');
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="underline">${url}</a>`;
  });
}
