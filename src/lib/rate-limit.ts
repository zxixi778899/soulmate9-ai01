/**
 * Upstash Redis  + 
 *
 *  Upstash 
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *  Map
 *
 * 
 */
import { logger } from './logger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

// =============  =============

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();
let memoryCleanupStarted = false;
function startMemoryCleanup(): void {
  if (memoryCleanupStarted) return;
  memoryCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
      if (entry.resetAt <= now) memoryStore.delete(key);
    }
  }, 60_000).unref?.();
}

function memoryCheck(key: string, config: RateLimitConfig): RateLimitResult {
  startMemoryCleanup();
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetInMs: config.windowMs };
  }

  entry.count += 1;
  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetInMs: entry.resetAt - now };
  }
  return { allowed: true, remaining: config.maxRequests - entry.count, resetInMs: entry.resetAt - now };
}

// ============= Upstash Redis  =============

interface UpstashClient {
  evalScript(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<unknown>;
}

let upstashClient: UpstashClient | null | undefined; // undefined= / null= / =

function getUpstash(): UpstashClient | null {
  if (upstashClient !== undefined) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    upstashClient = null;
    return null;
  }
  upstashClient = {
    async evalScript(script, keys, args) {
      const res = await fetch(`${url}/eval`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ script, keys, args: args.map(String) }),
      });
      if (!res.ok) throw new Error(`Upstash eval failed: HTTP ${res.status}`);
      const json = (await res.json()) as { result?: unknown };
      return json.result;
    },
  };
  logger.info('rate-limit: using Upstash Redis');
  return upstashClient;
}

// Lua +  [count, { data: ttl_ms]
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('PEXPIRE', key, window)
end
local ttl = redis.call('PTTL', key)
return {count, ttl}
`;

async function upstashCheck(
  client: UpstashClient,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const result = (await client.evalScript(RATE_LIMIT_LUA, [`rl:${key}`], [
    config.maxRequests,
    config.windowMs,
  ])) as [number, number] | undefined;

  if (!result) {
    return memoryCheck(key, config);
  }
  const [count, ttl] = result;
  const remaining = Math.max(0, config.maxRequests - count);
  const resetInMs = ttl > 0 ? ttl : config.windowMs;
  return {
    allowed: count <= config.maxRequests,
    remaining,
    resetInMs,
  };
}

// =============  API =============

/**
 * 
 * -  Upstash Promise
 */
export async function checkRateLimitAsync(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const client = getUpstash();
  if (client) {
    try {
      return await upstashCheck(client, key, config);
    } catch (e) {
      logger.warn('rate-limit: upstash failed, falling back to memory', { err: String(e) });
      return memoryCheck(key, config);
    }
  }
  return memoryCheck(key, config);
}

/**
 *  async 
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  return memoryCheck(key, config);
}

export function rateLimitHeaders(result: RateLimitResult, config: RateLimitConfig): Record<string, string> {
  const h: Record<string, string> = {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetInMs / 1000)),
  };
  if (!result.allowed) {
    h['Retry-After'] = String(Math.ceil(result.resetInMs / 1000));
  }
  return h;
}

export function rateLimitMiddleware(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; status: number; headers: Record<string, string> } {
  const result = checkRateLimit(key, config);
  return {
    allowed: result.allowed,
    status: result.allowed ? 200 : 429,
    headers: rateLimitHeaders(result, config),
  };
}

// 
export const RATE_LIMITS = {
  chat: { maxRequests: 60, windowMs: 60_000 }, // 60/min
  login: { maxRequests: 10, windowMs: 60_000 },
  signup: { maxRequests: 5, windowMs: 60_000 },
  api: { maxRequests: 120, windowMs: 60_000 },
  imageGen: { maxRequests: 20, windowMs: 60 * 60 * 1000 }, // 20/hour
} as const;
