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
import { vercelWaitUntil, winterCGRequestToRequestData } from '@sentry/utils';
import { flushSafelyWithTimeout } from '../common/utils/responseEnd';
import type { EdgeRouteHandler } from './types';

/**
 * Wraps a Next.js edge route handler with Sentry error and performance instrumentation.
 */
export function wrapApiHandlerWithSentry<H extends EdgeRouteHandler>(
  handler: H,
  parameterizedRoute: string,
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return new Proxy(handler, {
    apply: async (wrappingTarget, thisArg, args: Parameters<H>) => {
      const req: unknown = args[0];

      if (req instanceof Request) {
        getIsolationScope().setSDKProcessingMetadata({
          request: winterCGRequestToRequestData(req),
        });
        getCurrentScope().setTransactionName(`${req.method} ${parameterizedRoute}`);
      } else {
        getCurrentScope().setTransactionName(`handler (${parameterizedRoute})`);
      }

      let spanName: string;
      let op: string | undefined = 'http.server';

      // If there is an active span, it likely means that the automatic Next.js OTEL instrumentation worked and we can
      // rely on that for parameterization.
      if (getActiveSpan()) {
        spanName = `handler (${parameterizedRoute})`;
        op = undefined;
      } else if (req instanceof Request) {
        spanName = `${req.method} ${parameterizedRoute}`;
      } else {
        spanName = `handler ${parameterizedRoute}`;
      }

      let handlerResult;
      try {
        handlerResult = await startSpan(
          {
            name: spanName,
            op: op,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs.wrapApiHandlerWithSentry',
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
            );
          },
        );
      } finally {
        vercelWaitUntil(flushSafelyWithTimeout());
      }

      return handlerResult;
    },
  });
}
