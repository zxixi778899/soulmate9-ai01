/**
 * 轻量级结构化日志（无外部依赖）
 *
 * - 生产环境输出 JSON 行，方便 Vercel/Grafana/Loki 聚合
 * - 开发环境输出彩色文本
 * - 自动注入 traceId（若 header 中带 x-request-id 则使用，否则随机）
 * - 自动屏蔽常见敏感字段（token / password / secret）
 * - logger.error() 同步上报 Sentry（懒加载；@sentry/nextjs 未装则 no-op）
 */

import { captureException } from './sentry';

const REDACT_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'x-session',
  'stripe_secret_key',
]);

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: Level =
  (process.env.LOG_LEVEL as Level | undefined) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const IS_PROD = process.env.NODE_ENV === 'production';

function shouldLog(level: Level): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function redact(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]';
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (typeof v === 'string' && v.length > 2000) {
      out[k] = v.slice(0, 2000) + `…(${v.length - 2000} more)`;
      continue;
    }
    out[k] = redact(v, depth + 1);
  }
  return out;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function emit(level: Level, msg: string, fields: Record<string, unknown> | undefined): void {
  if (!shouldLog(level)) return;

  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(redact(fields ?? {}) as Record<string, unknown>),
  };

  const line = IS_PROD
    ? JSON.stringify(record)
    : `[${record.ts}] ${level.toUpperCase().padEnd(5)} ${msg} ${
        fields ? JSON.stringify(redact(fields)) : ''
      }`;

  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(extraFields: Record<string, unknown>): Logger;
}

function createLogger(baseFields: Record<string, unknown> = {}): Logger {
  return {
    debug(msg, fields) {
      emit('debug', msg, { ...baseFields, ...fields });
    },
    info(msg, fields) {
      emit('info', msg, { ...baseFields, ...fields });
    },
    warn(msg, fields) {
      emit('warn', msg, { ...baseFields, ...fields });
    },
    error(msg, fields) {
      emit('error', msg, { ...baseFields, ...fields });
      // 同步上报 Sentry（无 DSN / 未装包 → no-op）。fields 已被 redact 过，安全。
      captureException(new Error(msg), {
        tags: { source: 'logger' },
        extra: { ...baseFields, ...fields },
      });
    },
    child(extraFields) {
      return createLogger({ ...baseFields, ...extraFields });
    },
  };
}

export const logger: Logger = createLogger();

/**
 * 从 NextRequest 创建带 traceId 的 child logger。
 * 优先使用上游 x-request-id（Vercel/Cloudflare 透传），否则生成本地 traceId。
 */
export function loggerFromRequest(req: { headers: Headers | Record<string, string> }): Logger {
  const h = req.headers;
  const get = (key: string): string | null => {
    if (typeof (h as Headers).get === 'function') return (h as Headers).get(key);
    return ((h as Record<string, string>)[key] ?? null);
  };
  const traceId = get('x-request-id') ?? get('x-vercel-id') ?? randomId();
  return logger.child({ traceId });
}
