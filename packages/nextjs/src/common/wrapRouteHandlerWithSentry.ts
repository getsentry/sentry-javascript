import { addTracingExtensions, captureException, getCurrentHub, runWithAsyncContext, trace } from '@sentry/core';
import { isThenable, tracingContextFromHeaders } from '@sentry/utils';

import type { RouteHandlerContext } from './types';

/**
 * Wraps a Next.js route handler with performance and error instrumentation.
 */
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): F {
  addTracingExtensions();

  const { method, parameterizedRoute, baggageHeader, sentryTraceHeader } = context;

  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return runWithAsyncContext(() => {
        const hub = getCurrentHub();
        const currentScope = hub.getScope();

        const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
          sentryTraceHeader,
          baggageHeader,
        );
        currentScope.setPropagationContext(propagationContext);

        const res = trace(
          {
            op: 'http.server',
            name: `${method} ${parameterizedRoute}`,
            status: 'ok',
            ...traceparentData,
            metadata: {
              source: 'route',
              dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
            },
          },
          span => {
            const maybePromiseResponse = originalFunction.apply(thisArg, args);

            const setSpanStatus = (response: Response): void => {
              try {
                span?.setHttpStatus(response.status);
              } catch {
                // best effort
              }
            };

            if (isThenable(maybePromiseResponse)) {
              return maybePromiseResponse.then(response => {
                setSpanStatus(response);
                return response;
              });
            } else {
              setSpanStatus(maybePromiseResponse);
              return maybePromiseResponse;
            }
          },
          error => {
            captureException(error);
          },
        );

        return res;
      });
    },
  });
}
