/**
 * Sentry 
 *
 * 
 * 1. @sentry/nextjs try/require + 
 * 2. SENTRY_DSN  transport
 * 3.  captureException / captureMessage import Sentry
 *
 * 
 *   pnpm add @sentry/nextjs
 *    Vercel project env  SENTRY_DSNclient / server 
 *   SENTRY_TRACES_SAMPLE_RATE=0.1
 */

//  interface  typeof import('@sentry/nextjs') tsc 
//  module resolution
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
    //  Function  +  require webpack/turbopack 
    // build  failruntime require  try/catch 
    const req = new Function('return require') as NodeRequire;
    sentryModule = req('@sentry/nextjs') as SentryLike;
  } catch {
    //  no-op
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
    //  DSN initialized=true null
    initialized = true;
    return null;
  }
  try {
    S.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      //  server  cookie / body 
      sendDefaultPii: false,
      environment: process.env.NODE_ENV,
    });
    initialized = true;
  } catch {
    // init 
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
 * err  Error 
 *  Sentry /  DSN  no-op
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
    // 
  }
}

/**
 *  logger.error() 
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
 *  Sentry  + DSN 
 *  healthcheck / smoke 
 */
export function isSentryActive(): boolean {
  return ensureInitialized() !== null;
}
