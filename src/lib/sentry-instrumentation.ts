/**
 * Sentry  nodejs runtime
 *  instrumentation.ts  Next.js  import 
 *  SENTRY_DSN  + @sentry/nextjs  init
 */

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  try {
    //  Function  +  require  webpack  build-fail
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
  } catch {
    // @sentry/nextjs is optional. Avoid importing the application logger here,
    // because it depends on this instrumentation layer.
  }
}

export {};
