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
  const now = new Date('2024-03-15T15:00:00Z');
  it('returns Today for same day', () => {
    const today = new Date('2024-03-15T08:00:00Z').toISOString();
    expect(dateGroupLabel(today, now)).toBe('Today');
  });

  it('returns Yesterday for previous day', () => {
    const yesterday = new Date('2024-03-14T20:00:00Z').toISOString();
    expect(dateGroupLabel(yesterday, now)).toBe('Yesterday');
  });

  it('returns weekday name for 2-7 days ago', () => {
    const threeDaysAgo = new Date('2024-03-12T10:00:00Z').toISOString();
    const result = dateGroupLabel(threeDaysAgo, now);
    expect(result).toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
  });

  it('returns full date for > 7 days ago', () => {
    const longAgo = new Date('2024-01-01T10:00:00Z').toISOString();
    const result = dateGroupLabel(longAgo, now);
    expect(result).toMatch(/\d{4}/);
  });
});

describe('dayKey', () => {
  it('produces same key for same day', () => {
    const morning = dayKey('2024-03-15T08:00:00Z');
    const evening = dayKey('2024-03-15T22:00:00Z');
    expect(morning).toBe(evening);
  });

  it('produces different keys for different days', () => {
    expect(dayKey('2024-03-15T08:00:00Z')).not.toBe(dayKey('2024-03-16T08:00:00Z'));
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
    expect(shouldShowDateSeparator('2024-03-15T08:00:00Z', '2024-03-15T22:00:00Z')).toBe(false);
  });

  it('shows separator on different days', () => {
    expect(shouldShowDateSeparator('2024-03-15T22:00:00Z', '2024-03-16T08:00:00Z')).toBe(true);
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
