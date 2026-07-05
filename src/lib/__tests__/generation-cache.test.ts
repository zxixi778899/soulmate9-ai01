import { describe, it, expect } from 'vitest';
import { computeCacheKey, type CacheRecordParams } from '../generation-cache';

describe('computeCacheKey', () => {
  const baseParams: CacheRecordParams = {
    prompt: 'a beautiful sunset over mountains',
    negativePrompt: 'blurry, low quality',
    width: 768,
    height: 1024,
    steps: 28,
    guidance: 3.5,
    model: 'flux-dev',
    kind: 'image',
  };

  it('produces 32-char hex string', () => {
    const key = computeCacheKey(baseParams);
    expect(key).toHaveLength(32);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces same key for identical params', () => {
    expect(computeCacheKey(baseParams)).toBe(computeCacheKey(baseParams));
  });

  it('produces different keys for different prompt', () => {
    expect(computeCacheKey(baseParams)).not.toBe(
      computeCacheKey({ ...baseParams, prompt: 'different prompt' }),
    );
  });

  it('produces different keys for different model', () => {
    expect(computeCacheKey(baseParams)).not.toBe(
      computeCacheKey({ ...baseParams, model: 'cogvideox-5b' }),
    );
  });

  it('produces different keys for different kind', () => {
    expect(computeCacheKey(baseParams)).not.toBe(
      computeCacheKey({ ...baseParams, kind: 'video' }),
    );
  });

  it('produces different keys for different dimensions', () => {
    expect(computeCacheKey(baseParams)).not.toBe(
      computeCacheKey({ ...baseParams, width: 1024, height: 768 }),
    );
  });

  it('is case-insensitive on prompt', () => {
    const upper = computeCacheKey({ ...baseParams, prompt: 'A BEAUTIFUL SUNSET' });
    const lower = computeCacheKey({ ...baseParams, prompt: 'a beautiful sunset' });
    expect(upper).toBe(lower);
  });

  it('treats whitespace-padded prompt as same', () => {
    const padded = computeCacheKey({ ...baseParams, prompt: '  a beautiful sunset  ' });
    const clean = computeCacheKey({ ...baseParams, prompt: 'a beautiful sunset' });
    expect(padded).toBe(clean);
  });
});