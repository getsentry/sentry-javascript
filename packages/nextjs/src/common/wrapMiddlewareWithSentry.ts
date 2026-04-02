import { captureException, getIsolationScope, handleCallbackErrors } from '@sentry/core';
import { flushSafelyWithTimeout, waitUntil } from '../common/utils/responseEnd';
import type { EdgeRouteHandler } from '../edge/types';

/**
 * Wraps Next.js middleware with Sentry error and performance instrumentation.
 *
 * @param middleware The middleware handler.
 * @returns a wrapped middleware handler.
 */
export function wrapMiddlewareWithSentry<H extends EdgeRouteHandler>(
  middleware: H,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(middleware, {
    apply: async (wrappingTarget, thisArg, args: Parameters<H>) => {
      const isolationScope = getIsolationScope();
      const tunnelRoute =
        '_sentryRewritesTunnelPath' in globalThis
          ? (globalThis as Record<string, unknown>)._sentryRewritesTunnelPath
          : undefined;

      // TODO: This can never work with Turbopack, need to remove it for consistency between builds.
      if (tunnelRoute && typeof tunnelRoute === 'string') {
        const req: unknown = args[0];
        // Check if the current request matches the tunnel route
        if (req instanceof Request) {
          const url = new URL(req.url);
          const isTunnelRequest = url.pathname.startsWith(tunnelRoute);

          if (isTunnelRequest) {
            // Create a simple response that mimics NextResponse.next() so we don't need to import internals here
            // which breaks next 13 apps
            // https://github.com/vercel/next.js/blob/c12c9c1f78ad384270902f0890dc4cd341408105/packages/next/src/server/web/spec-extension/response.ts#L146
            return new Response(null, {
              status: 200,
              headers: {
                'x-middleware-next': '1',
              },
            }) as ReturnType<H>;
          }
        }
      }

      return handleCallbackErrors(
        () => wrappingTarget.apply(thisArg, args),
        error => {
          const req: unknown = args[0];
          isolationScope.setTransactionName(req instanceof Request ? `middleware ${req.method}` : 'middleware');
          captureException(error, {
            mechanism: {
              type: 'auto.function.nextjs.wrap_middleware',
              handled: false,
            },
          });
        },
        () => {
          waitUntil(flushSafelyWithTimeout());
        },
      );
    },
  });
}
