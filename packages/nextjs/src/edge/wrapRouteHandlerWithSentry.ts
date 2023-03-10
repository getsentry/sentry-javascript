import { getCurrentHub } from '@sentry/core';

import type { RouteHandlerContext } from '../common/types';
import { wrapRequestHandlerLikeFunctionWithErrorInstrumentation } from '../common/wrapRequestHandlerLikeFunctionWithErrorInstrumentation';
import { wrapRequestHandlerLikeFunctionWithPerformanceInstrumentation } from '../common/wrapRequestHandlerLikeFunctionWithPerformanceInstrumentation';

type RouteHandlerArgs = [Request | undefined, { params?: Record<string, string> } | undefined];

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
export function wrapRouteHandlerWithSentry<F extends (...args: RouteHandlerArgs) => unknown>(
  routeHandler: F,
  context: RouteHandlerContext,
): F {
  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args: Parameters<F>) => {
      const errorWrappedFunction = wrapRequestHandlerLikeFunctionWithErrorInstrumentation(originalFunction, () => ({
        wrappingTargetName: context.method,
      }));

      const req = args[0];
      const routeConfiguration = args[1];

      const sendDefaultPiiOption = getCurrentHub().getClient()?.getOptions().sendDefaultPii;
      let routeParameters: Record<string, string> = {};

      if (sendDefaultPiiOption && routeConfiguration?.params) {
        routeParameters = routeConfiguration?.params;
      }

      let requestBaggageHeader: string | null;
      let requestSentryTraceHeader: string | null;

      try {
        if (req instanceof Request) {
          requestBaggageHeader = req.headers.get('baggage');
          requestSentryTraceHeader = req.headers.get('sentry-trace');
        }
      } catch (e) {
        // This crashes on the edge runtime - at least at the time when this was written, which was during app dir alpha
      }

      const errorAndPerformanceWrappedFunction = wrapRequestHandlerLikeFunctionWithPerformanceInstrumentation(
        errorWrappedFunction,
        {
          wrapperContextExtractor: () => ({
            requestContextObject: req,
            // Use context if available, fall back to request.headers
            baggageHeader: context.baggageHeader || requestBaggageHeader,
            sentryTraceHeader: context.sentryTraceHeader || requestSentryTraceHeader,
          }),
          spanInfoCreator: ({ willCreateTransaction }) => {
            if (willCreateTransaction) {
              return {
                name: `${context.method} ${context.parameterizedRoute}`,
                op: 'http.server',
                data: {
                  routeParameters,
                },
              };
            } else {
              return {
                name: `${context.method}()`,
                op: 'function',
                data: {
                  route: context.parameterizedRoute,
                },
              };
            }
          },
        },
      );

      const { returnValue } = errorAndPerformanceWrappedFunction.apply(thisArg, args);
      return returnValue;
    },
  });
}
