import {
  captureException,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  handleCallbackErrors,
  setCapturedScopesOnSpan,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import { flushSafelyWithTimeout, waitUntil } from '../common/utils/responseEnd';
import type { EdgeRouteHandler } from '../edge/types';

/**
 * Wraps Next.js middleware with Sentry error instrumentation.
 *
 * The middleware transaction itself is created by Next.js' native OpenTelemetry instrumentation
 * (the `Middleware.execute` span, normalized by `enhanceMiddlewareRootSpan`), so this wrapper no
 * longer starts its own span. It only forks an isolation scope, captures errors, and flushes.
 *
 * @param middleware The middleware handler.
 * @returns a wrapped middleware handler.
 */
export function wrapMiddlewareWithSentry<H extends EdgeRouteHandler>(
  middleware: H,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(middleware, {
    apply: async (wrappingTarget, thisArg, args: Parameters<H>) => {
      // TODO: We still should add central isolation scope creation for when our build-time instrumentation does not work anymore with turbopack.
      return withIsolationScope(isolationScope => {
        const req: unknown = args[0];
        const currentScope = getCurrentScope();

        if (req instanceof Request) {
          isolationScope.setSDKProcessingMetadata({
            normalizedRequest: winterCGRequestToRequestData(req),
          });
          currentScope.setTransactionName(`middleware ${req.method}`);
        } else {
          currentScope.setTransactionName('middleware');
        }

        const activeSpan = getActiveSpan();
        if (activeSpan) {
          // If there is an active span, the native Next.js OTEL instrumentation created the middleware root span.
          // Bind our forked scopes to it so the transaction picks up the isolation scope instead of the global one.
          const rootSpan = getRootSpan(activeSpan);
          if (rootSpan) {
            setCapturedScopesOnSpan(rootSpan, currentScope, isolationScope);
          }
        }

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
      });
    },
  });
}
