/**
 * Shared circuit-breaker store for image generation providers.
 *
 * Cross-instance state lives in Upstash Redis (key `gen-breaker:{routeId}`)
 * so Vercel's multiple function instances agree on which provider is fused.
 * A per-instance memory mirror keeps hot-path reads instant and provides the
 * fallback when Redis is unconfigured or unreachable.
 */

import { logger } from './logger';

export interface BreakerState {
  failures: number;
  openedAt: number | null;
}

const BREAKER_KEY_PREFIX = 'gen-breaker:';

// ─── Memory mirror / fallback ───────────────────────────────

const memoryBreakers = new Map<string, BreakerState>();

export function memoryGetBreaker(routeId: string): BreakerState | undefined {
  return memoryBreakers.get(routeId);
}

export function memorySetBreaker(routeId: string, state: BreakerState): void {
  memoryBreakers.set(routeId, state);
}

export function memoryDeleteBreaker(routeId: string): void {
  memoryBreakers.delete(routeId);
}

// ─── Upstash REST (shared env with rate-limit) ──────────────

interface UpstashRestClient {
  evalScript(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

let upstashRest: UpstashRestClient | null | undefined; // undefined=unchecked null=absent

function getUpstashRest(): UpstashRestClient | null {
  if (upstashRest !== undefined) return upstashRest;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstashRest = null;
    return null;
  }
  upstashRest = {
    async evalScript(script, keys, args) {
      const res = await fetch(`${url}/eval`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, keys, args: args.map(String) }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`Upstash eval failed: HTTP ${res.status}`);
      const json = (await res.json()) as { result?: unknown };
      return json.result;
    },
  };
  return upstashRest;
}

export function isBreakerRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

// ─── Lua scripts ────────────────────────────────────────────

/** Record one failure; opens the circuit when threshold is reached. Returns [failures, openedAt(0=not open)]. */
const BREAKER_FAILURE_LUA = `
local key = KEYS[1]
local threshold = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local f = redis.call('HINCRBY', key, 'failures', 1)
local opened = tonumber(redis.call('HGET', key, 'openedAt') or '0') or 0
if f >= threshold and opened == 0 then
  redis.call('HSET', key, 'openedAt', now)
  opened = now
end
redis.call('PEXPIRE', key, ttl)
return {f, opened}
`;

/** Open the circuit immediately (systemic GPU-capacity failure). Returns openedAt. */
const BREAKER_OPEN_LUA = `
local key = KEYS[1]
local threshold = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
redis.call('HSET', key, 'failures', threshold, 'openedAt', now)
redis.call('PEXPIRE', key, ttl)
return now
`;

/** Clear the circuit after a success. */
const BREAKER_RESET_LUA = `
redis.call('DEL', KEYS[1])
return 1
`;

/** Read state. Returns [failures, openedAt] or nil. */
const BREAKER_GET_LUA = `
local f = redis.call('HGET', KEYS[1], 'failures')
local o = redis.call('HGET', KEYS[1], 'openedAt')
if not f and not o then return nil end
return {tonumber(f or '0'), tonumber(o or '0')}
`;

// ─── Public API (Redis-first, memory fallback) ──────────────

/**
 * Read breaker state across instances. Returns null when no state exists.
 * Falls back to the memory mirror on any Redis error.
 */
export async function getBreakerState(routeId: string): Promise<BreakerState | null> {
  const client = getUpstashRest();
  if (client) {
    try {
      const result = (await client.evalScript(
        BREAKER_GET_LUA,
        [BREAKER_KEY_PREFIX + routeId],
        [],
      )) as [number, number] | null | undefined;
      if (!result) return memoryGetBreaker(routeId) || null;
      const state = { failures: Number(result[0] || 0), openedAt: Number(result[1] || 0) || null };
      memorySetBreaker(routeId, state); // keep hot mirror fresh
      return state;
    } catch (err) {
      logger.warn('[breaker] redis read failed, using memory', { routeId, err: String(err) });
    }
  }
  return memoryGetBreaker(routeId) || null;
}

/** Record one provider failure; opens the circuit at the threshold. */
export async function recordBreakerFailure(
  routeId: string,
  failureThreshold: number,
  resetMs: number,
): Promise<BreakerState> {
  const now = Date.now();
  // TTL covers the reset window plus slack so stale entries self-expire.
  const ttl = resetMs + 60_000;
  const client = getUpstashRest();
  if (client) {
    try {
      const result = (await client.evalScript(
        BREAKER_FAILURE_LUA,
        [BREAKER_KEY_PREFIX + routeId],
        [failureThreshold, ttl, now],
      )) as [number, number] | undefined;
      if (result) {
        const state = { failures: Number(result[0] || 0), openedAt: Number(result[1] || 0) || null };
        memorySetBreaker(routeId, state);
        return state;
      }
    } catch (err) {
      logger.warn('[breaker] redis failure-record failed, using memory', {
        routeId,
        err: String(err),
      });
    }
  }
  const state = memoryGetBreaker(routeId) || { failures: 0, openedAt: null };
  state.failures += 1;
  if (state.failures >= failureThreshold && !state.openedAt) state.openedAt = now;
  memorySetBreaker(routeId, state);
  return state;
}

/** Open immediately (GPU capacity / systemic outage). */
export async function openBreakerNow(
  routeId: string,
  failureThreshold: number,
  resetMs: number,
): Promise<BreakerState> {
  const now = Date.now();
  const ttl = resetMs + 60_000;
  const client = getUpstashRest();
  if (client) {
    try {
      await client.evalScript(BREAKER_OPEN_LUA, [BREAKER_KEY_PREFIX + routeId], [
        failureThreshold,
        ttl,
        now,
      ]);
      const state = { failures: failureThreshold, openedAt: now };
      memorySetBreaker(routeId, state);
      return state;
    } catch (err) {
      logger.warn('[breaker] redis open failed, using memory', { routeId, err: String(err) });
    }
  }
  const state = { failures: failureThreshold, openedAt: now };
  memorySetBreaker(routeId, state);
  return state;
}

/** Clear the circuit after a success. */
export async function resetBreaker(routeId: string): Promise<void> {
  memoryDeleteBreaker(routeId);
  const client = getUpstashRest();
  if (!client) return;
  try {
    await client.evalScript(BREAKER_RESET_LUA, [BREAKER_KEY_PREFIX + routeId], []);
  } catch (err) {
    logger.warn('[breaker] redis reset failed', { routeId, err: String(err) });
  }
}
