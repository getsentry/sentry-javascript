import type { TransactionSource } from '@sentry/core';
import {
  captureException,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  handleCallbackErrors,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setCapturedScopesOnSpan,
  startSpan,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
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
      const tunnelRoute =
        '_sentryRewritesTunnelPath' in globalThis
          ? (globalThis as Record<string, unknown>)._sentryRewritesTunnelPath
          : undefined;

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
      // TODO: We still should add central isolation scope creation for when our build-time instrumentation does not work anymore with turbopack.
      return withIsolationScope(isolationScope => {
        const req: unknown = args[0];
        const currentScope = getCurrentScope();

        let spanName: string;
        let spanSource: TransactionSource;

        if (req instanceof Request) {
          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: winterCGRequestToRequestData(req),
          });
          spanName = `middleware ${req.method}`;
          spanSource = 'url';
        } else {
          spanName = 'middleware';
          spanSource = 'component';
        }

        currentScope.setTransactionName(spanName);

        const activeSpan = getActiveSpan();

        if (activeSpan) {
          // If there is an active span, it likely means that the automatic Next.js OTEL instrumentation worked and we can
          // rely on that for parameterization.
          spanName = 'middleware';
          spanSource = 'component';

          const rootSpan = getRootSpan(activeSpan);
          if (rootSpan) {
            setCapturedScopesOnSpan(rootSpan, currentScope, isolationScope);
          }
        }

        return startSpan(
          {
            name: spanName,
            op: 'http.server.middleware',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: spanSource,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.wrap_middleware',
            },
          },
          () => {
            return handleCallbackErrors(
              () => wrappingTarget.apply(thisArg, args),
              error => {
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
        );
      });
    },
  });
}
