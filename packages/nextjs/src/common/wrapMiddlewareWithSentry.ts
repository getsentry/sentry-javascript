import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  handleCallbackErrors,
  setCapturedScopesOnSpan,
  startSpan,
  withIsolationScope,
} from '@sentry/core';
import type { TransactionSource } from '@sentry/types';
import { vercelWaitUntil, winterCGRequestToRequestData } from '@sentry/utils';
import type { EdgeRouteHandler } from '../edge/types';
import { flushSafelyWithTimeout } from './utils/responseEnd';

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
      // TODO: We still should add central isolation scope creation for when our build-time instrumentation does not work anymore with turbopack.
      return withIsolationScope(isolationScope => {
        const req: unknown = args[0];
        const currentScope = getCurrentScope();

        let spanName: string;
        let spanSource: TransactionSource;

        if (req instanceof Request) {
          isolationScope.setSDKProcessingMetadata({
            request: winterCGRequestToRequestData(req),
          });
          spanName = `middleware ${req.method} ${new URL(req.url).pathname}`;
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
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.wrapMiddlewareWithSentry',
            },
          },
          () => {
            return handleCallbackErrors(
              () => wrappingTarget.apply(thisArg, args),
              error => {
                captureException(error, {
                  mechanism: {
                    type: 'instrument',
                    handled: false,
                  },
                });
              },
              () => {
                vercelWaitUntil(flushSafelyWithTimeout());
              },
            );
          },
        );
      });
    },
  });
}
