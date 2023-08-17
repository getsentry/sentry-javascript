import { addTracingExtensions, captureException, flush, getCurrentHub, runWithAsyncContext, trace } from '@sentry/core';
import { RouteHandlerContext } from './types';
import { tracingContextFromHeaders } from '@sentry/utils';

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

        console.log({ traceparentData, baggageHeader, sentryTraceHeader });

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
          async () => {
            return originalFunction.apply(thisArg, args);
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
