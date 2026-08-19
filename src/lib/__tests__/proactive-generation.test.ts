import { describe, expect, it } from 'vitest';
import { dailyProactiveTarget } from '@/lib/proactive-generation';

describe('dailyProactiveTarget', () => {
  it('is stable for the same companion and day', () => {
    const seed = 'user:companion:2026-08-01';
    expect(dailyProactiveTarget(seed)).toBe(dailyProactiveTarget(seed));
  });

  it('returns two or three messages', () => {
    const values = Array.from({ length: 50 }, (_, index) => dailyProactiveTarget(`pair:${index}`));
    expect(new Set(values)).toEqual(new Set([2, 3]));
  });
});
