import { describe, it, expect } from 'vitest';
import {
  formatBubbleTime,
  dateGroupLabel,
  dayKey,
  previewText,
  shouldShowDateSeparator,
  linkifyText,
} from '../chat-utils';

describe('formatBubbleTime', () => {
  it('returns HH:MM format', () => {
    const result = formatBubbleTime('2024-03-15T14:30:00Z');
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('handles invalid date gracefully', () => {
    const result = formatBubbleTime('invalid');
    expect(result).toBe('');
  });
});

describe('dateGroupLabel', () => {
  // dayKey/dateGroupLabel 按本地时区分日，测试用本地时间构造日期避免 TZ 漂移
  const now = new Date(2024, 2, 15, 15, 0, 0);
  it('returns Today for same day', () => {
    const today = new Date(2024, 2, 15, 8, 0, 0).toISOString();
    expect(dateGroupLabel(today, now)).toBe('Today');
  });

  it('returns Yesterday for previous day', () => {
    const yesterday = new Date(2024, 2, 14, 20, 0, 0).toISOString();
    expect(dateGroupLabel(yesterday, now)).toBe('Yesterday');
  });

  it('returns weekday name for 2-7 days ago', () => {
    const threeDaysAgo = new Date(2024, 2, 12, 10, 0, 0).toISOString();
    const result = dateGroupLabel(threeDaysAgo, now);
    expect(result).toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
  });

  it('returns full date for > 7 days ago', () => {
    const longAgo = new Date(2024, 0, 1, 10, 0, 0).toISOString();
    const result = dateGroupLabel(longAgo, now);
    expect(result).toMatch(/\d{4}/);
  });
});

describe('dayKey', () => {
  it('produces same key for same day', () => {
    const morning = dayKey(new Date(2024, 2, 15, 8, 0, 0).toISOString());
    const evening = dayKey(new Date(2024, 2, 15, 22, 0, 0).toISOString());
    expect(morning).toBe(evening);
  });

  it('produces different keys for different days', () => {
    expect(dayKey(new Date(2024, 2, 15, 8, 0, 0).toISOString())).not.toBe(
      dayKey(new Date(2024, 2, 16, 8, 0, 0).toISOString()),
    );
  });
});

describe('previewText', () => {
  it('returns short text unchanged', () => {
    expect(previewText('hello', 80)).toBe('hello');
  });

  it('truncates with ellipsis', () => {
    expect(previewText('a'.repeat(100), 80)).toContain('');
    expect(previewText('a'.repeat(100), 80).length).toBeLessThanOrEqual(82);
  });

  it('respects custom maxLen', () => {
    expect(previewText('hello world', 5)).toBe('hello');
  });
});

describe('shouldShowDateSeparator', () => {
  it('shows separator when prev is null', () => {
    expect(shouldShowDateSeparator(null, '2024-03-15T10:00:00Z')).toBe(true);
  });

  it('does not show separator on same day', () => {
    expect(shouldShowDateSeparator(
      new Date(2024, 2, 15, 8, 0, 0).toISOString(),
      new Date(2024, 2, 15, 22, 0, 0).toISOString(),
    )).toBe(false);
  });

  it('shows separator on different days', () => {
    expect(shouldShowDateSeparator(
      new Date(2024, 2, 15, 22, 0, 0).toISOString(),
      new Date(2024, 2, 16, 8, 0, 0).toISOString(),
    )).toBe(true);
  });
});

describe('linkifyText', () => {
  it('wraps URLs in anchor tags', () => {
    const result = linkifyText('check https://example.com out');
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('handles multiple URLs', () => {
    const result = linkifyText('go to https://a.com and https://b.com');
    expect(result.match(/<a /g)?.length).toBe(2);
  });

  it('returns text unchanged when no URLs', () => {
    expect(linkifyText('no links here')).toBe('no links here');
  });

  it('escapes quotes in URLs to prevent XSS', () => {
    const result = linkifyText('visit https://evil.com?q="><script>alert(1)</script>');
    expect(result).not.toContain('"><script>');
    expect(result).toContain('&quot;');
  });
});
