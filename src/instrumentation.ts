/**
 * Next.js instrumentation entry
 *
 *  Next.js  server side
 * Sentry / OpenTelemetry 
 *
 * Next.js 16  next.config.js 
 */

export async function register(): Promise<void> {
  //  Node runtime  Sentryedge runtime  module resolver
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/sentry-instrumentation');
  }
}

/**
 * Sentry  hook no-op
 *  traceableResource / OpenTelemetry exporter
 */
export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  },
  context: {
    routerKind: 'Pages Router' | 'App Router';
    routePath: string;
    routeType: 'render' | 'route' | 'action' | 'middleware';
    revalidateReason?: 'on-demand' | 'stale' | undefined;
    renderSource?:
      | 'react-server-components'
      | 'react-server-components-on-demand'
      | 'server-rendering';
  },
): Promise<void> {
  try {
    const { captureException } = await import('./lib/sentry');
    captureException(err, {
      tags: {
        routePath: context.routePath,
        routeType: context.routeType,
        routerKind: context.routerKind,
        method: request.method,
      },
      extra: {
        path: request.path,
        revalidateReason: context.revalidateReason,
        renderSource: context.renderSource,
      },
    });
  } catch {
    // Sentry 
  }
}
