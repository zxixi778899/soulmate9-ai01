/**
 * Unit tests for the image provider circuit-breaker store.
 *
 * Focus: the memory fallback path (no Upstash configured) and graceful
 * degradation when Redis is configured but unreachable. Each test re-imports
 * the module fresh (vi.resetModules) because the store keeps module-level
 * state (memory map + cached client detection).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

async function loadStore() {
  return import('../image-breaker-store');
}

describe('memory fallback (Redis unconfigured)', () => {
  it('reports Redis as unconfigured', async () => {
    const store = await loadStore();
    expect(store.isBreakerRedisConfigured()).toBe(false);
  });

  it('returns null for unknown routes', async () => {
    const store = await loadStore();
    expect(await store.getBreakerState('missing-route')).toBeNull();
  });

  it('accumulates failures and opens the circuit at the threshold', async () => {
    const store = await loadStore();
    const routeId = 'fal-ai';

    const first = await store.recordBreakerFailure(routeId, 3, 60_000);
    expect(first.failures).toBe(1);
    expect(first.openedAt).toBeNull();

    const second = await store.recordBreakerFailure(routeId, 3, 60_000);
    expect(second.failures).toBe(2);
    expect(second.openedAt).toBeNull();

    const third = await store.recordBreakerFailure(routeId, 3, 60_000);
    expect(third.failures).toBe(3);
    expect(third.openedAt).toBeTypeOf('number');

    // Repeated failures keep the original open timestamp.
    const fourth = await store.recordBreakerFailure(routeId, 3, 60_000);
    expect(fourth.failures).toBe(4);
    expect(fourth.openedAt).toBe(third.openedAt);

    expect(await store.getBreakerState(routeId)).toEqual(fourth);
  });

  it('opens immediately via openBreakerNow (GPU capacity failure)', async () => {
    const store = await loadStore();
    const state = await store.openBreakerNow('runpod-gpu', 3, 60_000);
    expect(state.failures).toBe(3);
    expect(state.openedAt).toBeTypeOf('number');
    expect(await store.getBreakerState('runpod-gpu')).toEqual(state);
  });

  it('resetBreaker clears the memory state', async () => {
    const store = await loadStore();
    await store.recordBreakerFailure('flaky-route', 1, 60_000);
    expect((await store.getBreakerState('flaky-route'))?.openedAt).toBeTypeOf('number');

    await store.resetBreaker('flaky-route');
    expect(await store.getBreakerState('flaky-route')).toBeNull();
  });
});

describe('Redis configured but unreachable', () => {
  it('falls back to memory on record/get/reset errors', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const store = await loadStore();
    expect(store.isBreakerRedisConfigured()).toBe(true);

    const state = await store.recordBreakerFailure('degraded-route', 2, 60_000);
    expect(state.failures).toBe(1);
    expect(state.openedAt).toBeNull();

    expect(await store.getBreakerState('degraded-route')).toEqual(state);

    // Reset must not throw even when Redis is unreachable.
    await expect(store.resetBreaker('degraded-route')).resolves.toBeUndefined();
    expect(await store.getBreakerState('degraded-route')).toBeNull();
  });

  it('openBreakerNow still fuses the route locally when Redis fails', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const store = await loadStore();
    const state = await store.openBreakerNow('capacity-route', 3, 60_000);
    expect(state.openedAt).toBeTypeOf('number');
    expect(await store.getBreakerState('capacity-route')).toEqual(state);
  });
});
