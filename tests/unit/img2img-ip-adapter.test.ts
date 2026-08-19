import { describe, it, expect } from 'vitest';
import { resolveIpAdapterWeight } from '@/lib/identity-kit';

describe('resolveIpAdapterWeight', () => {
  it('should return weight within stable range [0.3, 0.7]', () => {
    const weight = resolveIpAdapterWeight('portrait');
    expect(weight).toBeDefined();
    expect(weight).toBeGreaterThanOrEqual(0.3);
    expect(weight).toBeLessThanOrEqual(0.7);
  });
});
