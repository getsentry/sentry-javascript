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
import { isPathnameUnderSentryTunnelRoute } from '../common/utils/tunnelPathnameMatch';
import type { EdgeRouteHandler } from '../edge/types';

/**
 * Wraps Next.js middleware with Sentry error and performance instrumentation.
 *
 * From Next.js 14 onwards the middleware transaction is created by Next.js' native OpenTelemetry
 * instrumentation (the `Middleware.execute` span, normalized by `enhanceMiddlewareRootSpan`). In that case this
 * wrapper does not start a span of its own, as that would emit a second, redundant middleware span nested inside
 * the root span. It only forks an isolation scope, captures errors, and flushes. Next.js 13 does not emit
 * `Middleware.execute`, so there the wrapper still starts the transaction itself.
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

      // TODO: This can never work with Turbopack, need to remove it for consistency between builds.
      if (tunnelRoute && typeof tunnelRoute === 'string') {
        const req: unknown = args[0];
        // Check if the current request matches the tunnel route
        if (req instanceof Request) {
          const url = new URL(req.url);
          const isTunnelRequest = isPathnameUnderSentryTunnelRoute(url.pathname, tunnelRoute);

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

        const runMiddleware = (): ReturnType<H> =>
          handleCallbackErrors(
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
          ) as ReturnType<H>;

        const activeSpan = getActiveSpan();
        if (activeSpan) {
          // The native Next.js OTEL instrumentation created the middleware root span (`Middleware.execute`,
          // normalized by `enhanceMiddlewareRootSpan`). Bind our forked scopes to it so the transaction picks up
          // the isolation scope instead of the global one, and do not start a second, redundant span here.
          const rootSpan = getRootSpan(activeSpan);
          if (rootSpan) {
            setCapturedScopesOnSpan(rootSpan, currentScope, isolationScope);
          }

          return runMiddleware();
        }

        // Next.js only emits `Middleware.execute` from version 14 onwards. On Next.js 13 nothing else creates a
        // middleware span, so this wrapper still has to provide the transaction itself.
        return startSpan(
          {
            name: spanName,
            op: 'http.server.middleware',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: spanSource,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.wrap_middleware',
            },
          },
          runMiddleware,
        );
      });
    },
  });
}
