import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  captureException,
  handleCallbackErrors,
  setHttpStatus,
  startSpan,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { propagationContextFromHeaders, vercelWaitUntil, winterCGHeadersToDict } from '@sentry/utils';
import { isNotFoundNavigationError, isRedirectNavigationError } from './nextNavigationErrorUtils';
import type { RouteHandlerContext } from './types';
import { flushSafelyWithTimeout } from './utils/responseEnd';
import {
  commonObjectToIsolationScope,
  commonObjectToPropagationContext,
  escapeNextjsTracing,
} from './utils/tracingUtils';

/**
 * Wraps a Next.js App Router Route handler with Sentry error and performance instrumentation.
 *
 * NOTICE: This wrapper is for App Router API routes. If you are looking to wrap Pages Router API routes use `wrapApiHandlerWithSentry` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  const { method, parameterizedRoute, headers } = context;

  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return escapeNextjsTracing(() => {
        const isolationScope = commonObjectToIsolationScope(headers);

        const completeHeadersDict: Record<string, string> = headers ? winterCGHeadersToDict(headers) : {};

        isolationScope.setSDKProcessingMetadata({
          request: {
            headers: completeHeadersDict,
          },
        });

        const incomingPropagationContext = propagationContextFromHeaders(
          completeHeadersDict['sentry-trace'],
          completeHeadersDict['baggage'],
        );

        const propagationContext = commonObjectToPropagationContext(headers, incomingPropagationContext);

        return withIsolationScope(isolationScope, () => {
          return withScope(async scope => {
            scope.setTransactionName(`${method} ${parameterizedRoute}`);
            scope.setPropagationContext(propagationContext);
            try {
              return startSpan(
                {
                  name: `${method} ${parameterizedRoute}`,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
                  },
                  forceTransaction: true,
                },
                async span => {
                  const response: Response = await handleCallbackErrors(
                    () => originalFunction.apply(thisArg, args),
                    error => {
                      // Next.js throws errors when calling `redirect()`. We don't wanna report these.
                      if (isRedirectNavigationError(error)) {
                        // Don't do anything
                      } else if (isNotFoundNavigationError(error) && span) {
                        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'not_found' });
                      } else {
                        captureException(error, {
                          mechanism: {
                            handled: false,
                          },
                        });
                      }
                    },
                  );

                  try {
                    if (span && response.status) {
                      setHttpStatus(span, response.status);
                    }
                  } catch {
                    // best effort - response may be undefined?
                  }

                  return response;
                },
              );
            } finally {
              vercelWaitUntil(flushSafelyWithTimeout());
            }
          });
        });
      });
    },
  });
}
