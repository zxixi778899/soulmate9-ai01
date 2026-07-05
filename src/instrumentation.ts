/**
 * Next.js instrumentation entry
 *
 * 在 Next.js 启动时执行一次（仅 server side）。
 * 用于：Sentry / OpenTelemetry 初始化、性能监控。
 *
 * Next.js 16 自动加载此文件（无需 next.config.js 改动）
 */

export async function register(): Promise<void> {
  // 只在 Node runtime 初始化 Sentry（edge runtime 无 module resolver）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/sentry-instrumentation');
  }
}

/**
 * Sentry 启动时的 hook（如未装包则静默 no-op）
 * 未来加 traceableResource / OpenTelemetry exporter
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
    // Sentry 不可用时静默
  }
}
