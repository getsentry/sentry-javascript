import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  getActiveSpan,
  getCurrentScope,
  getIsolationScope,
  handleCallbackErrors,
  startSpan,
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
      const req: unknown = args[0];

      let spanName: string;
      let spanOrigin: TransactionSource;

      if (req instanceof Request) {
        getIsolationScope().setSDKProcessingMetadata({
          request: winterCGRequestToRequestData(req),
        });
        spanName = `middleware ${req.method} ${new URL(req.url).pathname}`;
        spanOrigin = 'url';
      } else {
        spanName = 'middleware';
        spanOrigin = 'component';
      }

      getCurrentScope().setTransactionName(spanName);

      // If there is an active span, it likely means that the automatic Next.js OTEL instrumentation worked and we can
      // rely on that for parameterization.
      if (getActiveSpan()) {
        spanName = 'middleware';
        spanOrigin = 'component';
      }

      return startSpan(
        {
          name: spanName,
          op: 'http.server.middleware',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: spanOrigin,
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
    },
  });
}
