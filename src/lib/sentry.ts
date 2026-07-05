/**
 * Sentry 适配层（懒加载）
 *
 * 设计目标：
 * 1. @sentry/nextjs 未安装时不抛错（try/require + 静默降级）
 * 2. SENTRY_DSN 未配置时不联网（不创建 transport）
 * 3. 业务代码只需 captureException / captureMessage，不直接 import Sentry
 *
 * 接入步骤：
 *   pnpm add @sentry/nextjs
 *   在 Vercel project env 配 SENTRY_DSN（client / server 同值即可）
 *   可选：SENTRY_TRACES_SAMPLE_RATE=0.1
 */

// 用最小 interface 而不是 typeof import('@sentry/nextjs')，避免 tsc 在包未装时
// 解析模块失败（纯类型表达式也会触发 module resolution）。
interface SentryLike {
  init(options: {
    dsn?: string;
    tracesSampleRate?: number;
    sendDefaultPii?: boolean;
    environment?: string;
  }): void;
  captureException(
    err: unknown,
    ctx?: {
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
      user?: { id?: string; email?: string };
      level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    },
  ): void;
  captureMessage(
    msg: string,
    ctx?: {
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
      user?: { id?: string; email?: string };
      level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    },
  ): void;
}

let sentryModule: SentryLike | null = null;
let initialized = false;

function loadSentry(): SentryLike | null {
  if (sentryModule !== null) return sentryModule;
  try {
    // 通过 Function 构造器 + 字符串 require，绕过 webpack/turbopack 的静态分析
    // 这样即使包不存在，build 阶段也不会 fail；runtime require 抛错被 try/catch 吞掉
    const req = new Function('return require') as NodeRequire;
    sentryModule = req('@sentry/nextjs') as SentryLike;
  } catch {
    // 包未安装：降级为 no-op
    sentryModule = null;
  }
  return sentryModule;
}

function ensureInitialized(): SentryLike | null {
  if (initialized) return loadSentry();
  const S = loadSentry();
  if (!S) return null;
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // 无 DSN：保持 initialized=true，下次直接返回 null，避免重复尝试
    initialized = true;
    return null;
  }
  try {
    S.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      // 不在 server 端抓取 cookie / body 避免泄漏敏感字段
      sendDefaultPii: false,
      environment: process.env.NODE_ENV,
    });
    initialized = true;
  } catch {
    // init 失败不抛错
  }
  return S;
}

export interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string };
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
}

/**
 * 上报一个异常。err 可以是 Error 或任意对象。
 * 在未装 Sentry / 未配 DSN 时静默 no-op。
 */
export function captureException(err: unknown, context?: CaptureContext): void {
  const S = ensureInitialized();
  if (!S) return;
  try {
    S.captureException(err, {
      tags: context?.tags,
      extra: context?.extra,
      user: context?.user,
      level: context?.level,
    });
  } catch {
    // 上报失败不抛错
  }
}

/**
 * 上报一条消息。用于 logger.error() 的同步通道。
 */
export function captureMessage(message: string, context?: CaptureContext): void {
  const S = ensureInitialized();
  if (!S) return;
  try {
    S.captureMessage(message, {
      tags: context?.tags,
      extra: context?.extra,
      user: context?.user,
      level: context?.level ?? 'info',
    });
  } catch {
    // no-op
  }
}

/**
 * 判断 Sentry 是否已可用（包已装 + DSN 已配）。
 * 给 healthcheck / smoke 脚本用。
 */
export function isSentryActive(): boolean {
  return ensureInitialized() !== null;
}
