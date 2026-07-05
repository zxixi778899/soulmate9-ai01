/**
 * Sentry 服务端初始化（仅 nodejs runtime）
 * 由 instrumentation.ts 在 Next.js 启动时 import 触发。
 * 仅在 SENTRY_DSN 已配 + @sentry/nextjs 已装时才真正 init。
 */

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  try {
    // 用 Function 构造器 + 字符串 require 绕过 webpack 静态分析（包不存在时不会 build-fail）
    const req = new Function('return require') as NodeRequire;
    const Sentry = req('@sentry/nextjs') as {
      init(opts: Record<string, unknown>): void;
    };
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0.05),
      sendDefaultPii: false,
      environment: process.env.NODE_ENV,
      release: process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_COMMIT_SHA,
      beforeSendTransaction(event: { request?: { cookies?: unknown } }) {
        if (event?.request?.cookies) delete event.request.cookies;
        return event;
      },
      ignoreErrors: [
        'AbortError',
        'ECONNRESET',
        'NetworkError',
        /RunPod.*timeout/i,
      ],
    });
  } catch (err) {
    // @sentry/nextjs 未装或 init 失败 - 静默降级
    // eslint-disable-next-line no-console
    console.warn('[sentry-instrumentation] init skipped:', (err as Error).message);
  }
}

export {};
