import { addTracingExtensions, captureException, flush, getCurrentHub, runWithAsyncContext, trace } from '@sentry/core';
import { tracingContextFromHeaders, winterCGRequestToRequestData } from '@sentry/utils';

import { isRedirectNavigationError } from './nextNavigationErrorUtils';
import type { RouteHandlerContext } from './types';
import { platformSupportsStreaming } from './utils/platformSupportsStreaming';

/**
 * Wraps a Next.js route handler with performance and error instrumentation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapRouteHandlerWithSentry<F extends (...args: any[]) => any>(
  routeHandler: F,
  context: RouteHandlerContext,
): (...args: Parameters<F>) => ReturnType<F> extends Promise<unknown> ? ReturnType<F> : Promise<ReturnType<F>> {
  addTracingExtensions();
  // eslint-disable-next-line deprecation/deprecation
  const { method, parameterizedRoute, baggageHeader, sentryTraceHeader, hasStaticBehaviour } = context;
  return new Proxy(routeHandler, {
    apply: (originalFunction, thisArg, args) => {
      return runWithAsyncContext(async () => {
        const hub = getCurrentHub();
        const currentScope = hub.getScope();

        let req: Request | undefined;
        // We are not allowed to access the Request object when a route has static behavious. Otherwise Next.js will throw.
        if (args[0] instanceof Request && !hasStaticBehaviour) {
          req = args[0];
        }

        const { traceparentData, dynamicSamplingContext, propagationContext } = tracingContextFromHeaders(
          sentryTraceHeader ?? req?.headers.get('sentry-trace') ?? undefined,
          baggageHeader ?? req?.headers.get('baggage') ?? undefined,
        );
        currentScope.setPropagationContext(propagationContext);

        let res;
        try {
          res = await trace(
            {
              op: 'http.server',
              name: `${method} ${parameterizedRoute}`,
              status: 'ok',
              ...traceparentData,
              metadata: {
                request: req ? winterCGRequestToRequestData(req) : undefined,
                source: 'route',
                dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
              },
            },
            async span => {
              const response: Response = await originalFunction.apply(thisArg, args);

              try {
                span?.setHttpStatus(response.status);
              } catch {
                // best effort
              }

              return response;
            },
            error => {
              // Next.js throws errors when calling `redirect()`. We don't wanna report these.
              if (!isRedirectNavigationError(error)) {
                captureException(error, {
                  mechanism: {
                    handled: false,
                  },
                });
              }
            },
          );
        } finally {
          if (!platformSupportsStreaming() || process.env.NEXT_RUNTIME === 'edge') {
            // 1. Edge tranpsort requires manual flushing
            // 2. Lambdas require manual flushing to prevent execution freeze before the event is sent
            await flush(1000);
          }
        }

        return res;
      });
    },
  });
}
